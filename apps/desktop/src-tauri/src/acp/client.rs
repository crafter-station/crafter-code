//! ACP client using the official agent-client-protocol crate

use agent_client_protocol::{
    Agent, Client, ClientSideConnection,
    // Schema types
    CancelNotification, ClientCapabilities, ContentBlock, CreateTerminalRequest,
    CreateTerminalResponse, FileSystemCapability, Implementation, InitializeRequest,
    KillTerminalCommandRequest, KillTerminalCommandResponse, NewSessionRequest,
    PromptRequest, ReadTextFileRequest, ReadTextFileResponse, ReleaseTerminalRequest,
    ReleaseTerminalResponse, RequestPermissionOutcome, RequestPermissionRequest,
    RequestPermissionResponse, SelectedPermissionOutcome, SessionNotification, SessionUpdate,
    StopReason, TerminalExitStatus, TerminalOutputRequest, TerminalOutputResponse,
    TextContent, WaitForTerminalExitRequest, WaitForTerminalExitResponse, WriteTextFileRequest,
    WriteTextFileResponse, PermissionOptionId,
};
use futures::io::BufReader;
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::process::Child;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use tokio::sync::{mpsc, oneshot};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

/// Global registry for permission response channels
/// Maps worker_id -> oneshot sender for the response
static PERMISSION_CHANNELS: Lazy<Mutex<HashMap<String, oneshot::Sender<String>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Send a permission response from the frontend
pub fn send_permission_response(worker_id: &str, option_id: String) -> Result<(), String> {
    let mut channels = PERMISSION_CHANNELS.lock();
    if let Some(sender) = channels.remove(worker_id) {
        sender.send(option_id).map_err(|_| "Channel closed".to_string())
    } else {
        Err(format!("No pending permission for worker {}", worker_id))
    }
}

/// Our implementation of the ACP Client trait
pub struct CrafterClient {
    app_handle: AppHandle,
    worker_id: String,
    /// Terminal processes spawned via terminal/create
    terminals: Arc<Mutex<HashMap<String, Child>>>,
    /// Accumulated text for the current response
    accumulated_text: Arc<Mutex<String>>,
}

impl CrafterClient {
    pub fn new(app_handle: AppHandle, worker_id: String) -> Self {
        Self {
            app_handle,
            worker_id,
            terminals: Arc::new(Mutex::new(HashMap::new())),
            accumulated_text: Arc::new(Mutex::new(String::new())),
        }
    }

    fn emit_event(&self, event_type: &str, data: serde_json::Value) {
        let event_name = format!("worker-stream-{}", self.worker_id);
        let mut event = serde_json::json!({ "type": event_type });
        if let serde_json::Value::Object(map) = data {
            if let serde_json::Value::Object(ref mut event_map) = event {
                for (k, v) in map {
                    event_map.insert(k, v);
                }
            }
        }
        let payload = serde_json::json!({
            "worker_id": self.worker_id,
            "event": event
        });
        let _ = self.app_handle.emit(&event_name, payload);
    }
}

