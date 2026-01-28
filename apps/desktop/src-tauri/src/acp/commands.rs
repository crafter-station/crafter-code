//! Tauri commands for ACP-based agent orchestration

use agent_client_protocol::{ContentBlock, ImageContent, TextContent};
use crate::acp::client::{send_permission_response, AcpClient, AcpError};
use crate::acp::coordination_prompt::build_coordination_prompt;
use crate::acp::registry::{get_agent, list_all_agents, AgentConfig};
use crate::acp::session_store::{PersistedMessage, PersistedSession, PersistedSessionSummary, SessionStore};
use crate::claude::pricing::Model;
use crate::inbox::InboxManager;
use crate::orchestrator::session::{OrchestratorSession, SessionStatus};
use crate::orchestrator::worker::{WorkerSession, WorkerStatus};
use crate::tasks::TaskManager;
use crate::AppState;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{mpsc, oneshot};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpSessionResponse {
    pub session: OrchestratorSession,
}

/// Image attachment for prompts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageAttachment {
    /// Base64-encoded image data
    pub data: String,
    /// MIME type (e.g., "image/png", "image/jpeg")
    pub mime_type: String,
}

/// Commands that can be sent to a persistent worker thread
#[derive(Debug)]
pub enum WorkerCommand {
    /// Send a prompt to the agent (text only)
    Prompt {
        message: String,
        /// Channel to signal completion
        done_tx: oneshot::Sender<Result<(), String>>,
    },
    /// Send a prompt with images to the agent
    PromptWithImages {
        message: String,
        images: Vec<ImageAttachment>,
        /// Channel to signal completion
        done_tx: oneshot::Sender<Result<(), String>>,
    },
    /// Set the session mode (e.g., "plan", "normal")
    SetMode {
        mode_id: String,
        /// Channel to signal completion
        done_tx: oneshot::Sender<Result<(), String>>,
    },
    /// Authenticate with the agent
    Authenticate {
        method_id: String,
        /// Channel to signal completion
        done_tx: oneshot::Sender<Result<(), String>>,
    },
    /// Cancel the current operation
    Cancel,
    /// Stop the worker thread entirely
    Stop,
}

/// Handle to communicate with a persistent worker thread
pub struct WorkerHandle {
    pub command_tx: mpsc::Sender<WorkerCommand>,
}

/// List all known CLI agents (available field indicates if installed)
#[tauri::command]
pub fn list_available_agents() -> Vec<AgentConfig> {
    list_all_agents()
}

/// Create a new ACP-based orchestrator session
#[tauri::command]
pub async fn create_acp_session(
    prompt: String,
    agent_id: String,
    cwd: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<AcpSessionResponse, String> {
    eprintln!("[ACP Command] create_acp_session called with:");
    eprintln!("  prompt: {}", prompt);
    eprintln!("  agent_id: {}", agent_id);
    eprintln!("  cwd: {}", cwd);

    // Get the agent config
    let agent = get_agent(&agent_id)
        .ok_or_else(|| format!("Agent '{}' not found or not available", agent_id))?;

    // Create the orchestrator session
    let session = {
        let mut mgr = state.orchestrator_manager.lock();
        mgr.create_session(prompt.clone(), Model::Opus)
    };

    let session_id = session.id.clone();

    // Emit session created event
    let _ = app_handle.emit(
        "orchestrator-session-created",
        serde_json::json!({
            "session_id": session_id,
            "status": "planning",
            "agent": agent_id
        }),
    );

    // Create a single worker for the agent
    let worker = WorkerSession::new(
        Uuid::new_v4().to_string(),
        session_id.clone(),
        prompt.clone(),
        Model::Opus,
    );

    let worker_id = worker.id.clone();

    // Add worker to session
    {
        let mut mgr = state.orchestrator_manager.lock();
        mgr.add_worker_to_session(&session_id, worker.clone());
        mgr.update_session_status(&session_id, SessionStatus::Running);
    }

    // Create command channel for the persistent worker
    let (command_tx, command_rx) = mpsc::channel::<WorkerCommand>(32);

    // Store the worker handle
    {
        let mut handles = state.worker_handles.lock();
        handles.insert(session_id.clone(), WorkerHandle { command_tx: command_tx.clone() });
    }

    // Get or create task and inbox managers for this session
    let task_manager = state
        .get_task_manager(&session_id)
        .map_err(|e| format!("Failed to get task manager: {}", e))?;
    let inbox_manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| format!("Failed to get inbox manager: {}", e))?;

    // Clone for thread
    let manager = state.orchestrator_manager.clone();
    let session_id_clone = session_id.clone();
    let worker_id_clone = worker_id.clone();
    let app_handle_clone = app_handle.clone();
    let initial_prompt = prompt.clone();

    // Spawn a PERSISTENT worker thread that handles all prompts for this session
    thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime");

        let local_set = tokio::task::LocalSet::new();

        local_set.block_on(&rt, async move {
            run_persistent_worker(
                agent,
                cwd,
                session_id_clone,
                worker_id_clone,
                app_handle_clone,
                manager,
                command_rx,
                initial_prompt,
                task_manager,
                inbox_manager,
            )
            .await;
        });
    });

    // Return the session
    let session = {
        let mgr = state.orchestrator_manager.lock();
        mgr.get_session(&session_id).cloned()
    };

    match session {
        Some(s) => Ok(AcpSessionResponse { session: s }),
        None => Err("Session not found after creation".to_string()),
    }
}

