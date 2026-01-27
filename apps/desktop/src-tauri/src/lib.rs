mod acp;
mod agent;
mod claude;
mod orchestrator;
mod pty;

use acp::commands::WorkerHandle;
use agent::manager::AgentManager;
use orchestrator::OrchestratorManager;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Manager;

pub struct AppState {
    pub agent_manager: Arc<Mutex<AgentManager>>,
    pub orchestrator_manager: Arc<Mutex<OrchestratorManager>>,
    /// Handles to communicate with persistent worker threads by session_id
    pub worker_handles: Arc<Mutex<HashMap<String, WorkerHandle>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let agent_manager = Arc::new(Mutex::new(AgentManager::new()));
    let orchestrator_manager = Arc::new(Mutex::new(OrchestratorManager::new()));
    let worker_handles = Arc::new(Mutex::new(HashMap::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            agent_manager: agent_manager.clone(),
            orchestrator_manager: orchestrator_manager.clone(),
            worker_handles: worker_handles.clone(),
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