#[async_trait::async_trait(?Send)]
impl Client for CrafterClient {
    async fn request_permission(
        &self,
        args: RequestPermissionRequest,
    ) -> agent_client_protocol::Result<RequestPermissionResponse> {
        // Log the permission request details
        let title = args.tool_call.fields.title.as_deref().unwrap_or("Permission Request");
        eprintln!("[ACP] Permission request: title={}", title);
        for opt in &args.options {
            eprintln!(
                "[ACP]   Option: id={}, name={:?}, kind={:?}",
                opt.option_id, opt.name, opt.kind
            );
        }

        // Create a channel to wait for the user's response
        let (tx, rx) = oneshot::channel::<String>();

        // Register the channel
        {
            let mut channels = PERMISSION_CHANNELS.lock();
            channels.insert(self.worker_id.clone(), tx);
        }

        // Emit permission request event to frontend
        let event_name = format!("worker-permission-{}", self.worker_id);
        let options: Vec<serde_json::Value> = args
            .options
            .iter()
            .map(|opt| {
                serde_json::json!({
                    "id": opt.option_id.to_string(),
                    "name": opt.name,
                    "kind": format!("{:?}", opt.kind).to_lowercase()
                })
            })
            .collect();

        let _ = self.app_handle.emit(
            &event_name,
            serde_json::json!({
                "worker_id": self.worker_id,
                "title": title,
                "tool_call_id": args.tool_call.tool_call_id.to_string(),
                "options": options
            }),
        );

        eprintln!("[ACP] Waiting for user permission response...");

        // Wait for user response with timeout
        let option_id = match tokio::time::timeout(std::time::Duration::from_secs(300), rx).await {
            Ok(Ok(id)) => {
                eprintln!("[ACP] User selected option: {}", id);
                PermissionOptionId::new(id)
            }
            Ok(Err(_)) => {
                eprintln!("[ACP] Permission channel closed, auto-approving");
                // Channel closed, find default allow option
                args.options
                    .iter()
                    .find(|opt| {
                        matches!(
                            opt.kind,
                            agent_client_protocol::PermissionOptionKind::AllowOnce
                                | agent_client_protocol::PermissionOptionKind::AllowAlways
                        )
                    })
                    .map(|opt| opt.option_id.clone())
                    .unwrap_or_else(|| PermissionOptionId::new("allow_once"))
            }
            Err(_) => {
                eprintln!("[ACP] Permission timeout, auto-approving");
                // Timeout - cleanup and auto-approve
                {
                    let mut channels = PERMISSION_CHANNELS.lock();
                    channels.remove(&self.worker_id);
                }
                args.options
                    .iter()
                    .find(|opt| {
                        matches!(
                            opt.kind,
                            agent_client_protocol::PermissionOptionKind::AllowOnce
                                | agent_client_protocol::PermissionOptionKind::AllowAlways
                        )
                    })
                    .map(|opt| opt.option_id.clone())
                    .unwrap_or_else(|| PermissionOptionId::new("allow_once"))
            }
        };

        Ok(RequestPermissionResponse::new(
            RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(option_id)),
        ))
    }

    async fn session_notification(
        &self,
        args: SessionNotification,
    ) -> agent_client_protocol::Result<()> {
        eprintln!("[ACP] session_notification: {:?}", args.update);

        match args.update {
            SessionUpdate::AgentMessageChunk(chunk) => {
                // ContentBlock::Text is a tuple variant: Text(TextContent)
                if let ContentBlock::Text(text_content) = chunk.content {
                    let text = text_content.text;
                    if !text.is_empty() {
                        {
                            let mut acc = self.accumulated_text.lock();
                            acc.push_str(&text);
                        }
                        self.emit_event("delta", serde_json::json!({ "text": text }));
                    }
                }
            }
            SessionUpdate::AgentThoughtChunk(chunk) => {
                if let ContentBlock::Text(text_content) = chunk.content {
                    let text = text_content.text;
                    eprintln!("[ACP] ThoughtChunk: {}", text);
                    self.emit_event("thinking", serde_json::json!({ "text": text }));
                }
            }
            SessionUpdate::ToolCall(tool_call) => {
                let event_name = format!("worker-tool-{}", self.worker_id);

                // Convert content from ToolCall
                let content: Vec<serde_json::Value> = tool_call
                    .content
                    .iter()
                    .map(|c| {
                        match c {
                            agent_client_protocol::ToolCallContent::Content(content) => {
                                if let ContentBlock::Text(text_content) = &content.content {
                                    serde_json::json!({
                                        "type": "text",
                                        "text": text_content.text
                                    })
                                } else {
                                    serde_json::json!({
                                        "type": "content",
                                        "text": format!("{:?}", content.content)
                                    })
                                }
                            }
                            agent_client_protocol::ToolCallContent::Diff(diff) => {
                                serde_json::json!({
                                    "type": "diff",
                                    "path": diff.path,
                                    "old_text": diff.old_text,
                                    "new_text": diff.new_text
                                })
                            }
                            agent_client_protocol::ToolCallContent::Terminal(term) => {
                                serde_json::json!({
                                    "type": "terminal",
                                    "terminal_id": term.terminal_id.to_string()
                                })
                            }
                            _ => {
                                serde_json::json!({
                                    "type": "unknown",
                                    "text": format!("{:?}", c)
                                })
                            }
                        }
                    })
                    .collect();

                let _ = self.app_handle.emit(
                    &event_name,
                    serde_json::json!({
                        "worker_id": self.worker_id,
                        "tool_call_id": tool_call.tool_call_id.to_string(),
                        "title": tool_call.title,
                        "kind": format!("{:?}", tool_call.kind).to_lowercase(),
                        "status": format!("{:?}", tool_call.status).to_lowercase(),
                        "content": content
                    }),
                );
            }
            SessionUpdate::ToolCallUpdate(update) => {
                let event_name = format!("worker-tool-{}", self.worker_id);
                // ToolCallUpdate has nested fields - flatten content for frontend
                let content: Vec<serde_json::Value> = update
                    .fields
                    .content
                    .as_ref()
                    .map(|contents| {
                        contents
                            .iter()
                            .map(|c| {
                                // Extract text from nested Content structure
                                match c {
                                    agent_client_protocol::ToolCallContent::Content(content) => {
                                        if let ContentBlock::Text(text_content) = &content.content {
                                            serde_json::json!({
                                                "type": "text",
                                                "text": text_content.text
                                            })
                                        } else {
                                            serde_json::json!({
                                                "type": "content",
                                                "text": format!("{:?}", content.content)
                                            })
                                        }
                                    }
                                    agent_client_protocol::ToolCallContent::Diff(diff) => {
                                        serde_json::json!({
                                            "type": "diff",
                                            "path": diff.path,
                                            "old_text": diff.old_text,
                                            "new_text": diff.new_text
                                        })
                                    }
                                    agent_client_protocol::ToolCallContent::Terminal(term) => {
                                        serde_json::json!({
                                            "type": "terminal",
                                            "text": term.terminal_id.to_string()
                                        })
                                    }
                                    _ => {
                                        // Handle any future variants
                                        serde_json::json!({
                                            "type": "unknown",
                                            "text": format!("{:?}", c)
                                        })
                                    }
                                }
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                // Build payload, only include content if not empty
                let mut payload = serde_json::json!({
                    "worker_id": self.worker_id,
                    "tool_call_id": update.tool_call_id.to_string(),
                    "status": format!("{:?}", update.fields.status).to_lowercase(),
                    "title": update.fields.title,
                    "kind": update.fields.kind.as_ref().map(|k| format!("{:?}", k).to_lowercase())
                });

                // Only include content if not empty (to avoid overwriting existing content)
                if !content.is_empty() {
                    payload["content"] = serde_json::json!(content);
                }

                let _ = self.app_handle.emit(&event_name, payload);
            }
            SessionUpdate::Plan(plan) => {
                // Plan has entries: Vec<PlanEntry>, not title/content
                // Serialize the entries for the UI
                let entries: Vec<serde_json::Value> = plan
                    .entries
                    .iter()
                    .map(|e| {
                        serde_json::json!({
                            "content": e.content,
                            "priority": format!("{:?}", e.priority).to_lowercase(),
                            "status": format!("{:?}", e.status).to_lowercase()
                        })
                    })
                    .collect();
                self.emit_event(
                    "plan",
                    serde_json::json!({
                        "entries": entries
                    }),
                );
            }
            SessionUpdate::AvailableCommandsUpdate(cmds) => {
                let event_name = format!("worker-commands-{}", self.worker_id);
                let _ = self.app_handle.emit(
                    &event_name,
                    serde_json::json!({
                        "worker_id": self.worker_id,
                        "commands": cmds.available_commands
                    }),
                );
            }
            SessionUpdate::CurrentModeUpdate(mode) => {
                let event_name = format!("worker-mode-{}", self.worker_id);
                let _ = self.app_handle.emit(
                    &event_name,
                    serde_json::json!({
                        "worker_id": self.worker_id,
                        "mode_id": mode.current_mode_id.to_string()
                    }),
                );
            }
            SessionUpdate::UserMessageChunk(chunk) => {
                // Echo user message chunks back to frontend (for multi-part messages)
                if let ContentBlock::Text(text_content) = chunk.content {
                    let event_name = format!("worker-user-message-{}", self.worker_id);
                    let _ = self.app_handle.emit(
                        &event_name,
                        serde_json::json!({
                            "worker_id": self.worker_id,
                            "text": text_content.text
                        }),
                    );
                }
            }
            _ => {
                // Handle any future variants gracefully
                eprintln!("[ACP] Unhandled session update: {:?}", args.update);
            }
        }

        Ok(())
    }

    async fn read_text_file(
        &self,
        args: ReadTextFileRequest,
    ) -> agent_client_protocol::Result<ReadTextFileResponse> {
        eprintln!(
            "[ACP] fs/read_text_file: path={:?}, line={:?}, limit={:?}",
            args.path, args.line, args.limit
        );

        let content = std::fs::read_to_string(&args.path).map_err(|e| {
            agent_client_protocol::Error::new(-32000, format!("Failed to read file: {}", e))
        })?;

        // Apply line/limit if specified
        let result = match (args.line, args.limit) {
            (Some(start_line), limit) => {
                let lines: Vec<&str> = content.lines().collect();
                let start = (start_line as usize).saturating_sub(1).min(lines.len());
                let end = limit
                    .map(|l| (start + l as usize).min(lines.len()))
                    .unwrap_or(lines.len());
                lines[start..end].join("\n")
            }
            (None, Some(limit)) => content
                .lines()
                .take(limit as usize)
                .collect::<Vec<_>>()
                .join("\n"),
            (None, None) => content,
        };

        Ok(ReadTextFileResponse::new(result))
    }

    async fn write_text_file(
        &self,
        args: WriteTextFileRequest,
    ) -> agent_client_protocol::Result<WriteTextFileResponse> {
        eprintln!(
            "[ACP] fs/write_text_file: path={:?}, content_len={}",
            args.path,
            args.content.len()
        );

        std::fs::write(&args.path, &args.content).map_err(|e| {
            agent_client_protocol::Error::new(-32000, format!("Failed to write file: {}", e))
        })?;

        Ok(WriteTextFileResponse::new())
    }

    async fn create_terminal(
        &self,
        args: CreateTerminalRequest,
    ) -> agent_client_protocol::Result<CreateTerminalResponse> {
        eprintln!(
            "[ACP] terminal/create: command={}, args={:?}, cwd={:?}",
            args.command, args.args, args.cwd
        );

        // Build the full command string
        let full_command = if args.args.is_empty() {
            args.command.clone()
        } else {
            format!("{} {}", args.command, args.args.join(" "))
        };

        // Use shell to execute the command (handles commands like "ls -la" properly)
        let mut cmd = std::process::Command::new("/bin/sh");
        cmd.args(["-c", &full_command]);

        if let Some(cwd) = &args.cwd {
            cmd.current_dir(cwd);
        }
        for env_var in &args.env {
            cmd.env(&env_var.name, &env_var.value);
        }
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let child = cmd.spawn().map_err(|e| {
            agent_client_protocol::Error::new(-32000, format!("Failed to create terminal: {}", e))
        })?;

        let terminal_id = format!("term_{}", child.id());
        {
            let mut terminals = self.terminals.lock();
            terminals.insert(terminal_id.clone(), child);
        }

        Ok(CreateTerminalResponse::new(terminal_id))
    }

    async fn terminal_output(
        &self,
        args: TerminalOutputRequest,
    ) -> agent_client_protocol::Result<TerminalOutputResponse> {
        eprintln!("[ACP] terminal/output: terminalId={}", args.terminal_id);

        let mut terminals = self.terminals.lock();
        let child = terminals
            .get_mut(args.terminal_id.0.as_ref())
            .ok_or_else(|| agent_client_protocol::Error::new(-32000, "Terminal not found"))?;

        let mut output = String::new();
        let mut exit_status = None;

        // Try to read stdout
        if let Some(ref mut stdout) = child.stdout {
            use std::io::Read;
            let mut buf = vec![0u8; 4096];
            if let Ok(n) = stdout.read(&mut buf) {
                if n > 0 {
                    output.push_str(&String::from_utf8_lossy(&buf[..n]));
                }
            }
        }

        // Check if process has exited
        if let Ok(Some(status)) = child.try_wait() {
            exit_status =
                Some(TerminalExitStatus::new().exit_code(status.code().map(|c| c as u32)));
        }

        let mut response = TerminalOutputResponse::new(output, false);
        if let Some(status) = exit_status {
            response = response.exit_status(status);
        }

        Ok(response)
    }

    async fn wait_for_terminal_exit(
        &self,
        args: WaitForTerminalExitRequest,
    ) -> agent_client_protocol::Result<WaitForTerminalExitResponse> {
        eprintln!(
            "[ACP] terminal/wait_for_exit: terminalId={}",
            args.terminal_id
        );

        let mut terminals = self.terminals.lock();
        let child = terminals
            .get_mut(args.terminal_id.0.as_ref())
            .ok_or_else(|| agent_client_protocol::Error::new(-32000, "Terminal not found"))?;

        let status = child.wait().map_err(|e| {
            agent_client_protocol::Error::new(-32000, format!("Failed to wait: {}", e))
        })?;

        Ok(WaitForTerminalExitResponse::new(
            TerminalExitStatus::new().exit_code(status.code().map(|c| c as u32)),
        ))
    }

    async fn kill_terminal_command(
        &self,
        args: KillTerminalCommandRequest,
    ) -> agent_client_protocol::Result<KillTerminalCommandResponse> {
        eprintln!("[ACP] terminal/kill: terminalId={}", args.terminal_id);

        let mut terminals = self.terminals.lock();
        if let Some(child) = terminals.get_mut(args.terminal_id.0.as_ref()) {
            let _ = child.kill();
        }

        Ok(KillTerminalCommandResponse::new())
    }

    async fn release_terminal(
        &self,
        args: ReleaseTerminalRequest,
    ) -> agent_client_protocol::Result<ReleaseTerminalResponse> {
        eprintln!("[ACP] terminal/release: terminalId={}", args.terminal_id);

        let mut terminals = self.terminals.lock();
        terminals.remove(args.terminal_id.0.as_ref());

        Ok(ReleaseTerminalResponse::new())
    }
}

// ============================================================================
// High-level ACP Client wrapper
// ============================================================================

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum AcpError {
    SpawnFailed(String),
    InitializeFailed(String),
    SessionFailed(String),
    PromptFailed(String),
    IoError(String),
    ProtocolError(String),
    Cancelled,
}

impl std::fmt::Display for AcpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AcpError::SpawnFailed(e) => write!(f, "Failed to spawn agent: {}", e),
            AcpError::InitializeFailed(e) => write!(f, "Failed to initialize ACP: {}", e),
            AcpError::SessionFailed(e) => write!(f, "Failed to create session: {}", e),
            AcpError::PromptFailed(e) => write!(f, "Prompt failed: {}", e),
            AcpError::IoError(e) => write!(f, "IO error: {}", e),
            AcpError::ProtocolError(e) => write!(f, "Protocol error: {}", e),
            AcpError::Cancelled => write!(f, "Operation cancelled"),
        }
    }
}

