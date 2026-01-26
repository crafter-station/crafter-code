use super::terminal::TERMINAL_MANAGER;
use tauri::AppHandle;

#[tauri::command]
pub fn spawn_terminal(
    app_handle: AppHandle,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
) -> Result<String, String> {
    let mut manager = TERMINAL_MANAGER.lock();
    manager.create(app_handle, cols, rows, cwd)
}

#[tauri::command]
pub fn write_terminal(id: String, data: String) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER.lock();
    manager.write(&id, &data)
}

#[tauri::command]
pub fn resize_terminal(id: String, cols: u16, rows: u16) -> Result<(), String> {
    let manager = TERMINAL_MANAGER.lock();
    manager.resize(&id, cols, rows)
}

#[tauri::command]
pub fn kill_terminal(id: String) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER.lock();
    manager.kill(&id)
}
