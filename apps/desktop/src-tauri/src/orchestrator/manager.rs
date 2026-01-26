use crate::claude::pricing::Model;
use crate::claude::{ClaudeClient, Message};
use crate::orchestrator::session::{FileConflict, OrchestratorSession, SessionStatus};
use crate::orchestrator::worker::{WorkerSession, WorkerStatus};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use uuid::Uuid;

const ORCHESTRATOR_SYSTEM_PROMPT: &str = r#"You are a task orchestrator. Given a high-level task, break it down into 2-6 independent subtasks that can be executed in parallel by worker agents.

IMPORTANT: Return ONLY a valid JSON array of subtask objects. No markdown, no explanation, just the JSON.

Each subtask should have:
- "task": A clear, specific description of what the worker should do
- "model": The recommended model - "haiku" for simple tasks, "sonnet" for most coding tasks, "opus" for complex architecture

Example response format:
[
  {"task": "Research the Clerk SDK documentation and identify required imports", "model": "haiku"},
  {"task": "Update the backend authentication routes to use Clerk middleware", "model": "sonnet"},
  {"task": "Update frontend components to use Clerk's useUser hook", "model": "sonnet"},
  {"task": "Write integration tests for the new auth flow", "model": "sonnet"}
]

Guidelines:
- Tasks should be independent and parallelizable
- Use haiku for research, simple updates, tests
- Use sonnet for most implementation work
- Use opus only for complex architectural decisions
- Keep tasks focused and specific
- 2-6 tasks is optimal"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubTask {
    pub task: String,
    pub model: String,
}

#[derive(Debug)]
pub struct OrchestratorManager {
    sessions: HashMap<String, OrchestratorSession>,
    active_workers: HashMap<String, tokio::sync::mpsc::Sender<()>>,
}

impl OrchestratorManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            active_workers: HashMap::new(),
        }
    }

    pub fn create_session(&mut self, prompt: String, model: Model) -> OrchestratorSession {
        let session = OrchestratorSession::new(Uuid::new_v4().to_string(), prompt, model);
        self.sessions.insert(session.id.clone(), session.clone());
        session
    }

    pub fn get_session(&self, id: &str) -> Option<&OrchestratorSession> {
        self.sessions.get(id)
    }

    pub fn get_session_mut(&mut self, id: &str) -> Option<&mut OrchestratorSession> {
        self.sessions.get_mut(id)
    }

    pub fn list_sessions(&self) -> Vec<&OrchestratorSession> {
        self.sessions.values().collect()
    }

    pub fn update_session_status(&mut self, id: &str, status: SessionStatus) -> bool {
        if let Some(session) = self.sessions.get_mut(id) {
            session.status = status;
            return true;
        }
        false
    }

    pub fn add_worker_to_session(&mut self, session_id: &str, worker: WorkerSession) -> bool {
        if let Some(session) = self.sessions.get_mut(session_id) {
            session.add_worker(worker);
            return true;
        }
        false
    }

    pub fn update_worker_status(
        &mut self,
        session_id: &str,
        worker_id: &str,
        status: WorkerStatus,
    ) -> bool {
        if let Some(session) = self.sessions.get_mut(session_id) {
            return session.update_worker_status(worker_id, status);
        }
        false
    }

    pub fn update_worker_output(
        &mut self,
        session_id: &str,
        worker_id: &str,
        output: &str,
    ) -> bool {
        if let Some(session) = self.sessions.get_mut(session_id) {
            return session.update_worker_output(worker_id, output);
        }
        false
    }

    pub fn update_worker_cost(
        &mut self,
        session_id: &str,
        worker_id: &str,
        input_tokens: u64,
        output_tokens: u64,
        cost: f64,
    ) -> bool {
        if let Some(session) = self.sessions.get_mut(session_id) {
            return session.update_worker_cost(worker_id, input_tokens, output_tokens, cost);
        }
        false
    }

    pub fn register_worker_cancel(&mut self, worker_id: String, cancel_tx: mpsc::Sender<()>) {
        self.active_workers.insert(worker_id, cancel_tx);
    }

    pub fn cancel_worker(&mut self, worker_id: &str) -> bool {
        if let Some(cancel_tx) = self.active_workers.remove(worker_id) {
            let _ = cancel_tx.try_send(());
            return true;
        }
        false
    }

    pub fn remove_worker_cancel(&mut self, worker_id: &str) {
        self.active_workers.remove(worker_id);
    }

    pub fn get_conflicts(&self, session_id: &str) -> Vec<FileConflict> {
        if let Some(session) = self.sessions.get(session_id) {
            return session.detect_conflicts();
        }
        Vec::new()
    }
}

impl Default for OrchestratorManager {
    fn default() -> Self {
        Self::new()
    }
}

pub async fn plan_subtasks(
    client: &ClaudeClient,
    prompt: &str,
) -> Result<Vec<SubTask>, String> {
    let messages = vec![Message::user(prompt)];

    let (output, _, _) = client
        .send_message(&Model::Opus, messages, Some(ORCHESTRATOR_SYSTEM_PROMPT.to_string()), 2000)
        .await
        .map_err(|e| e.to_string())?;

    let cleaned = output.trim();
    let json_str = if cleaned.starts_with("```") {
        cleaned
            .lines()
            .skip(1)
            .take_while(|line| !line.starts_with("```"))
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        cleaned.to_string()
    };

    let subtasks: Vec<SubTask> =
        serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse subtasks: {}", e))?;

    Ok(subtasks)
}

pub async fn execute_worker(
    client: Arc<ClaudeClient>,
    worker: WorkerSession,
    app_handle: AppHandle,
    manager: Arc<Mutex<OrchestratorManager>>,
    mut cancel_rx: mpsc::Receiver<()>,
) {
    let worker_id = worker.id.clone();
    let session_id = worker.session_id.clone();
    let task = worker.task.clone();
    let model = worker.model;

    {
        let mut mgr = manager.lock();
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

    let messages = vec![Message::user(&task)];
    let system = Some(
        "You are a focused worker agent. Complete the specific task assigned to you. Be concise and effective.".to_string(),
    );

    tokio::select! {
        result = client.stream_message(&model, messages, system, 4096, app_handle.clone(), worker_id.clone()) => {
            match result {
                Ok((_, usage, cost)) => {
                    let mut mgr = manager.lock();
                    mgr.update_worker_cost(&session_id, &worker_id, usage.input_tokens, usage.output_tokens, cost);
                    mgr.update_worker_status(&session_id, &worker_id, WorkerStatus::Completed);
                    mgr.remove_worker_cancel(&worker_id);

                    let _ = app_handle.emit(
                        "worker-status-change",
                        serde_json::json!({
                            "session_id": session_id,
                            "worker_id": worker_id,
                            "status": "completed",
                            "cost": cost
                        }),
                    );
                }
                Err(e) => {
                    let mut mgr = manager.lock();
                    if let Some(session) = mgr.get_session_mut(&session_id) {
                        if let Some(w) = session.get_worker_mut(&worker_id) {
                            w.mark_failed(e.to_string());
                        }
                    }
                    mgr.remove_worker_cancel(&worker_id);

                    let _ = app_handle.emit(
                        "worker-status-change",
                        serde_json::json!({
                            "session_id": session_id,
                            "worker_id": worker_id,
                            "status": "failed",
                            "error": e.to_string()
                        }),
                    );
                }
            }
        }
        _ = cancel_rx.recv() => {
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
    }
}