impl std::error::Error for AcpError {}

/// ACP client wrapper that manages the connection lifecycle
pub struct AcpClient {
    connection: ClientSideConnection,
    session_id: Option<agent_client_protocol::SessionId>,
    process: tokio::process::Child,
    accumulated_text: Arc<Mutex<String>>,
    app_handle: AppHandle,
    worker_id: String,
}

impl AcpClient {
    /// Spawn a new ACP agent process
    pub async fn spawn(
        command: &str,
        args: &[&str],
        cwd: &str,
        app_handle: AppHandle,
        worker_id: String,
    ) -> Result<Self, AcpError> {
        let mut process = Command::new(command)
            .args(args)
            .current_dir(cwd)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            .spawn()
            .map_err(|e| AcpError::SpawnFailed(format!("{}: {}", command, e)))?;

        let stdin = process
            .stdin
            .take()
            .ok_or_else(|| AcpError::SpawnFailed("Failed to capture stdin".to_string()))?;

        let stdout = process
            .stdout
            .take()
            .ok_or_else(|| AcpError::SpawnFailed("Failed to capture stdout".to_string()))?;

        // Use tokio-util compat layer to convert tokio AsyncRead/Write to futures traits
        let stdin_compat = stdin.compat_write();
        let stdout_compat = stdout.compat();

        // Create our client implementation
        let client = CrafterClient::new(app_handle.clone(), worker_id.clone());
        let accumulated_text = client.accumulated_text.clone();

        // Create the connection using the official crate with futures-compatible streams
        let (connection, io_task) = ClientSideConnection::new(
            client,
            stdin_compat,
            BufReader::new(stdout_compat),
            |fut| {
                tokio::task::spawn_local(fut);
            },
        );

        // Spawn the I/O handler
        tokio::task::spawn_local(async move {
            if let Err(e) = io_task.await {
                eprintln!("[ACP] I/O task error: {:?}", e);
            }
        });

        Ok(Self {
            connection,
            session_id: None,
            process,
            accumulated_text,
            app_handle,
            worker_id,
        })
    }

