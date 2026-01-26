mod agent;
mod claude;
mod orchestrator;
mod pty;

use agent::manager::AgentManager;
use orchestrator::OrchestratorManager;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;

pub struct AppState {
    pub agent_manager: Arc<Mutex<AgentManager>>,
    pub orchestrator_manager: Arc<Mutex<OrchestratorManager>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let agent_manager = Arc::new(Mutex::new(AgentManager::new()));
    let orchestrator_manager = Arc::new(Mutex::new(OrchestratorManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            agent_manager: agent_manager.clone(),
            orchestrator_manager: orchestrator_manager.clone(),
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
