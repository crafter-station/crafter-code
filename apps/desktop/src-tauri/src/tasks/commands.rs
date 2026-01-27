use super::task::{Task, TaskUpdate};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn task_create(
    session_id: String,
    subject: String,
    description: String,
    active_form: Option<String>,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let manager = state
        .get_task_manager(&session_id)
        .map_err(|e| e.to_string())?;
    Ok(manager.create(subject, description, active_form))
}

#[tauri::command]
pub fn task_list(session_id: String, state: State<'_, AppState>) -> Result<Vec<Task>, String> {
    let manager = state
        .get_task_manager(&session_id)
        .map_err(|e| e.to_string())?;
    Ok(manager.list())
}

#[tauri::command]
pub fn task_get(
    session_id: String,
    task_id: String,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let manager = state
        .get_task_manager(&session_id)
        .map_err(|e| e.to_string())?;
    manager
        .get(&task_id)
        .ok_or_else(|| format!("Task {} not found", task_id))
}

#[tauri::command]
pub fn task_update(
    session_id: String,
    task_id: String,
    updates: TaskUpdate,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let manager = state
        .get_task_manager(&session_id)
        .map_err(|e| e.to_string())?;
    manager
        .update(&task_id, updates)
        .ok_or_else(|| format!("Task {} not found", task_id))
}

#[tauri::command]
pub fn task_claim(
    session_id: String,
    worker_id: String,
    state: State<'_, AppState>,
) -> Result<Option<Task>, String> {
    let manager = state
        .get_task_manager(&session_id)
        .map_err(|e| e.to_string())?;
    Ok(manager.claim_available(&worker_id))
}

#[tauri::command]
pub fn task_delete(
    session_id: String,
    task_id: String,
    state: State<'_, AppState>,
) -> Result<Task, String> {
    let manager = state
        .get_task_manager(&session_id)
        .map_err(|e| e.to_string())?;
    manager
        .delete(&task_id)
        .ok_or_else(|| format!("Task {} not found", task_id))
}
