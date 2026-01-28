//! ACP client using the official agent-client-protocol crate

use agent_client_protocol::{
    Agent, Client, ClientSideConnection,
    // Schema types
    AgentCapabilities, AuthenticateRequest, AuthMethod, AuthMethodId,
    CancelNotification, ClientCapabilities, ContentBlock, CreateTerminalRequest,
    CreateTerminalResponse, FileSystemCapability, Implementation, InitializeRequest,
    InitializeResponse, KillTerminalCommandRequest, KillTerminalCommandResponse,
    LoadSessionRequest, NewSessionRequest, PermissionOptionId, PromptRequest,
    ReadTextFileRequest, ReadTextFileResponse, ReleaseTerminalRequest,
    ReleaseTerminalResponse, RequestPermissionOutcome, RequestPermissionRequest,
    RequestPermissionResponse, SelectedPermissionOutcome, SessionModeId, SessionNotification,
    SessionUpdate, SetSessionModeRequest, StopReason, TerminalExitStatus, TerminalOutputRequest,
    TerminalOutputResponse, TextContent, WaitForTerminalExitRequest, WaitForTerminalExitResponse,
    WriteTextFileRequest, WriteTextFileResponse,
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

use crate::acp::swarm::{execute_swarm_command, is_swarm_command, parse_swarm_command};
use crate::inbox::InboxManager;
use crate::tasks::TaskManager;

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
    session_id: String,
    /// Session working directory (default for terminals)
    session_cwd: Arc<Mutex<Option<String>>>,
    /// Terminal processes spawned via terminal/create
    terminals: Arc<Mutex<HashMap<String, Child>>>,
    /// Accumulated text for the current response
    accumulated_text: Arc<Mutex<String>>,
    /// Task manager for swarm coordination
    task_manager: Option<Arc<TaskManager>>,
    /// Inbox manager for swarm coordination
    inbox_manager: Option<Arc<InboxManager>>,
}

impl CrafterClient {
    pub fn new(app_handle: AppHandle, worker_id: String, session_id: String) -> Self {
        Self {
            app_handle,
            worker_id,
            session_id,
            session_cwd: Arc::new(Mutex::new(None)),
            terminals: Arc::new(Mutex::new(HashMap::new())),
            accumulated_text: Arc::new(Mutex::new(String::new())),
            task_manager: None,
            inbox_manager: None,
        }
    }

    /// Set the session's working directory
    pub fn set_session_cwd(&self, cwd: String) {
        *self.session_cwd.lock() = Some(cwd);
    }

    /// Get the session's working directory
    pub fn get_session_cwd(&self) -> Option<String> {
        self.session_cwd.lock().clone()
    }