/// Send a follow-up prompt to an existing ACP session
#[tauri::command]
pub async fn send_acp_prompt(
    session_id: String,
    prompt: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    eprintln!(
        "[ACP] send_acp_prompt called: session={}, prompt={}",
        session_id, prompt
    );

    // Get worker ID from session
    let worker_id = {
        let mgr = state.orchestrator_manager.lock();
        let session = mgr
            .get_session(&session_id)
            .ok_or_else(|| format!("Session '{}' not found", session_id))?;
        session
            .workers
            .first()
            .map(|w| w.id.clone())
            .ok_or_else(|| "No worker in session".to_string())?
    };

    // Get the worker handle
    let command_tx = {
        let handles = state.worker_handles.lock();
        handles
            .get(&session_id)
            .map(|h| h.command_tx.clone())
            .ok_or_else(|| format!("No active worker for session '{}'", session_id))?
    };

    // Update session status to running
    {
        let mut mgr = state.orchestrator_manager.lock();
        mgr.update_session_status(&session_id, SessionStatus::Running);
        mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Running);
    }

    let _ = app_handle.emit(
        "worker-status-change",
        serde_json::json!({
            "session_id": session_id,
            "worker_id": worker_id,
            "status": "running"
        }),
    );

    // Create completion channel
    let (done_tx, done_rx) = oneshot::channel();

    // Send prompt command to the persistent worker
    command_tx
        .send(WorkerCommand::Prompt {
            message: prompt,
            done_tx,
        })
        .await
        .map_err(|_| "Worker thread has stopped".to_string())?;

    // Wait for completion in a background task (don't block the command)
    let session_id_clone = session_id.clone();
    let worker_id_clone = worker_id.clone();
    let app_handle_clone = app_handle.clone();
    let manager = state.orchestrator_manager.clone();

    tokio::spawn(async move {
        match done_rx.await {
            Ok(Ok(())) => {
                // Success - worker already emitted completion event
            }
            Ok(Err(e)) => {
                // Error from worker
                handle_worker_failure(
                    &session_id_clone,
                    &worker_id_clone,
                    e,
                    &app_handle_clone,
                    &manager,
                );
            }
            Err(_) => {
                // Channel closed - worker died
                handle_worker_failure(
                    &session_id_clone,
                    &worker_id_clone,
                    "Worker thread stopped unexpectedly".to_string(),
                    &app_handle_clone,
                    &manager,
                );
            }
        }
    });

    Ok(())
}

/// Send a follow-up prompt with images to an existing ACP session
#[tauri::command]
pub async fn send_acp_prompt_with_images(
    session_id: String,
    prompt: String,
    images: Vec<ImageAttachment>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    eprintln!(
        "[ACP] send_acp_prompt_with_images called: session={}, prompt={}, images={}",
        session_id, prompt, images.len()
    );

    // Get worker ID from session
    let worker_id = {
        let mgr = state.orchestrator_manager.lock();
        let session = mgr
            .get_session(&session_id)
            .ok_or_else(|| format!("Session '{}' not found", session_id))?;
        session
            .workers
            .first()
            .map(|w| w.id.clone())
            .ok_or_else(|| "No worker in session".to_string())?
    };

    // Get the worker handle
    let command_tx = {
        let handles = state.worker_handles.lock();
        handles
            .get(&session_id)
            .map(|h| h.command_tx.clone())
            .ok_or_else(|| format!("No active worker for session '{}'", session_id))?
    };

    // Update session status to running
    {
        let mut mgr = state.orchestrator_manager.lock();
        mgr.update_session_status(&session_id, SessionStatus::Running);
        mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Running);
    }

    let _ = app_handle.emit(
        "worker-status-change",
        serde_json::json!({
            "session_id": session_id,
            "worker_id": worker_id,
            "status": "running"
        }),
    );

    // Create completion channel
    let (done_tx, done_rx) = oneshot::channel();

    // Send prompt with images command to the persistent worker
    command_tx
        .send(WorkerCommand::PromptWithImages {
            message: prompt,
            images,
            done_tx,
        })
        .await
        .map_err(|_| "Worker thread has stopped".to_string())?;

    // Wait for completion in a background task (don't block the command)
    let session_id_clone = session_id.clone();
    let worker_id_clone = worker_id.clone();
    let app_handle_clone = app_handle.clone();
    let manager = state.orchestrator_manager.clone();

    tokio::spawn(async move {
        match done_rx.await {
            Ok(Ok(())) => {
                // Success - worker already emitted completion event
            }
            Ok(Err(e)) => {
                // Error from worker
                handle_worker_failure(
                    &session_id_clone,
                    &worker_id_clone,
                    e,
                    &app_handle_clone,
                    &manager,
                );
            }
            Err(_) => {
                // Channel closed - worker died
                handle_worker_failure(
                    &session_id_clone,
                    &worker_id_clone,
                    "Worker thread stopped unexpectedly".to_string(),
                    &app_handle_clone,
                    &manager,
                );
            }
        }
    });

    Ok(())
}

