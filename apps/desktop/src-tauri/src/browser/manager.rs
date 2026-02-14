use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewBuilder, WebviewUrl};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserViewState {
    pub id: String,
    pub url: String,
    pub bounds: BrowserBounds,
    pub visible: bool,
}

pub struct BrowserManager {
    views: HashMap<String, BrowserViewState>,
}

impl BrowserManager {
    pub fn new() -> Self {
        Self {
            views: HashMap::new(),
        }
    }

    pub fn create_view(
        &mut self,
        app_handle: &AppHandle,
        url: &str,
        bounds: BrowserBounds,
    ) -> Result<BrowserViewState, String> {
        let id = format!("browser-{}", Uuid::new_v4());

        let parsed_url = url
            .parse::<tauri::Url>()
            .map_err(|e| format!("Invalid URL: {}", e))?;

        let window = app_handle
            .get_window("main")
            .ok_or("Main window not found")?;

        let webview_builder = WebviewBuilder::new(
            &id,
            WebviewUrl::External(parsed_url),
        );

        window
            .add_child(
                webview_builder,
                LogicalPosition::new(bounds.x, bounds.y),
                LogicalSize::new(bounds.width, bounds.height),
            )
            .map_err(|e| e.to_string())?;

        let state = BrowserViewState {
            id: id.clone(),
            url: url.to_string(),
            bounds,
            visible: true,
        };

        self.views.insert(id, state.clone());
        Ok(state)
    }

    pub fn navigate(
        &mut self,
        app_handle: &AppHandle,
        id: &str,
        url: &str,
    ) -> Result<(), String> {
        let webview = app_handle
            .get_webview(id)
            .ok_or_else(|| format!("Browser view not found: {}", id))?;

        let parsed_url = url
            .parse::<tauri::Url>()
            .map_err(|e| format!("Invalid URL: {}", e))?;

        webview.navigate(parsed_url).map_err(|e| e.to_string())?;

        if let Some(view) = self.views.get_mut(id) {
            view.url = url.to_string();
        }

        Ok(())
    }

    pub fn close_view(&mut self, app_handle: &AppHandle, id: &str) -> Result<(), String> {
        if let Some(webview) = app_handle.get_webview(id) {
            webview.close().map_err(|e| e.to_string())?;
        }
        self.views.remove(id);
        Ok(())
    }

    pub fn resize_view(
        &mut self,
        app_handle: &AppHandle,
        id: &str,
        bounds: BrowserBounds,
    ) -> Result<(), String> {
        let webview = app_handle
            .get_webview(id)
            .ok_or_else(|| format!("Browser view not found: {}", id))?;

        webview
            .set_position(LogicalPosition::new(bounds.x, bounds.y))
            .map_err(|e| e.to_string())?;

        webview
            .set_size(LogicalSize::new(bounds.width, bounds.height))
            .map_err(|e| e.to_string())?;

        if let Some(view) = self.views.get_mut(id) {
            view.bounds = bounds;
        }

        Ok(())
    }

    pub fn set_visible(
        &mut self,
        app_handle: &AppHandle,
        id: &str,
        visible: bool,
    ) -> Result<(), String> {
        let webview = app_handle
            .get_webview(id)
            .ok_or_else(|| format!("Browser view not found: {}", id))?;

        if visible {
            if let Some(view) = self.views.get(id) {
                webview
                    .set_position(LogicalPosition::new(view.bounds.x, view.bounds.y))
                    .map_err(|e| e.to_string())?;
            }
            webview.show().map_err(|e| e.to_string())?;
        } else {
            webview.hide().map_err(|e| e.to_string())?;
        }

        if let Some(view) = self.views.get_mut(id) {
            view.visible = visible;
        }
        Ok(())
    }

    pub fn close_all_views(&mut self, app_handle: &AppHandle) {
        let ids: Vec<String> = self.views.keys().cloned().collect();
        for id in ids {
            if let Some(webview) = app_handle.get_webview(&id) {
                let _ = webview.close();
            }
        }
        self.views.clear();
    }

    pub fn list_views(&self) -> Vec<BrowserViewState> {
        self.views.values().cloned().collect()
    }
}

impl Default for BrowserManager {
    fn default() -> Self {
        Self::new()
    }
}

lazy_static::lazy_static! {
    pub static ref BROWSER_MANAGER: Arc<Mutex<BrowserManager>> = Arc::new(Mutex::new(BrowserManager::new()));
}