    /// Initialize the ACP connection
    pub async fn initialize(&self) -> Result<(), AcpError> {
        let init_request = InitializeRequest::new(1.into())
            .client_info(Implementation::new("crafter-code", env!("CARGO_PKG_VERSION")))
            .client_capabilities(
                ClientCapabilities::new()
                    .fs(
                        FileSystemCapability::new()
                            .read_text_file(true)
                            .write_text_file(true),
                    )
                    .terminal(true),
            );

        self.connection
            .initialize(init_request)
            .await
            .map_err(|e: agent_client_protocol::Error| AcpError::InitializeFailed(e.to_string()))?;

        Ok(())
    }

    /// Create a new session
    pub async fn create_session(&mut self, cwd: &str) -> Result<String, AcpError> {
        // NewSessionRequest::new takes cwd as first argument
        let session_response = self
            .connection
            .new_session(NewSessionRequest::new(cwd))
            .await
            .map_err(|e: agent_client_protocol::Error| AcpError::SessionFailed(e.to_string()))?;

        let session_id = session_response.session_id;
        eprintln!("[ACP] Session created: {}", session_id);
        self.session_id = Some(session_id.clone());
        Ok(session_id.to_string())
    }

    /// Send a prompt and wait for completion
    pub async fn prompt(
        &self,
        message: &str,
        cancel_rx: &mut mpsc::Receiver<()>,
    ) -> Result<StopReason, AcpError> {
        let session_id = self
            .session_id
            .clone()
            .ok_or_else(|| AcpError::PromptFailed("No active session".to_string()))?;

        // ContentBlock::Text is a tuple variant that takes TextContent
        let prompt_request = PromptRequest::new(
            session_id.clone(),
            vec![ContentBlock::Text(TextContent::new(message))],
        );

        // Run prompt with cancellation support
        let result = tokio::select! {
            result = self.connection.prompt(prompt_request) => {
                result.map_err(|e: agent_client_protocol::Error| AcpError::PromptFailed(e.to_string()))
            }
            _ = cancel_rx.recv() => {
                // Send cancel notification
                let _ = self.connection.cancel(CancelNotification::new(session_id)).await;
                Err(AcpError::Cancelled)
            }
        };

        // Emit completion event
        let final_text = self.accumulated_text.lock().clone();
        let event_name = format!("worker-stream-{}", self.worker_id);
        let _ = self.app_handle.emit(
            &event_name,
            serde_json::json!({
                "worker_id": self.worker_id,
                "event": {
                    "type": "complete",
                    "output": final_text,
                    "usage": {
                        "input_tokens": 0,
                        "output_tokens": 0
                    }
                }
            }),
        );

        // Clear accumulated text for next prompt
        {
            let mut acc = self.accumulated_text.lock();
            acc.clear();
        }

        result.map(|r| r.stop_reason)
    }

    /// Kill the agent process
    pub async fn kill(&mut self) -> Result<(), AcpError> {
        self.process
            .kill()
            .await
            .map_err(|e| AcpError::IoError(e.to_string()))
    }

    /// Check if process is still running
    #[allow(dead_code)]
    pub fn is_running(&mut self) -> bool {
        match self.process.try_wait() {
            Ok(Some(_)) => false,
            Ok(None) => true,
            Err(_) => false,
        }
    }
}

impl Drop for AcpClient {
    fn drop(&mut self) {
        // Try to kill the process on drop (blocking)
        let _ = self.process.start_kill();
    }
}

/// Convenience function to run a single prompt with an ACP agent
#[allow(dead_code)]
pub async fn run_acp_agent(
    command: &str,
    args: &[&str],
    cwd: &str,
    message: &str,
    app_handle: AppHandle,
    worker_id: String,
    mut cancel_rx: mpsc::Receiver<()>,
) -> Result<StopReason, AcpError> {
    let mut client = AcpClient::spawn(command, args, cwd, app_handle, worker_id).await?;

    client.initialize().await?;
    client.create_session(cwd).await?;

    let result = client.prompt(message, &mut cancel_rx).await;

    // Clean up
    let _ = client.kill().await;

    result
}