/// Persistent worker that handles all prompts for a session
async fn run_persistent_worker(
    agent: AgentConfig,
    cwd: String,
    session_id: String,
    worker_id: String,
    app_handle: AppHandle,
    manager: Arc<Mutex<crate::orchestrator::OrchestratorManager>>,
    mut command_rx: mpsc::Receiver<WorkerCommand>,
    initial_prompt: String,
    task_manager: Arc<TaskManager>,
    inbox_manager: Arc<InboxManager>,
) {
    // Register this worker in the inbox manager
    inbox_manager.register_worker(&worker_id);

    // Determine if this is the leader (first worker in session)
    let is_leader = {
        let mgr = manager.lock();
        mgr.get_session(&session_id)
            .map(|s| s.workers.len() == 1)
            .unwrap_or(true)
    };

    // Get current tasks for the coordination prompt
    let current_tasks = task_manager.list();

    // Build coordination context to prepend to the initial prompt
    let coordination_context = build_coordination_prompt(
        &worker_id,
        &session_id,
        is_leader,
        &current_tasks,
    );

    // Combine coordination context with initial prompt
    let full_initial_prompt = format!(
        "{}\n## Your Task\n\n{}",
        coordination_context,
        initial_prompt
    );

    // Update worker status to running
    {
        let mut mgr = manager.lock();
        mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Running);
    }

    let _ = app_handle.emit(
        "worker-status-change",
        serde_json::json!({
            "session_id": session_id,
            "worker_id": worker_id,
            "status": "running",
            "agent": agent.id,
            "is_leader": is_leader
        }),
    );

    // Build args from agent config
    let args: Vec<&str> = agent.args.iter().map(|s| s.as_str()).collect();

    // Spawn the ACP agent with coordination support
    let client_result = AcpClient::spawn(
        &agent.command,
        &args,
        &cwd,
        &agent.env_vars,
        app_handle.clone(),
        worker_id.clone(),
        session_id.clone(),
        Some(task_manager.clone()),
        Some(inbox_manager.clone()),
    ).await;

    let mut client = match client_result {
        Ok(c) => c,
        Err(e) => {
            handle_worker_failure(
                &session_id,
                &worker_id,
                format!("Failed to spawn {}: {}", agent.name, e),
                &app_handle,
                &manager,
            );
            return;
        }
    };

    // Initialize ACP connection
    match client.initialize().await {
        Ok(_init_response) => {
            // Check if authentication is required
            if client.requires_authentication() {
                // Claude Code uses manual login (claude /login) - skip programmatic auth
                if agent.id == "claude" {
                    eprintln!("[ACP] Claude Code detected - skipping programmatic auth (use `claude /login` first)");
                    client.mark_authenticated();
                } else if let Some(first_method) = client.get_auth_methods().first() {
                    // Try programmatic authentication for other agents
                    if let Err(e) = client.authenticate(&first_method.id.to_string()).await {
                        handle_worker_failure(
                            &session_id,
                            &worker_id,
                            format!("Authentication failed for {}: {}", agent.name, e),
                            &app_handle,
                            &manager,
                        );
                        return;
                    }
                }
            }
        }
        Err(e) => {
            handle_worker_failure(
                &session_id,
                &worker_id,
                format!("ACP initialization failed for {}: {}", agent.name, e),
                &app_handle,
                &manager,
            );
            return;
        }
    }

    // Create ACP session
    if let Err(e) = client.create_acp_session(&cwd).await {
        handle_worker_failure(
            &session_id,
            &worker_id,
            format!("Failed to create {} session: {}", agent.name, e),
            &app_handle,
            &manager,
        );
        return;
    }

    // Track cancellation state
    let mut is_cancelled = false;

    // Send initial prompt with coordination context
    {
        let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);

        // Register cancel channel
        {
            let mut mgr = manager.lock();
            mgr.register_worker_cancel(worker_id.clone(), cancel_tx);
        }

        let result = client.prompt(&full_initial_prompt, &mut cancel_rx).await;

        match result {
            Ok(stop_reason) => {
                {
                    let mut mgr = manager.lock();
                    mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Completed);
                    mgr.remove_worker_cancel(&worker_id);
                }

                let _ = app_handle.emit(
                    "worker-status-change",
                    serde_json::json!({
                        "session_id": session_id,
                        "worker_id": worker_id,
                        "status": "completed",
                        "stop_reason": format!("{:?}", stop_reason)
                    }),
                );
            }
            Err(AcpError::Cancelled) => {
                is_cancelled = true;
                let mut mgr = manager.lock();
                mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Cancelled);
                mgr.remove_worker_cancel(&worker_id);

                let _ = app_handle.emit(
                    "worker-status-change",
                    serde_json::json!({
                        "session_id": session_id,
                        "worker_id": worker_id,
                        "status": "cancelled"
                    }),
                );
            }
            Err(e) => {
                handle_worker_failure(&session_id, &worker_id, e.to_string(), &app_handle, &manager);
                return; // Exit worker on error
            }
        }
    }

    // If cancelled, exit the worker
    if is_cancelled {
        return;
    }

    // Main loop: wait for follow-up commands
    eprintln!("[ACP] Worker entering command loop for session={}", session_id);

    while let Some(cmd) = command_rx.recv().await {
        match cmd {
            WorkerCommand::Prompt { message, done_tx } => {
                eprintln!("[ACP] Worker received prompt: {}", message);

                // Update status to running
                {
                    let mut mgr = manager.lock();
                    mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Running);
                }

                // Create cancel channel for this prompt
                let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);
                {
                    let mut mgr = manager.lock();
                    mgr.register_worker_cancel(worker_id.clone(), cancel_tx);
                }

                let result = client.prompt(&message, &mut cancel_rx).await;

                match result {
                    Ok(stop_reason) => {
                        {
                            let mut mgr = manager.lock();
                            mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Completed);
                            mgr.remove_worker_cancel(&worker_id);
                        }

                        let _ = app_handle.emit(
                            "worker-status-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "status": "completed",
                                "stop_reason": format!("{:?}", stop_reason)
                            }),
                        );

                        let _ = done_tx.send(Ok(()));
                    }
                    Err(AcpError::Cancelled) => {
                        {
                            let mut mgr = manager.lock();
                            mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Cancelled);
                            mgr.remove_worker_cancel(&worker_id);
                        }

                        let _ = app_handle.emit(
                            "worker-status-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "status": "cancelled"
                            }),
                        );

                        let _ = done_tx.send(Ok(()));
                        break; // Exit on cancel
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        {
                            let mut mgr = manager.lock();
                            mgr.remove_worker_cancel(&worker_id);
                        }
                        let _ = done_tx.send(Err(error_msg.clone()));

                        // Don't exit - let caller decide
                        handle_worker_failure(&session_id, &worker_id, error_msg, &app_handle, &manager);
                        break; // Exit on error for now
                    }
                }
            }
            WorkerCommand::PromptWithImages { message, images, done_tx } => {
                eprintln!("[ACP] Worker received prompt with {} images: {}", images.len(), message);

                // Update status to running
                {
                    let mut mgr = manager.lock();
                    mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Running);
                }

                // Create cancel channel for this prompt
                let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);
                {
                    let mut mgr = manager.lock();
                    mgr.register_worker_cancel(worker_id.clone(), cancel_tx);
                }

                // Build content blocks: text first, then images
                let mut content: Vec<ContentBlock> = vec![
                    ContentBlock::Text(TextContent::new(&message))
                ];

                // Add image content blocks
                for img in &images {
                    content.push(ContentBlock::Image(ImageContent::new(
                        img.data.clone(),
                        img.mime_type.clone(),
                    )));
                }

                let result = client.prompt_with_content(content, &mut cancel_rx).await;

                match result {
                    Ok(stop_reason) => {
                        {
                            let mut mgr = manager.lock();
                            mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Completed);
                            mgr.remove_worker_cancel(&worker_id);
                        }

                        let _ = app_handle.emit(
                            "worker-status-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "status": "completed",
                                "stop_reason": format!("{:?}", stop_reason)
                            }),
                        );

                        let _ = done_tx.send(Ok(()));
                    }
                    Err(AcpError::Cancelled) => {
                        {
                            let mut mgr = manager.lock();
                            mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Cancelled);
                            mgr.remove_worker_cancel(&worker_id);
                        }

                        let _ = app_handle.emit(
                            "worker-status-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "status": "cancelled"
                            }),
                        );

                        let _ = done_tx.send(Ok(()));
                        break;
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        {
                            let mut mgr = manager.lock();
                            mgr.remove_worker_cancel(&worker_id);
                        }
                        let _ = done_tx.send(Err(error_msg.clone()));
                        handle_worker_failure(&session_id, &worker_id, error_msg, &app_handle, &manager);
                        break;
                    }
                }
            }
            WorkerCommand::SetMode { mode_id, done_tx } => {
                eprintln!("[ACP] Worker received set_mode: {}", mode_id);

                let result = client.set_mode(&mode_id).await;

                match result {
                    Ok(()) => {
                        let _ = app_handle.emit(
                            "worker-mode-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "mode_id": mode_id
                            }),
                        );
                        let _ = done_tx.send(Ok(()));
                    }
                    Err(e) => {
                        let error_msg = format!("Failed to set mode: {}", e);
                        eprintln!("[ACP] {}", error_msg);
                        let _ = done_tx.send(Err(error_msg));
                        // Don't break - mode set failure shouldn't kill the worker
                    }
                }
            }
            WorkerCommand::Authenticate { method_id, done_tx } => {
                eprintln!("[ACP] Worker received authenticate: {}", method_id);

                let result = client.authenticate(&method_id).await;

                match result {
                    Ok(()) => {
                        let _ = app_handle.emit(
                            "worker-authenticated",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "method_id": method_id
                            }),
                        );
                        let _ = done_tx.send(Ok(()));
                    }
                    Err(e) => {
                        let error_msg = format!("Failed to authenticate: {}", e);
                        eprintln!("[ACP] {}", error_msg);
                        let _ = done_tx.send(Err(error_msg));
                        // Don't break - auth failure shouldn't kill the worker
                    }
                }
            }
            WorkerCommand::Cancel => {
                eprintln!("[ACP] Worker received cancel command");
                // Cancellation is handled via the cancel_rx in prompt()
                break;
            }
            WorkerCommand::Stop => {
                eprintln!("[ACP] Worker received stop command");
                break;
            }
        }
    }

    eprintln!("[ACP] Worker thread exiting for session={}", session_id);

    // Clean up
    let _ = client.kill().await;
}

