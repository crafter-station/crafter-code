use super::message::{Message, MessageType};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn inbox_register(
    session_id: String,
    worker_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| e.to_string())?;
    manager.register_worker(&worker_id);
    Ok(())
}

#[tauri::command]
pub fn inbox_write(
    session_id: String,
    from: String,
    to: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<Message, String> {
    let manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| e.to_string())?;
    Ok(manager.send(&from, &to, MessageType::Text { content }))
}

#[tauri::command]
pub fn inbox_broadcast(
    session_id: String,
    from: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<Vec<Message>, String> {
    let manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| e.to_string())?;
    Ok(manager.broadcast(&from, MessageType::Text { content }))
}

#[tauri::command]
pub fn inbox_broadcast_to(
    session_id: String,
    from: String,
    content: String,
    targets: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<Message>, String> {
    let manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| e.to_string())?;
    Ok(manager.broadcast_to(&from, MessageType::Text { content }, &targets))
}

#[tauri::command]
pub fn inbox_read(
    session_id: String,
    worker_id: String,
    unread_only: Option<bool>,
    state: State<'_, AppState>,
) -> Result<Vec<Message>, String> {
    let manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| e.to_string())?;
    if unread_only.unwrap_or(false) {
        Ok(manager.read_unread(&worker_id))
    } else {
        Ok(manager.read(&worker_id))
    }
}

#[tauri::command]
pub fn inbox_mark_read(
    session_id: String,
    worker_id: String,
    message_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| e.to_string())?;
    manager.mark_read(&worker_id, &message_ids);
    Ok(())
}

#[tauri::command]
pub fn inbox_mark_all_read(
    session_id: String,
    worker_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| e.to_string())?;
    manager.mark_all_read(&worker_id);
    Ok(())
}

#[tauri::command]
pub fn inbox_send_structured(
    session_id: String,
    from: String,
    to: String,
    message: MessageType,
    state: State<'_, AppState>,
) -> Result<Message, String> {
    let manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| e.to_string())?;
    Ok(manager.send(&from, &to, message))
}

#[tauri::command]
pub fn inbox_count(
    session_id: String,
    worker_id: String,
    unread_only: Option<bool>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| e.to_string())?;
    Ok(manager.count(&worker_id, unread_only.unwrap_or(false)))
}

#[tauri::command]
pub fn inbox_get_workers(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let manager = state
        .get_inbox_manager(&session_id)
        .map_err(|e| e.to_string())?;
    Ok(manager.get_workers())
}
