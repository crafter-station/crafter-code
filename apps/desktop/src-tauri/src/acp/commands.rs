//! Tauri commands for ACP-based agent orchestration

use crate::acp::client::{AcpClient, AcpError};
use crate::acp::registry::{discover_agents, get_agent, AgentConfig};
use crate::claude::pricing::Model;
use crate::orchestrator::session::{OrchestratorSession, SessionStatus};
use crate::orchestrator::worker::{WorkerSession, WorkerStatus};
use crate::AppState;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpSessionResponse {
    pub session: OrchestratorSession,
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

    // Set up cancellation channel
    let (cancel_tx, cancel_rx) = mpsc::channel::<()>(1);

    {
        let mut mgr = state.orchestrator_manager.lock();
        mgr.register_worker_cancel(worker_id.clone(), cancel_tx);
    }

    // Clone for thread
    let manager = state.orchestrator_manager.clone();
    let acp_clients = state.acp_clients.clone();
    let session_id_clone = session_id.clone();
    let worker_id_clone = worker_id.clone();
    let app_handle_clone = app_handle.clone();

    // Spawn in a separate thread with its own tokio runtime + LocalSet
    // This is necessary because ClientSideConnection uses !Send futures
    thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime");

        let local_set = tokio::task::LocalSet::new();

        local_set.block_on(&rt, async move {
            execute_acp_worker(
                agent,
                prompt,
                cwd,
                session_id_clone,
                worker_id_clone,
                app_handle_clone,
                manager,
                acp_clients,
                cancel_rx,
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
    eprintln!("[ACP] Found worker_id: {}", worker_id);

    // Take the client from storage (we'll put it back after)
    let client = {
        let mut clients = state.acp_clients.lock();
        let keys: Vec<_> = clients.keys().cloned().collect();
        eprintln!("[ACP] Available clients: {:?}", keys);
        clients.remove(&session_id).ok_or_else(|| {
            format!(
                "No active ACP client for session '{}'. The session may have been closed.",
                session_id
            )
        })?
    };
    eprintln!("[ACP] Got client for session");

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

    // Set up cancellation channel
    let (cancel_tx, cancel_rx) = mpsc::channel::<()>(1);

    {
        let mut mgr = state.orchestrator_manager.lock();
        mgr.register_worker_cancel(worker_id.clone(), cancel_tx);
    }

    // Clone for thread
    let manager = state.orchestrator_manager.clone();
    let acp_clients = state.acp_clients.clone();
    let session_id_clone = session_id.clone();
    let worker_id_clone = worker_id.clone();
    let app_handle_clone = app_handle.clone();

    // Spawn in a separate thread with its own tokio runtime + LocalSet
    thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("Failed to create tokio runtime");

        let local_set = tokio::task::LocalSet::new();

        local_set.block_on(&rt, async move {
            execute_follow_up_prompt(
                client,
                prompt,
                session_id_clone,
                worker_id_clone,
                app_handle_clone,
                manager,
                acp_clients,
                cancel_rx,
            )
            .await;
        });
    });

    Ok(())
}

/// Execute a follow-up prompt on an existing ACP client
async fn execute_follow_up_prompt(
    client: AcpClient,
    prompt: String,
    session_id: String,
    worker_id: String,
    app_handle: AppHandle,
    manager: Arc<Mutex<crate::orchestrator::OrchestratorManager>>,
    acp_clients: Arc<Mutex<HashMap<String, AcpClient>>>,
    mut cancel_rx: mpsc::Receiver<()>,
) {
    eprintln!(
        "[ACP] execute_follow_up_prompt starting for session={}",
        session_id
    );

    // Send prompt and stream results (async)
    let result = client.prompt(&prompt, &mut cancel_rx).await;
    eprintln!("[ACP] prompt() returned: {:?}", result.is_ok());

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

            // Store client back for future prompts
            {
                let mut clients = acp_clients.lock();
                clients.insert(session_id.clone(), client);
            }
        }
        Err(AcpError::Cancelled) => {
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
            handle_worker_failure(
                &session_id,
                &worker_id,
                e.to_string(),
                &app_handle,
                &manager,
            );
        }
    }
}

/// Execute an ACP worker using the official SDK
async fn execute_acp_worker(
    agent: AgentConfig,
    prompt: String,
    cwd: String,
    session_id: String,
    worker_id: String,
    app_handle: AppHandle,
    manager: Arc<Mutex<crate::orchestrator::OrchestratorManager>>,
    acp_clients: Arc<Mutex<HashMap<String, AcpClient>>>,
    mut cancel_rx: mpsc::Receiver<()>,
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

    // Spawn the ACP agent (async)
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

    // Initialize ACP connection (async)
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

    // Create session (async)
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

    // Send prompt and stream results (async)
    let result = client.prompt(&prompt, &mut cancel_rx).await;

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

            // Store client for multi-turn conversations
            {
                let mut clients = acp_clients.lock();
                clients.insert(session_id.clone(), client);
            }
        }
        Err(AcpError::Cancelled) => {
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
            // Don't store client on cancel - it will be dropped
        }
        Err(e) => {
            handle_worker_failure(
                &session_id,
                &worker_id,
                e.to_string(),
                &app_handle,
                &manager,
            );
            // Don't store client on failure - it will be dropped
        }
    }
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