/// Handle worker failure
fn handle_worker_failure(
    session_id: &str,
    worker_id: &str,
    error: String,
    app_handle: &AppHandle,
    manager: &Arc<Mutex<crate::orchestrator::OrchestratorManager>>,
) {
    eprintln!("[ACP] Worker failed: {}", error);

    let mut mgr = manager.lock();
    if let Some(session) = mgr.get_session_mut(session_id) {
        if let Some(worker) = session.get_worker_mut(worker_id) {
            worker.mark_failed(error.clone());
        }
    }
    mgr.remove_worker_cancel(worker_id);

    let _ = app_handle.emit(
        "worker-status-change",
        serde_json::json!({
            "session_id": session_id,
            "worker_id": worker_id,
            "status": "failed",
            "error": error
        }),
    );
}

/// Respond to a permission request from the frontend
#[tauri::command]
pub fn respond_to_permission(worker_id: String, option_id: String) -> Result<(), String> {
    eprintln!(
        "[ACP] respond_to_permission: worker={}, option={}",
        worker_id, option_id
    );
    send_permission_response(&worker_id, option_id)
}

/// Set the session mode for an ACP session (e.g., "plan", "normal")
/// Uses the official ACP session/set_mode protocol method
#[tauri::command]
pub async fn set_acp_session_mode(
    session_id: String,
    mode_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    eprintln!(
        "[ACP] set_acp_session_mode called: session={}, mode={}",
        session_id, mode_id
    );

    // Get the worker handle
    let command_tx = {
        let handles = state.worker_handles.lock();
        handles
            .get(&session_id)
            .map(|h| h.command_tx.clone())
            .ok_or_else(|| format!("No active worker for session '{}'", session_id))?
    };

    // Create completion channel
    let (done_tx, done_rx) = oneshot::channel();

    // Send set mode command to the persistent worker
    command_tx
        .send(WorkerCommand::SetMode {
            mode_id: mode_id.clone(),
            done_tx,
        })
        .await
        .map_err(|_| "Worker thread has stopped".to_string())?;

    // Wait for completion
    match done_rx.await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Worker thread stopped while setting mode".to_string()),
    }
}

/// Authenticate an ACP session with the specified method
/// Uses the official ACP authenticate protocol method
#[tauri::command]
pub async fn authenticate_acp_session(
    session_id: String,
    method_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    eprintln!(
        "[ACP] authenticate_acp_session called: session={}, method={}",
        session_id, method_id
    );

    // Get the worker handle
    let command_tx = {
        let handles = state.worker_handles.lock();
        handles
            .get(&session_id)
            .map(|h| h.command_tx.clone())
            .ok_or_else(|| format!("No active worker for session '{}'", session_id))?
    };

    // Create completion channel
    let (done_tx, done_rx) = oneshot::channel();

    // Send authenticate command to the persistent worker
    command_tx
        .send(WorkerCommand::Authenticate {
            method_id: method_id.clone(),
            done_tx,
        })
        .await
        .map_err(|_| "Worker thread has stopped".to_string())?;

    // Wait for completion
    match done_rx.await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("Worker thread stopped while authenticating".to_string()),
    }
}

