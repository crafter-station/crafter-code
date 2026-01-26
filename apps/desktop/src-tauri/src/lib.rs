mod agent;
mod pty;

use agent::manager::AgentManager;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;

pub struct AppState {
    pub agent_manager: Arc<Mutex<AgentManager>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let agent_manager = Arc::new(Mutex::new(AgentManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            agent_manager: agent_manager.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            pty::commands::spawn_terminal,
            pty::commands::write_terminal,
            pty::commands::resize_terminal,
            pty::commands::kill_terminal,
            agent::commands::read_directory,
            agent::commands::get_project_info,
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