    /// Set the coordination managers for swarm command support
    pub fn with_coordination(
        mut self,
        task_manager: Arc<TaskManager>,
        inbox_manager: Arc<InboxManager>,
    ) -> Self {
        self.task_manager = Some(task_manager);
        self.inbox_manager = Some(inbox_manager);
        self
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

    /// Handle a swarm command by executing it against TaskManager/InboxManager
    /// and creating a fake terminal that immediately returns the result
    fn handle_swarm_terminal(
        &self,
        command: &str,
    ) -> agent_client_protocol::Result<CreateTerminalResponse> {
        eprintln!("[ACP] Intercepted swarm command: {}", command);

        // Check if we have the coordination managers
        let (task_manager, inbox_manager) = match (&self.task_manager, &self.inbox_manager) {
            (Some(tm), Some(im)) => (tm.clone(), im.clone()),
            _ => {
                return Err(agent_client_protocol::Error::new(
                    -32000,
                    "Swarm coordination not enabled for this session".to_string(),
                ));
            }
        };

        // Parse the swarm command
        let swarm_cmd = match parse_swarm_command(command) {
            Some(cmd) => cmd,
            None => {
                return Err(agent_client_protocol::Error::new(
                    -32000,
                    format!("Failed to parse swarm command: {}", command),
                ));
            }
        };

        // Execute the swarm command
        let result = execute_swarm_command(&swarm_cmd, &task_manager, &inbox_manager, &self.worker_id);

        // Emit swarm activity event to frontend for UI updates
        let _ = self.app_handle.emit(
            "swarm-activity",
            serde_json::json!({
                "worker_id": self.worker_id,
                "session_id": self.session_id,
                "command": command,
                "result": {
                    "success": result.success,
                    "output": result.output,
                    "data": result.data
                },
                "timestamp": chrono::Utc::now().timestamp_millis()
            }),
        );

        // Create a virtual terminal ID for tracking
        // We use a special prefix so we know this is a swarm result
        let _terminal_id = format!("swarm_{}_{}", self.worker_id, chrono::Utc::now().timestamp_millis());

        // Store the result as a "completed" terminal with pre-filled output
        // We'll create a process that just echoes the result
        let output = if result.success {
            result.to_json()
        } else {
            format!("Error: {}", result.output)
        };

        // Create a simple echo process that outputs the result
        let mut cmd = std::process::Command::new("/bin/sh");
        cmd.args(["-c", &format!("echo '{}'", output.replace('\'', "'\"'\"'"))]);
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let child = cmd.spawn().map_err(|e| {
            agent_client_protocol::Error::new(-32000, format!("Failed to create swarm terminal: {}", e))
        })?;

        let actual_terminal_id = format!("term_{}", child.id());
        {
            let mut terminals = self.terminals.lock();
            terminals.insert(actual_terminal_id.clone(), child);
        }

        eprintln!("[ACP] Swarm command result: success={}, output={}", result.success, result.output);

        Ok(CreateTerminalResponse::new(actual_terminal_id))
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

                // Extract raw_input for plan mode and other metadata
                let raw_input = tool_call.raw_input.as_ref().map(|v| v.clone());

                let _ = self.app_handle.emit(
                    &event_name,
                    serde_json::json!({
                        "worker_id": self.worker_id,
                        "tool_call_id": tool_call.tool_call_id.to_string(),
                        "title": tool_call.title,
                        "kind": format!("{:?}", tool_call.kind).to_lowercase(),
                        "status": format!("{:?}", tool_call.status).to_lowercase(),
                        "content": content,
                        "raw_input": raw_input
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

                // Include raw_input if available (for plan mode, etc.)
                if let Some(raw_input) = &update.fields.raw_input {
                    payload["raw_input"] = raw_input.clone();
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

        // INTERCEPT: Check for swarm commands
        if is_swarm_command(&full_command) {
            return self.handle_swarm_terminal(&full_command);
        }

        // Use shell to execute the command (handles commands like "ls -la" properly)
        let mut cmd = std::process::Command::new("/bin/sh");
        cmd.args(["-c", &full_command]);

        // Use request's cwd, or fall back to session's cwd
        let effective_cwd: Option<std::path::PathBuf> = args.cwd.clone().or_else(|| {
            self.get_session_cwd().map(std::path::PathBuf::from)
        });
        if let Some(cwd) = &effective_cwd {
            eprintln!("[ACP] terminal using cwd: {}", cwd.display());
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

        // Emit terminal created event for frontend tracking
        let _ = self.app_handle.emit(
            "terminal-created",
            serde_json::json!({
                "terminal_id": terminal_id,
                "session_id": self.session_id,
                "worker_id": self.worker_id,
                "command": args.command,
                "args": args.args,
                "cwd": args.cwd,
                "running": true,
                "timestamp": chrono::Utc::now().timestamp_millis()
            }),
        );

        Ok(CreateTerminalResponse::new(terminal_id))
    }

    async fn terminal_output(
        &self,
        args: TerminalOutputRequest,
    ) -> agent_client_protocol::Result<TerminalOutputResponse> {
        eprintln!("[ACP] terminal/output: terminalId={}", args.terminal_id);

        let terminal_id_str = args.terminal_id.0.as_ref().to_string();
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
        let is_running = match child.try_wait() {
            Ok(Some(status)) => {
                exit_status =
                    Some(TerminalExitStatus::new().exit_code(status.code().map(|c| c as u32)));
                false
            }
            Ok(None) => true,
            Err(_) => false,
        };

        // Emit terminal output event for frontend tracking
        let _ = self.app_handle.emit(
            "terminal-output",
            serde_json::json!({
                "terminal_id": terminal_id_str,
                "session_id": self.session_id,
                "output": output,
                "running": is_running,
                "exit_code": exit_status.as_ref().and_then(|s| s.exit_code),
                "timestamp": chrono::Utc::now().timestamp_millis()
            }),
        );

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

        let terminal_id_str = args.terminal_id.0.as_ref().to_string();
        let mut terminals = self.terminals.lock();
        let child = terminals
            .get_mut(args.terminal_id.0.as_ref())
            .ok_or_else(|| agent_client_protocol::Error::new(-32000, "Terminal not found"))?;

        let status = child.wait().map_err(|e| {
            agent_client_protocol::Error::new(-32000, format!("Failed to wait: {}", e))
        })?;

        let exit_code = status.code().map(|c| c as u32);

        // Emit terminal exited event for frontend tracking
        let _ = self.app_handle.emit(
            "terminal-exited",
            serde_json::json!({
                "terminal_id": terminal_id_str,
                "session_id": self.session_id,
                "exit_code": exit_code,
                "running": false,
                "timestamp": chrono::Utc::now().timestamp_millis()
            }),
        );

        Ok(WaitForTerminalExitResponse::new(
            TerminalExitStatus::new().exit_code(exit_code),
        ))
    }

    async fn kill_terminal_command(
        &self,
        args: KillTerminalCommandRequest,
    ) -> agent_client_protocol::Result<KillTerminalCommandResponse> {
        eprintln!("[ACP] terminal/kill: terminalId={}", args.terminal_id);

        let terminal_id_str = args.terminal_id.0.as_ref().to_string();
        let mut terminals = self.terminals.lock();
        if let Some(child) = terminals.get_mut(args.terminal_id.0.as_ref()) {
            let _ = child.kill();
        }

        // Emit terminal killed event for frontend tracking
        let _ = self.app_handle.emit(
            "terminal-killed",
            serde_json::json!({
                "terminal_id": terminal_id_str,
                "session_id": self.session_id,
                "running": false,
                "timestamp": chrono::Utc::now().timestamp_millis()
            }),
        );

        Ok(KillTerminalCommandResponse::new())
    }

    async fn release_terminal(
        &self,
        args: ReleaseTerminalRequest,
    ) -> agent_client_protocol::Result<ReleaseTerminalResponse> {
        eprintln!("[ACP] terminal/release: terminalId={}", args.terminal_id);

        let terminal_id_str = args.terminal_id.0.as_ref().to_string();
        let mut terminals = self.terminals.lock();
        terminals.remove(args.terminal_id.0.as_ref());

        // Emit terminal released event for frontend tracking
        let _ = self.app_handle.emit(
            "terminal-released",
            serde_json::json!({
                "terminal_id": terminal_id_str,
                "session_id": self.session_id,
                "timestamp": chrono::Utc::now().timestamp_millis()
            }),
        );

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
    acp_session_id: Option<agent_client_protocol::SessionId>,
    process: tokio::process::Child,
    accumulated_text: Arc<Mutex<String>>,
    /// Shared session cwd (for terminal commands to use)
    session_cwd: Arc<Mutex<Option<String>>>,
    app_handle: AppHandle,
    worker_id: String,
    #[allow(dead_code)]
    session_id: String,
    /// Authentication methods supported by the agent (from InitializeResponse)
    auth_methods: Vec<AuthMethod>,
    /// Whether the client has successfully authenticated
    is_authenticated: bool,
    /// Agent capabilities (from InitializeResponse)
    agent_capabilities: Option<AgentCapabilities>,
}

impl AcpClient {
    /// Spawn a new ACP agent process
    pub async fn spawn(
        command: &str,
        args: &[&str],
        cwd: &str,
        env_vars: &[String],
        app_handle: AppHandle,
        worker_id: String,
        session_id: String,
        task_manager: Option<Arc<TaskManager>>,
        inbox_manager: Option<Arc<InboxManager>>,
    ) -> Result<Self, AcpError> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .current_dir(cwd)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit())
            // Inherit ALL environment variables from parent process
            .envs(std::env::vars());

        let mut process = cmd
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

        // Create our client implementation with coordination support
        let mut client = CrafterClient::new(app_handle.clone(), worker_id.clone(), session_id.clone());

        // Enable swarm coordination if managers are provided
        if let (Some(tm), Some(im)) = (task_manager, inbox_manager) {
            client = client.with_coordination(tm, im);
        }

        // Extract Arcs before moving client into connection
        let accumulated_text = client.accumulated_text.clone();
        let session_cwd = client.session_cwd.clone();

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
            acp_session_id: None,
            process,
            accumulated_text,
            session_cwd,
            app_handle,
            worker_id,
            session_id,
            auth_methods: Vec::new(),
            is_authenticated: false,
            agent_capabilities: None,
        })
    }

    /// Initialize the ACP connection
    pub async fn initialize(&mut self) -> Result<InitializeResponse, AcpError> {
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

        let response = self.connection
            .initialize(init_request)
            .await
            .map_err(|e: agent_client_protocol::Error| AcpError::InitializeFailed(e.to_string()))?;

        // Store auth methods and capabilities from response
        self.auth_methods = response.auth_methods.clone();
        self.agent_capabilities = Some(response.agent_capabilities.clone());

        // If no auth methods required, mark as authenticated
        if self.auth_methods.is_empty() {
            self.is_authenticated = true;
        }

        Ok(response)
    }

    /// Authenticate with the agent using the specified method
    pub async fn authenticate(&mut self, method_id: &str) -> Result<(), AcpError> {
        let request = AuthenticateRequest::new(AuthMethodId::new(method_id));
        self.connection
            .authenticate(request)
            .await
            .map_err(|e| AcpError::ProtocolError(format!("Authentication failed: {}", e)))?;
        self.is_authenticated = true;
        eprintln!("[ACP] Authenticated with method: {}", method_id);
        Ok(())
    }

    /// Check if authentication is required but not yet completed
    pub fn requires_authentication(&self) -> bool {
        !self.auth_methods.is_empty() && !self.is_authenticated
    }

    /// Get the available authentication methods
    pub fn get_auth_methods(&self) -> &[AuthMethod] {
        &self.auth_methods
    }

    /// Mark as authenticated (for manual login methods where we skip programmatic auth)
    pub fn mark_authenticated(&mut self) {
        self.is_authenticated = true;
    }

    /// Check if the agent supports loading sessions
    pub fn supports_load_session(&self) -> bool {
        self.agent_capabilities
            .as_ref()
            .map(|caps| caps.load_session)
            .unwrap_or(false)
    }

    /// Check if the agent supports image content in prompts
    pub fn supports_image(&self) -> bool {
        self.agent_capabilities
            .as_ref()
            .map(|caps| caps.prompt_capabilities.image)
            .unwrap_or(false)
    }

    /// Check if the agent supports embedded context in prompts
    pub fn supports_embedded_context(&self) -> bool {
        self.agent_capabilities
            .as_ref()
            .map(|caps| caps.prompt_capabilities.embedded_context)
            .unwrap_or(false)
    }

    /// Get the agent's prompt capabilities (image, audio, embedded_context)
    pub fn get_prompt_capabilities(&self) -> (bool, bool, bool) {
        self.agent_capabilities
            .as_ref()
            .map(|caps| (
                caps.prompt_capabilities.image,
                caps.prompt_capabilities.audio,
                caps.prompt_capabilities.embedded_context,
            ))
            .unwrap_or((false, false, false))
    }

    /// Load an existing session (requires loadSession capability)
    pub async fn load_acp_session(&mut self, session_id: String, cwd: String) -> Result<String, AcpError> {
        if !self.supports_load_session() {
            return Err(AcpError::ProtocolError(
                "Agent does not support loadSession capability".to_string(),
            ));
        }

        eprintln!("[AcpClient::load_acp_session] Loading session {} with cwd: {}", session_id, cwd);

        // Store the cwd for terminal commands to use as fallback
        *self.session_cwd.lock() = Some(cwd.clone());

        // Clone session_id before moving it into the request
        let session_id_for_return = session_id.clone();

        let request = LoadSessionRequest::new(
            agent_client_protocol::SessionId::new(session_id),
            cwd.clone(),
        );
        self.connection
            .load_session(request)
            .await
            .map_err(|e: agent_client_protocol::Error| AcpError::SessionFailed(e.to_string()))?;

        let acp_session_id = agent_client_protocol::SessionId::new(session_id_for_return.clone());
        eprintln!("[ACP] Session loaded: {} with cwd: {}", acp_session_id, cwd);
        self.acp_session_id = Some(acp_session_id);
        Ok(session_id_for_return)
    }

    /// Create a new session
    pub async fn create_acp_session(&mut self, cwd: &str) -> Result<String, AcpError> {
        eprintln!("[AcpClient::create_acp_session] Creating session with cwd: {}", cwd);

        // Store the cwd for terminal commands to use as fallback
        *self.session_cwd.lock() = Some(cwd.to_string());

        let session_response = self
            .connection
            .new_session(NewSessionRequest::new(cwd))
            .await
            .map_err(|e: agent_client_protocol::Error| AcpError::SessionFailed(e.to_string()))?;

        let acp_session_id = session_response.session_id;
        eprintln!("[ACP] ACP Session created: {} with cwd: {}", acp_session_id, cwd);
        self.acp_session_id = Some(acp_session_id.clone());
        Ok(acp_session_id.to_string())
    }

    /// Send a prompt and wait for completion
    pub async fn prompt(
        &self,
        message: &str,
        cancel_rx: &mut mpsc::Receiver<()>,
    ) -> Result<StopReason, AcpError> {
        // Wrap text in ContentBlock and delegate to prompt_with_content
        self.prompt_with_content(
            vec![ContentBlock::Text(TextContent::new(message))],
            cancel_rx,
        ).await
    }

    /// Send a prompt with arbitrary content blocks (text, images, etc.)
    pub async fn prompt_with_content(
        &self,
        content: Vec<ContentBlock>,
        cancel_rx: &mut mpsc::Receiver<()>,
    ) -> Result<StopReason, AcpError> {
        let acp_session_id = self
            .acp_session_id
            .clone()
            .ok_or_else(|| AcpError::PromptFailed("No active ACP session".to_string()))?;

        let prompt_request = PromptRequest::new(acp_session_id.clone(), content);

        // Run prompt with cancellation support
        let result = tokio::select! {
            result = self.connection.prompt(prompt_request) => {
                result.map_err(|e: agent_client_protocol::Error| AcpError::PromptFailed(e.to_string()))
            }
            _ = cancel_rx.recv() => {
                // Send cancel notification
                let _ = self.connection.cancel(CancelNotification::new(acp_session_id)).await;
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

    /// Set the session mode (e.g., "plan", "normal", "code")
    /// Uses the official ACP session/set_mode method
    pub async fn set_mode(&self, mode_id: &str) -> Result<(), AcpError> {
        let acp_session_id = self
            .acp_session_id
            .clone()
            .ok_or_else(|| AcpError::PromptFailed("No active ACP session".to_string()))?;

        let request = SetSessionModeRequest::new(acp_session_id, SessionModeId::new(mode_id));

        self.connection
            .set_session_mode(request)
            .await
            .map_err(|e: agent_client_protocol::Error| {
                AcpError::ProtocolError(format!("Failed to set mode: {}", e))
            })?;

        eprintln!("[ACP] Session mode set to: {}", mode_id);

        // Emit mode change event to frontend
        let event_name = format!("worker-mode-{}", self.worker_id);
        let _ = self.app_handle.emit(
            &event_name,
            serde_json::json!({
                "worker_id": self.worker_id,
                "mode_id": mode_id
            }),
        );

        Ok(())
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
    env_vars: &[String],
    message: &str,
    app_handle: AppHandle,
    worker_id: String,
    session_id: String,
    mut cancel_rx: mpsc::Receiver<()>,
) -> Result<StopReason, AcpError> {
    let mut client = AcpClient::spawn(
        command,
        args,
        cwd,
        env_vars,
        app_handle,
        worker_id,
        session_id,
        None, // No coordination for convenience function
        None,
    ).await?;

    client.initialize().await?;
    client.create_acp_session(cwd).await?;

    let result = client.prompt(message, &mut cancel_rx).await;

    // Clean up
    let _ = client.kill().await;

    result
}