// ============================================================================
// Session Persistence Commands
// ============================================================================

/// List all persisted sessions
#[tauri::command]
pub fn list_persisted_sessions() -> Result<Vec<PersistedSessionSummary>, String> {
    let store = SessionStore::new()?;
    Ok(store.list_sessions())
}

/// Get a specific persisted session
#[tauri::command]
pub fn get_persisted_session(session_id: String) -> Result<PersistedSession, String> {
    let store = SessionStore::new()?;
    store.load_session(&session_id)
}

/// Delete a persisted session
#[tauri::command]
pub fn delete_persisted_session(session_id: String) -> Result<(), String> {
    let store = SessionStore::new()?;
    store.delete_session(&session_id)
}

/// Resume a persisted ACP session
/// Creates a new worker, loads the session from the agent, and returns the session
#[tauri::command]
pub async fn resume_acp_session(
    persisted_session_id: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<AcpSessionResponse, String> {
    eprintln!("[ACP Command] resume_acp_session called with id: {}", persisted_session_id);

    // Load the persisted session
    let store = SessionStore::new()?;
    let persisted = store.load_session(&persisted_session_id)?;

    // Get the agent config
    let agent = get_agent(&persisted.agent_id)
        .ok_or_else(|| format!("Agent '{}' not found or not available", persisted.agent_id))?;

    // Check if agent supports load_session
    // (We'll verify this during initialization, but provide early feedback if possible)

    // Create a new orchestrator session
    let session = {
        let mut mgr = state.orchestrator_manager.lock();
        mgr.create_session(persisted.initial_prompt.clone(), Model::Opus)
    };

    let session_id = session.id.clone();

    // Emit session created event
    let _ = app_handle.emit(
        "orchestrator-session-created",
        serde_json::json!({
            "session_id": session_id,
            "status": "resuming",
            "agent": persisted.agent_id,
            "resumed_from": persisted_session_id
        }),
    );

    // Create a single worker for the agent
    let worker = WorkerSession::new(
        Uuid::new_v4().to_string(),
        session_id.clone(),
        persisted.initial_prompt.clone(),
        Model::Opus,
    );

    let worker_id = worker.id.clone();

    // Add worker to session
    {
        let mut mgr = state.orchestrator_manager.lock();
        mgr.add_worker_to_session(&session_id, worker.clone());
        mgr.update_session_status(&session_id, SessionStatus::Running);
    }

    // Create command channel for the persistent worker
    let (command_tx, command_rx) = mpsc::channel::<WorkerCommand>(32);

    // Store the worker handle
    {
        let mut handles = state.worker_handles.lock();
        handles.insert(session_id.clone(), WorkerHandle { command_tx: command_tx.clone() });
    }

    // Get or create task and inbox managers for this session
    let task_manager = state
        .get_task_manager(&session_id)
        .map_err(|e| format!("Failed to get task manager: {}", e))?;
    let inbox_manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| format!("Failed to get inbox manager: {}", e))?;

    // Clone for thread
    let manager = state.orchestrator_manager.clone();
    let session_id_clone = session_id.clone();
    let worker_id_clone = worker_id.clone();
    let app_handle_clone = app_handle.clone();
    let acp_session_id = persisted.acp_session_id.clone();
    let cwd = persisted.cwd.clone();

    // Spawn a worker thread that loads the existing session
    thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime");

        let local_set = tokio::task::LocalSet::new();

        local_set.block_on(&rt, async move {
            run_resume_worker(
                agent,
                cwd,
                session_id_clone,
                worker_id_clone,
                acp_session_id,
                app_handle_clone,
                manager,
                command_rx,
                task_manager,
                inbox_manager,
            )
            .await;
        });
    });

    // Return the session
    let session = {
        let mgr = state.orchestrator_manager.lock();
        mgr.get_session(&session_id).cloned()
    };

    match session {
        Some(s) => Ok(AcpSessionResponse { session: s }),
        None => Err("Session not found after creation".to_string()),
    }
}

