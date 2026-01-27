//! Tauri commands for ACP-based agent orchestration

use crate::acp::client::{send_permission_response, AcpClient, AcpError};
use crate::acp::registry::{discover_agents, get_agent, AgentConfig};
use crate::claude::pricing::Model;
use crate::orchestrator::session::{OrchestratorSession, SessionStatus};
use crate::orchestrator::worker::{WorkerSession, WorkerStatus};
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

/// Commands that can be sent to a persistent worker thread
#[derive(Debug)]
pub enum WorkerCommand {
    /// Send a prompt to the agent
    Prompt {
        message: String,
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

/// List all available CLI agents on the system
#[tauri::command]
pub fn list_available_agents() -> Vec<AgentConfig> {
    discover_agents()
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
) {
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
            "agent": agent.id
        }),
    );

    // Build args from agent config
    let args: Vec<&str> = agent.args.iter().map(|s| s.as_str()).collect();

    // Spawn the ACP agent
    let client_result =
        AcpClient::spawn(&agent.command, &args, &cwd, app_handle.clone(), worker_id.clone()).await;

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
    if let Err(e) = client.initialize().await {
        handle_worker_failure(
            &session_id,
            &worker_id,
            format!("ACP initialization failed for {}: {}", agent.name, e),
            &app_handle,
            &manager,
        );
        return;
    }

    // Create session
    if let Err(e) = client.create_session(&cwd).await {
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

    // Send initial prompt
    {
        let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);

        // Register cancel channel
        {
            let mut mgr = manager.lock();
            mgr.register_worker_cancel(worker_id.clone(), cancel_tx);
        }

        let result = client.prompt(&initial_prompt, &mut cancel_rx).await;

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
