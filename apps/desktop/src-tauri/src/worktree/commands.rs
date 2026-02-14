use super::manager::WORKTREE_MANAGER;
use super::types::{Repository, Worktree, WorktreeStatus};

#[tauri::command]
pub fn list_repositories() -> Result<Vec<Repository>, String> {
    let manager = WORKTREE_MANAGER.lock();
    Ok(manager.list_repositories())
}

#[tauri::command]
pub fn add_repository(path: String) -> Result<Repository, String> {
    let mut manager = WORKTREE_MANAGER.lock();
    manager.add_repository(&path)
}

#[tauri::command]
pub fn remove_repository(id: String) -> Result<(), String> {
    let mut manager = WORKTREE_MANAGER.lock();
    manager.remove_repository(&id)
}

#[tauri::command]
pub fn list_worktrees(repo_id: String) -> Result<Vec<Worktree>, String> {
    let manager = WORKTREE_MANAGER.lock();
    manager.list_worktrees(&repo_id)
}

#[tauri::command]
pub fn create_worktree(repo_id: String, base_ref: Option<String>) -> Result<Worktree, String> {
    let mut manager = WORKTREE_MANAGER.lock();
    manager.create_worktree(&repo_id, base_ref.as_deref())
}

#[tauri::command]
pub fn delete_worktree(repo_id: String, worktree_id: String) -> Result<(), String> {
    let mut manager = WORKTREE_MANAGER.lock();
    manager.delete_worktree(&repo_id, &worktree_id)
}

#[tauri::command]
pub fn get_worktree_status(worktree_id: String) -> Result<WorktreeStatus, String> {
    let manager = WORKTREE_MANAGER.lock();
    manager.get_worktree_status(&worktree_id)
}