/// Worker that resumes an existing session via load_session
async fn run_resume_worker(
    agent: AgentConfig,
    cwd: String,
    session_id: String,
    worker_id: String,
    acp_session_id: String,
    app_handle: AppHandle,
    manager: Arc<Mutex<crate::orchestrator::OrchestratorManager>>,
    mut command_rx: mpsc::Receiver<WorkerCommand>,
    task_manager: Arc<TaskManager>,
    inbox_manager: Arc<InboxManager>,
) {
    // Register this worker in the inbox manager
    inbox_manager.register_worker(&worker_id);

    // Update worker status to running
    {
        let mut mgr = manager.lock();
        mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Running);
    }

    let _ = app_handle.emit(
        "worker-status-change",
        serde_json::json!({
            "session_id": session_id,
            "worker_id": worker_id,
            "status": "running",
            "agent": agent.id,
            "resuming": true
        }),
    );

    // Build args from agent config
    let args: Vec<&str> = agent.args.iter().map(|s| s.as_str()).collect();

    // Spawn the ACP agent with coordination support
    let client_result = AcpClient::spawn(
        &agent.command,
        &args,
        &cwd,
        &agent.env_vars,
        app_handle.clone(),
        worker_id.clone(),
        session_id.clone(),
        Some(task_manager.clone()),
        Some(inbox_manager.clone()),
    ).await;

    let mut client = match client_result {
        Ok(c) => c,
        Err(e) => {
            handle_worker_failure(
                &session_id,
                &worker_id,
                format!("Failed to spawn {}: {}", agent.name, e),
                &app_handle,
                &manager,
            );
            return;
        }
    };

    // Initialize ACP connection
    match client.initialize().await {
        Ok(_init_response) => {
            // Check if agent supports load_session
            if !client.supports_load_session() {
                handle_worker_failure(
                    &session_id,
                    &worker_id,
                    format!("Agent {} does not support session resumption", agent.name),
                    &app_handle,
                    &manager,
                );
                return;
            }

            // Check if authentication is required
            if client.requires_authentication() {
                // Claude Code uses manual login - skip programmatic auth
                if agent.id == "claude" {
                    eprintln!("[ACP] Claude Code detected - skipping programmatic auth");
                    client.mark_authenticated();
                } else if let Some(first_method) = client.get_auth_methods().first() {
                    if let Err(e) = client.authenticate(&first_method.id.to_string()).await {
                        handle_worker_failure(
                            &session_id,
                            &worker_id,
                            format!("Authentication failed for {}: {}", agent.name, e),
                            &app_handle,
                            &manager,
                        );
                        return;
                    }
                }
            }
        }
        Err(e) => {
            handle_worker_failure(
                &session_id,
                &worker_id,
                format!("ACP initialization failed for {}: {}", agent.name, e),
                &app_handle,
                &manager,
            );
            return;
        }
    }

    // Load the existing session instead of creating a new one
    if let Err(e) = client.load_acp_session(acp_session_id.clone(), cwd.clone()).await {
        handle_worker_failure(
            &session_id,
            &worker_id,
            format!("Failed to load session {}: {}", acp_session_id, e),
            &app_handle,
            &manager,
        );
        return;
    }

    // Update status to completed (session loaded successfully)
    {
        let mut mgr = manager.lock();
        mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Completed);
    }

    let _ = app_handle.emit(
        "worker-status-change",
        serde_json::json!({
            "session_id": session_id,
            "worker_id": worker_id,
            "status": "completed",
            "resumed": true
        }),
    );

    // Main loop: wait for follow-up commands (same as normal worker)
    eprintln!("[ACP] Resume worker entering command loop for session={}", session_id);

    while let Some(cmd) = command_rx.recv().await {
        match cmd {
            WorkerCommand::Prompt { message, done_tx } => {
                eprintln!("[ACP] Resume worker received prompt: {}", message);

                // Update status to running
                {
                    let mut mgr = manager.lock();
                    mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Running);
                }

                // Create cancel channel for this prompt
                let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);
                {
                    let mut mgr = manager.lock();
                    mgr.register_worker_cancel(worker_id.clone(), cancel_tx);
                }

                let result = client.prompt(&message, &mut cancel_rx).await;

                match result {
                    Ok(stop_reason) => {
                        {
                            let mut mgr = manager.lock();
                            mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Completed);
                            mgr.remove_worker_cancel(&worker_id);
                        }

                        let _ = app_handle.emit(
                            "worker-status-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "status": "completed",
                                "stop_reason": format!("{:?}", stop_reason)
                            }),
                        );

                        let _ = done_tx.send(Ok(()));
                    }
                    Err(AcpError::Cancelled) => {
                        {
                            let mut mgr = manager.lock();
                            mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Cancelled);
                            mgr.remove_worker_cancel(&worker_id);
                        }

                        let _ = app_handle.emit(
                            "worker-status-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "status": "cancelled"
                            }),
                        );

                        let _ = done_tx.send(Ok(()));
                        break;
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        {
                            let mut mgr = manager.lock();
                            mgr.remove_worker_cancel(&worker_id);
                        }
                        let _ = done_tx.send(Err(error_msg.clone()));
                        handle_worker_failure(&session_id, &worker_id, error_msg, &app_handle, &manager);
                        break;
                    }
                }
            }
            WorkerCommand::SetMode { mode_id, done_tx } => {
                let result = client.set_mode(&mode_id).await;
                match result {
                    Ok(()) => {
                        let _ = app_handle.emit(
                            "worker-mode-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "mode_id": mode_id
                            }),
                        );
                        let _ = done_tx.send(Ok(()));
                    }
                    Err(e) => {
                        let _ = done_tx.send(Err(format!("Failed to set mode: {}", e)));
                    }
                }
            }
            WorkerCommand::Authenticate { method_id, done_tx } => {
                let result = client.authenticate(&method_id).await;
                match result {
                    Ok(()) => {
                        let _ = app_handle.emit(
                            "worker-authenticated",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "method_id": method_id
                            }),
                        );
                        let _ = done_tx.send(Ok(()));
                    }
                    Err(e) => {
                        let _ = done_tx.send(Err(format!("Failed to authenticate: {}", e)));
                    }
                }
            }
            WorkerCommand::PromptWithImages { message, images, done_tx } => {
                eprintln!("[ACP] Resume worker received prompt with {} images", images.len());

                {
                    let mut mgr = manager.lock();
                    mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Running);
                }

                let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);
                {
                    let mut mgr = manager.lock();
                    mgr.register_worker_cancel(worker_id.clone(), cancel_tx);
                }

                let mut content: Vec<ContentBlock> = vec![
                    ContentBlock::Text(TextContent::new(&message))
                ];
                for img in &images {
                    content.push(ContentBlock::Image(ImageContent::new(
                        img.data.clone(),
                        img.mime_type.clone(),
                    )));
                }

                let result = client.prompt_with_content(content, &mut cancel_rx).await;

                match result {
                    Ok(stop_reason) => {
                        {
                            let mut mgr = manager.lock();
                            mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Completed);
                            mgr.remove_worker_cancel(&worker_id);
                        }
                        let _ = app_handle.emit(
                            "worker-status-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "status": "completed",
                                "stop_reason": format!("{:?}", stop_reason)
                            }),
                        );
                        let _ = done_tx.send(Ok(()));
                    }
                    Err(AcpError::Cancelled) => {
                        {
                            let mut mgr = manager.lock();
                            mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Cancelled);
                            mgr.remove_worker_cancel(&worker_id);
                        }
                        let _ = app_handle.emit(
                            "worker-status-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "status": "cancelled"
                            }),
                        );
                        let _ = done_tx.send(Ok(()));
                        break;
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        {
                            let mut mgr = manager.lock();
                            mgr.remove_worker_cancel(&worker_id);
                        }
                        let _ = done_tx.send(Err(error_msg.clone()));
                        handle_worker_failure(&session_id, &worker_id, error_msg, &app_handle, &manager);
                        break;
                    }
                }
            }
            WorkerCommand::Cancel | WorkerCommand::Stop => {
                break;
            }
        }
    }

    eprintln!("[ACP] Resume worker thread exiting for session={}", session_id);
    let _ = client.kill().await;
}

