//! Tauri commands for PRD execution

use super::manager::run_ralph_loop;
use super::types::{
    CostBreakdown, Prd, PrdSession, PrdSessionSummary, RalphWorker, StoryProgress, ValidationResult,
};
use crate::AppState;
use tauri::{AppHandle, State};

/// Validate a PRD before execution
/// Returns validation errors, warnings, estimated cost, and model assignments
#[tauri::command]
pub fn validate_prd(prd: Prd, state: State<'_, AppState>) -> ValidationResult {
    state.prd_manager.validate(&prd)
}

/// Create a new PRD session and start execution
#[tauri::command]
pub async fn create_prd_session(
    prd: Prd,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<PrdSession, String> {
    let session = state.prd_manager.create_session(prd)?;
    let session_id = session.id.clone();

    // Clone manager for async task
    let manager = state.prd_manager.clone();

    // Start the Ralph loop in background
    tokio::spawn(async move {
        run_ralph_loop(manager, session_id, app_handle).await;
    });

    Ok(session)
}

/// Get the current state of a PRD session
#[tauri::command]
pub fn get_prd_session(session_id: String, state: State<'_, AppState>) -> Result<PrdSession, String> {
    state
        .prd_manager
        .get_session(&session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))
}

/// List all PRD sessions
#[tauri::command]
pub fn list_prd_sessions(state: State<'_, AppState>) -> Vec<PrdSessionSummary> {
    state.prd_manager.list_sessions()
}

/// Pause a running PRD session
#[tauri::command]
pub fn pause_prd_session(session_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.prd_manager.pause_session(&session_id)
}

/// Resume a paused PRD session
#[tauri::command]
pub async fn resume_prd_session(
    session_id: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.prd_manager.resume_session(&session_id)?;

    // Restart the Ralph loop
    let manager = state.prd_manager.clone();
    let session_id_clone = session_id.clone();

    tokio::spawn(async move {
        run_ralph_loop(manager, session_id_clone, app_handle).await;
    });

    Ok(())
}

/// Cancel a PRD session (stops all workers)
#[tauri::command]
pub fn cancel_prd_session(session_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.prd_manager.cancel_session(&session_id)
}

/// Retry a failed story in a PRD session
#[tauri::command]
pub async fn retry_prd_story(
    session_id: String,
    story_id: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.prd_manager.retry_story(&session_id, &story_id)?;

    // Restart the Ralph loop if session is now running
    let session = state
        .prd_manager
        .get_session(&session_id)
        .ok_or("Session not found")?;

    if session.status == super::types::PrdSessionStatus::Running {
        let manager = state.prd_manager.clone();
        let session_id_clone = session_id.clone();

        tokio::spawn(async move {
            run_ralph_loop(manager, session_id_clone, app_handle).await;
        });
    }

    Ok(())
}

/// Get progress for a specific story
#[tauri::command]
pub fn get_story_progress(
    session_id: String,
    story_id: String,
    state: State<'_, AppState>,
) -> Result<StoryProgress, String> {
    state.prd_manager.get_story_progress(&session_id, &story_id)
}

/// Get all workers in a PRD session
#[tauri::command]
pub fn get_prd_workers(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<RalphWorker>, String> {
    state.prd_manager.get_workers(&session_id)
}

/// Get cost breakdown for a PRD session
#[tauri::command]
pub fn get_prd_cost_breakdown(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<CostBreakdown>, String> {
    state.prd_manager.get_cost_breakdown(&session_id)
}
