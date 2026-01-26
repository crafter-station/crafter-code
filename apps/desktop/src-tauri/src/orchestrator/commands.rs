use crate::claude::pricing::Model;
use crate::claude::ClaudeClient;
use crate::orchestrator::manager::{execute_worker, plan_subtasks};
use crate::orchestrator::session::{OrchestratorSession, SessionStatus};
use crate::orchestrator::worker::{WorkerSession, WorkerStatus};
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionResponse {
    pub session: OrchestratorSession,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerResponse {
    pub worker: WorkerSession,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictResponse {
    pub file_path: String,
    pub worker_ids: Vec<String>,
}

#[tauri::command]
pub async fn create_orchestrator_session(
    prompt: String,
    model: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<SessionResponse, String> {
    let model = model
        .and_then(|m| Model::from_string(&m))
        .unwrap_or(Model::Opus);

    let session = {
        let mut mgr = state.orchestrator_manager.lock();
        mgr.create_session(prompt.clone(), model)
    };

    let session_id = session.id.clone();

    let _ = app_handle.emit(
        "orchestrator-session-created",
        serde_json::json!({
            "session_id": session_id,
            "status": "planning"
        }),
    );

    let client = ClaudeClient::from_env().map_err(|e| e.to_string())?;

    let subtasks = plan_subtasks(&client, &prompt).await?;

    let workers: Vec<WorkerSession> = subtasks
        .iter()
        .map(|st| {
            let worker_model = Model::from_string(&st.model).unwrap_or(Model::Sonnet);
            WorkerSession::new(
                Uuid::new_v4().to_string(),
                session_id.clone(),
                st.task.clone(),
                worker_model,
            )
        })
        .collect();

    {
        let mut mgr = state.orchestrator_manager.lock();
        for worker in &workers {
            mgr.add_worker_to_session(&session_id, worker.clone());
        }
        mgr.update_session_status(&session_id, SessionStatus::Running);
    }

    let client = Arc::new(client);
    let manager = state.orchestrator_manager.clone();

    for worker in workers {
        let (cancel_tx, cancel_rx) = mpsc::channel(1);
        let worker_id = worker.id.clone();

        {
            let mut mgr = manager.lock();
            mgr.register_worker_cancel(worker_id.clone(), cancel_tx);
        }

        let client = client.clone();
        let app_handle = app_handle.clone();
        let manager = manager.clone();

        tokio::spawn(async move {
            execute_worker(client, worker, app_handle, manager, cancel_rx).await;
        });
    }

    let session = {
        let mgr = state.orchestrator_manager.lock();
        mgr.get_session(&session_id).cloned()
    };

    match session {
        Some(s) => Ok(SessionResponse { session: s }),
        None => Err("Session not found after creation".to_string()),
    }
}

#[tauri::command]
pub fn get_orchestrator_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<SessionResponse, String> {
    let mgr = state.orchestrator_manager.lock();
    match mgr.get_session(&session_id) {
        Some(session) => Ok(SessionResponse {
            session: session.clone(),
        }),
        None => Err(format!("Session {} not found", session_id)),
    }
}

#[tauri::command]
pub fn list_orchestrator_sessions(state: State<'_, AppState>) -> Vec<OrchestratorSession> {
    let mgr = state.orchestrator_manager.lock();
    mgr.list_sessions().into_iter().cloned().collect()
}

#[tauri::command]
pub fn cancel_worker(
    session_id: String,
    worker_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut mgr = state.orchestrator_manager.lock();

    if !mgr.cancel_worker(&worker_id) {
        return Err(format!("Worker {} not found or already completed", worker_id));
    }

    mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Cancelled);
    Ok(())
}

#[tauri::command]
pub async fn retry_worker(
    session_id: String,
    worker_id: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<WorkerResponse, String> {
    let (_, new_worker) = {
        let mut mgr = state.orchestrator_manager.lock();
        let session = mgr
            .get_session(&session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;

        let old_worker = session
            .get_worker(&worker_id)
            .ok_or_else(|| format!("Worker {} not found", worker_id))?
            .clone();

        if old_worker.status != WorkerStatus::Failed && old_worker.status != WorkerStatus::Cancelled
        {
            return Err("Can only retry failed or cancelled workers".to_string());
        }

        let new_worker = WorkerSession::new(
            Uuid::new_v4().to_string(),
            session_id.clone(),
            old_worker.task.clone(),
            old_worker.model,
        );

        mgr.add_worker_to_session(&session_id, new_worker.clone());
        (old_worker, new_worker)
    };

    let client = ClaudeClient::from_env().map_err(|e| e.to_string())?;
    let client = Arc::new(client);

    let (cancel_tx, cancel_rx) = mpsc::channel(1);
    let new_worker_id = new_worker.id.clone();

    {
        let mut mgr = state.orchestrator_manager.lock();
        mgr.register_worker_cancel(new_worker_id.clone(), cancel_tx);
    }

    let manager = state.orchestrator_manager.clone();
    let worker_clone = new_worker.clone();

    tokio::spawn(async move {
        execute_worker(client, worker_clone, app_handle, manager, cancel_rx).await;
    });

    Ok(WorkerResponse { worker: new_worker })
}

#[tauri::command]
pub fn get_session_conflicts(
    session_id: String,
    state: State<'_, AppState>,
) -> Vec<ConflictResponse> {
    let mgr = state.orchestrator_manager.lock();
    mgr.get_conflicts(&session_id)
        .into_iter()
        .map(|c| ConflictResponse {
            file_path: c.file_path,
            worker_ids: c.worker_ids,
        })
        .collect()
}

#[tauri::command]
pub fn get_session_cost(session_id: String, state: State<'_, AppState>) -> Result<f64, String> {
    let mgr = state.orchestrator_manager.lock();
    match mgr.get_session(&session_id) {
        Some(session) => Ok(session.total_cost),
        None => Err(format!("Session {} not found", session_id)),
    }
}