/// Reconnect a dead session by spawning a new worker
/// Called when send_acp_prompt fails due to missing worker handle
#[tauri::command]
pub async fn reconnect_worker(
    session_id: String,
    agent_id: String,
    cwd: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    eprintln!("[ACP] reconnect_worker called: session={}, agent={}", session_id, agent_id);

    // Check if worker handle already exists (shouldn't happen but be safe)
    {
        let handles = state.worker_handles.lock();
        if handles.contains_key(&session_id) {
            return Ok(()); // Already connected
        }
    }

    // Get the agent config
    let agent = get_agent(&agent_id)
        .ok_or_else(|| format!("Agent '{}' not found or not available", agent_id))?;

    // Get or create worker in the session
    let worker_id = {
        let mut mgr = state.orchestrator_manager.lock();
        let session = mgr.get_session_mut(&session_id)
            .ok_or_else(|| format!("Session '{}' not found", session_id))?;

        // Use existing worker if available, otherwise create one
        if let Some(worker) = session.workers.first() {
            worker.id.clone()
        } else {
            let worker = WorkerSession::new(
                Uuid::new_v4().to_string(),
                session_id.clone(),
                session.prompt.clone(),
                Model::Opus,
            );
            let id = worker.id.clone();
            mgr.add_worker_to_session(&session_id, worker);
            id
        }
    };

    // Create command channel for the persistent worker
    let (command_tx, command_rx) = mpsc::channel::<WorkerCommand>(32);

    // Store the worker handle
    {
        let mut handles = state.worker_handles.lock();
        handles.insert(session_id.clone(), WorkerHandle { command_tx: command_tx.clone() });
    }

    // Get or create task and inbox managers for this session
    let task_manager = state
        .get_task_manager(&session_id)
        .map_err(|e| format!("Failed to get task manager: {}", e))?;
    let inbox_manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| format!("Failed to get inbox manager: {}", e))?;

    // Clone for thread
    let manager = state.orchestrator_manager.clone();
    let session_id_clone = session_id.clone();
    let worker_id_clone = worker_id.clone();
    let app_handle_clone = app_handle.clone();
    let cwd_clone = cwd.clone();

    // Spawn a worker thread that just initializes the connection (no initial prompt)
    thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime");

        let local_set = tokio::task::LocalSet::new();

        local_set.block_on(&rt, async move {
            run_reconnect_worker(
                agent,
                cwd_clone,
                session_id_clone,
                worker_id_clone,
                app_handle_clone,
                manager,
                command_rx,
                task_manager,
                inbox_manager,
            )
            .await;
        });
    });

    // Wait a bit for the worker to initialize
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    Ok(())
}

