mod acp;
mod agent;
mod claude;
mod inbox;
mod orchestrator;
mod pty;
mod tasks;

use acp::commands::WorkerHandle;
use agent::manager::AgentManager;
use inbox::InboxManager;
use orchestrator::OrchestratorManager;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use tasks::TaskManager;
use tauri::Manager;

pub struct AppState {
    pub agent_manager: Arc<Mutex<AgentManager>>,
    pub orchestrator_manager: Arc<Mutex<OrchestratorManager>>,
    /// Handles to communicate with persistent worker threads by session_id
    pub worker_handles: Arc<Mutex<HashMap<String, WorkerHandle>>>,
    /// Per-session task managers
    pub task_managers: Arc<Mutex<HashMap<String, Arc<TaskManager>>>>,
    /// Per-session inbox managers
    pub inbox_managers: Arc<Mutex<HashMap<String, Arc<InboxManager>>>>,
}

impl AppState {
    pub fn get_task_manager(&self, session_id: &str) -> Result<Arc<TaskManager>, String> {
        let mut managers = self.task_managers.lock();
        if !managers.contains_key(session_id) {
            managers.insert(
                session_id.to_string(),
                Arc::new(TaskManager::new(session_id.to_string())),
            );
        }
        Ok(managers.get(session_id).unwrap().clone())
    }

    pub fn get_inbox_manager(&self, session_id: &str) -> Result<Arc<InboxManager>, String> {
        let mut managers = self.inbox_managers.lock();
        if !managers.contains_key(session_id) {
            managers.insert(
                session_id.to_string(),
                Arc::new(InboxManager::new(session_id.to_string())),
            );
        }
        Ok(managers.get(session_id).unwrap().clone())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let agent_manager = Arc::new(Mutex::new(AgentManager::new()));
    let orchestrator_manager = Arc::new(Mutex::new(OrchestratorManager::new()));
    let worker_handles = Arc::new(Mutex::new(HashMap::new()));
    let task_managers = Arc::new(Mutex::new(HashMap::new()));
    let inbox_managers = Arc::new(Mutex::new(HashMap::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            agent_manager: agent_manager.clone(),
            orchestrator_manager: orchestrator_manager.clone(),
            worker_handles: worker_handles.clone(),
            task_managers: task_managers.clone(),
            inbox_managers: inbox_managers.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            // PTY commands
            pty::commands::spawn_terminal,
            pty::commands::write_terminal,
            pty::commands::resize_terminal,
            pty::commands::kill_terminal,
            // Agent commands
            agent::commands::read_directory,
            agent::commands::read_file_content,
            agent::commands::get_project_info,
            // Orchestrator commands
            orchestrator::commands::create_orchestrator_session,
            orchestrator::commands::get_orchestrator_session,
            orchestrator::commands::list_orchestrator_sessions,
            orchestrator::commands::cancel_worker,
            orchestrator::commands::retry_worker,
            orchestrator::commands::get_session_conflicts,
            orchestrator::commands::get_session_cost,
            // ACP commands
            acp::commands::list_available_agents,
            acp::commands::create_acp_session,
            acp::commands::send_acp_prompt,
            acp::commands::respond_to_permission,
            // Task commands
            tasks::commands::task_create,
            tasks::commands::task_list,
            tasks::commands::task_get,
            tasks::commands::task_update,
            tasks::commands::task_claim,
            tasks::commands::task_delete,
            // Inbox commands
            inbox::commands::inbox_register,
            inbox::commands::inbox_write,
            inbox::commands::inbox_broadcast,
            inbox::commands::inbox_broadcast_to,
            inbox::commands::inbox_read,
            inbox::commands::inbox_mark_read,
            inbox::commands::inbox_mark_all_read,
            inbox::commands::inbox_send_structured,
            inbox::commands::inbox_count,
            inbox::commands::inbox_get_workers,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
