use super::manager::{BrowserBounds, BrowserViewState, BROWSER_MANAGER};
use tauri::AppHandle;

#[tauri::command]
pub async fn create_browser_view(
    app_handle: AppHandle,
    url: String,
    bounds: BrowserBounds,
) -> Result<BrowserViewState, String> {
    let mut manager = BROWSER_MANAGER.lock();
    manager.create_view(&app_handle, &url, bounds)
}

#[tauri::command]
pub async fn navigate_browser(
    app_handle: AppHandle,
    id: String,
    url: String,
) -> Result<(), String> {
    let mut manager = BROWSER_MANAGER.lock();
    manager.navigate(&app_handle, &id, &url)
}

#[tauri::command]
pub async fn close_browser_view(app_handle: AppHandle, id: String) -> Result<(), String> {
    let mut manager = BROWSER_MANAGER.lock();
    manager.close_view(&app_handle, &id)
}

#[tauri::command]
pub async fn resize_browser_view(
    app_handle: AppHandle,
    id: String,
    bounds: BrowserBounds,
) -> Result<(), String> {
    let mut manager = BROWSER_MANAGER.lock();
    manager.resize_view(&app_handle, &id, bounds)
}

#[tauri::command]
pub async fn set_browser_visible(
    app_handle: AppHandle,
    id: String,
    visible: bool,
) -> Result<(), String> {
    let mut manager = BROWSER_MANAGER.lock();
    manager.set_visible(&app_handle, &id, visible)
}

#[tauri::command]
pub async fn list_browser_views() -> Result<Vec<BrowserViewState>, String> {
    let manager = BROWSER_MANAGER.lock();
    Ok(manager.list_views())
}

#[tauri::command]
pub async fn close_all_browser_views(app_handle: AppHandle) -> Result<(), String> {
    let mut manager = BROWSER_MANAGER.lock();
    manager.close_all_views(&app_handle);
    Ok(())
}