/// Worker that reconnects without sending an initial prompt
async fn run_reconnect_worker(
    agent: AgentConfig,
    cwd: String,
    session_id: String,
    worker_id: String,
    app_handle: AppHandle,
    manager: Arc<Mutex<crate::orchestrator::OrchestratorManager>>,
    mut command_rx: mpsc::Receiver<WorkerCommand>,
    task_manager: Arc<TaskManager>,
    inbox_manager: Arc<InboxManager>,
) {
    // Register this worker in the inbox manager
    inbox_manager.register_worker(&worker_id);

    // Update worker status to running
    {
        let mut mgr = manager.lock();
        mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Running);
    }

    let _ = app_handle.emit(
        "worker-status-change",
        serde_json::json!({
            "session_id": session_id,
            "worker_id": worker_id,
            "status": "running",
            "agent": agent.id,
            "reconnecting": true
        }),
    );

    // Build args from agent config
    let args: Vec<&str> = agent.args.iter().map(|s| s.as_str()).collect();

    // Spawn the ACP agent
    let client_result = AcpClient::spawn(
        &agent.command,
        &args,
        &cwd,
        &agent.env_vars,
        app_handle.clone(),
        worker_id.clone(),
        session_id.clone(),
        Some(task_manager.clone()),
        Some(inbox_manager.clone()),
    ).await;

    let mut client = match client_result {
        Ok(c) => c,
        Err(e) => {
            handle_worker_failure(
                &session_id,
                &worker_id,
                format!("Failed to spawn {}: {}", agent.name, e),
                &app_handle,
                &manager,
            );
            return;
        }
    };

    // Initialize ACP connection
    match client.initialize().await {
        Ok(_init_response) => {
            // Check if authentication is required
            if client.requires_authentication() {
                // Claude Code uses manual login - skip programmatic auth
                if agent.id == "claude" {
                    eprintln!("[ACP] Claude Code detected - skipping programmatic auth");
                    client.mark_authenticated();
                } else if let Some(first_method) = client.get_auth_methods().first() {
                    if let Err(e) = client.authenticate(&first_method.id.to_string()).await {
                        handle_worker_failure(
                            &session_id,
                            &worker_id,
                            format!("Authentication failed for {}: {}", agent.name, e),
                            &app_handle,
                            &manager,
                        );
                        return;
                    }
                }
            }
        }
        Err(e) => {
            handle_worker_failure(
                &session_id,
                &worker_id,
                format!("ACP initialization failed for {}: {}", agent.name, e),
                &app_handle,
                &manager,
            );
            return;
        }
    }

    // Create ACP session (new session, not load)
    if let Err(e) = client.create_acp_session(&cwd).await {
        handle_worker_failure(
            &session_id,
            &worker_id,
            format!("Failed to create {} session: {}", agent.name, e),
            &app_handle,
            &manager,
        );
        return;
    }

    // Update status to completed (connection established)
    {
        let mut mgr = manager.lock();
        mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Completed);
    }

    let _ = app_handle.emit(
        "worker-status-change",
        serde_json::json!({
            "session_id": session_id,
            "worker_id": worker_id,
            "status": "completed",
            "reconnected": true
        }),
    );

    // Main loop: wait for commands (same as normal worker)
    eprintln!("[ACP] Reconnect worker entering command loop for session={}", session_id);

    while let Some(cmd) = command_rx.recv().await {
        match cmd {
            WorkerCommand::Prompt { message, done_tx } => {
                eprintln!("[ACP] Reconnect worker received prompt: {}", message);

                // Update status to running
                {
                    let mut mgr = manager.lock();
                    mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Running);
                }

                // Create cancel channel for this prompt
                let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);
                {
                    let mut mgr = manager.lock();
                    mgr.register_worker_cancel(worker_id.clone(), cancel_tx);
                }

                let result = client.prompt(&message, &mut cancel_rx).await;

                match result {
                    Ok(stop_reason) => {
                        {
                            let mut mgr = manager.lock();
                            mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Completed);
                            mgr.remove_worker_cancel(&worker_id);
                        }

                        let _ = app_handle.emit(
                            "worker-status-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "status": "completed",
                                "stop_reason": format!("{:?}", stop_reason)
                            }),
                        );

                        let _ = done_tx.send(Ok(()));
                    }
                    Err(AcpError::Cancelled) => {
                        {
                            let mut mgr = manager.lock();
                            mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Cancelled);
                            mgr.remove_worker_cancel(&worker_id);
                        }

                        let _ = app_handle.emit(
                            "worker-status-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "status": "cancelled"
                            }),
                        );

                        let _ = done_tx.send(Ok(()));
                        break;
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        {
                            let mut mgr = manager.lock();
                            mgr.remove_worker_cancel(&worker_id);
                        }
                        let _ = done_tx.send(Err(error_msg.clone()));
                        handle_worker_failure(&session_id, &worker_id, error_msg, &app_handle, &manager);
                        break;
                    }
                }
            }
            WorkerCommand::SetMode { mode_id, done_tx } => {
                let result = client.set_mode(&mode_id).await;
                match result {
                    Ok(()) => {
                        let _ = app_handle.emit(
                            "worker-mode-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "mode_id": mode_id
                            }),
                        );
                        let _ = done_tx.send(Ok(()));
                    }
                    Err(e) => {
                        let _ = done_tx.send(Err(format!("Failed to set mode: {}", e)));
                    }
                }
            }
            WorkerCommand::Authenticate { method_id, done_tx } => {
                let result = client.authenticate(&method_id).await;
                match result {
                    Ok(()) => {
                        let _ = app_handle.emit(
                            "worker-authenticated",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "method_id": method_id
                            }),
                        );
                        let _ = done_tx.send(Ok(()));
                    }
                    Err(e) => {
                        let _ = done_tx.send(Err(format!("Failed to authenticate: {}", e)));
                    }
                }
            }
            WorkerCommand::PromptWithImages { message, images, done_tx } => {
                eprintln!("[ACP] Reconnect worker received prompt with {} images", images.len());

                {
                    let mut mgr = manager.lock();
                    mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Running);
                }

                let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);
                {
                    let mut mgr = manager.lock();
                    mgr.register_worker_cancel(worker_id.clone(), cancel_tx);
                }

                let mut content: Vec<ContentBlock> = vec![
                    ContentBlock::Text(TextContent::new(&message))
                ];
                for img in &images {
                    content.push(ContentBlock::Image(ImageContent::new(
                        img.data.clone(),
                        img.mime_type.clone(),
                    )));
                }

                let result = client.prompt_with_content(content, &mut cancel_rx).await;

                match result {
                    Ok(stop_reason) => {
                        {
                            let mut mgr = manager.lock();
                            mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Completed);
                            mgr.remove_worker_cancel(&worker_id);
                        }
                        let _ = app_handle.emit(
                            "worker-status-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "status": "completed",
                                "stop_reason": format!("{:?}", stop_reason)
                            }),
                        );
                        let _ = done_tx.send(Ok(()));
                    }
                    Err(AcpError::Cancelled) => {
                        {
                            let mut mgr = manager.lock();
                            mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Cancelled);
                            mgr.remove_worker_cancel(&worker_id);
                        }
                        let _ = app_handle.emit(
                            "worker-status-change",
                            serde_json::json!({
                                "session_id": session_id,
                                "worker_id": worker_id,
                                "status": "cancelled"
                            }),
                        );
                        let _ = done_tx.send(Ok(()));
                        break;
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        {
                            let mut mgr = manager.lock();
                            mgr.remove_worker_cancel(&worker_id);
                        }
                        let _ = done_tx.send(Err(error_msg.clone()));
                        handle_worker_failure(&session_id, &worker_id, error_msg, &app_handle, &manager);
                        break;
                    }
                }
            }
            WorkerCommand::Cancel | WorkerCommand::Stop => {
                break;
            }
        }
    }

    eprintln!("[ACP] Reconnect worker thread exiting for session={}", session_id);
    let _ = client.kill().await;
}

/// Save a session to persistence (call after each prompt completion)
#[tauri::command]
pub fn save_session_to_persistence(
    session_id: String,
    acp_session_id: String,
    cwd: String,
    agent_id: String,
    initial_prompt: String,
    messages: Vec<PersistedMessage>,
    mode: String,
) -> Result<(), String> {
    let store = SessionStore::new()?;

    let now = chrono::Utc::now().timestamp();

    // Check if session already exists to preserve created_at
    let created_at = if store.session_exists(&session_id) {
        store.load_session(&session_id)
            .map(|s| s.created_at)
            .unwrap_or(now)
    } else {
        now
    };

    let session = PersistedSession {
        id: session_id,
        acp_session_id,
        cwd,
        agent_id,
        created_at,
        updated_at: now,
        messages,
        mode,
        initial_prompt,
    };

    store.save_session(&session)
}
