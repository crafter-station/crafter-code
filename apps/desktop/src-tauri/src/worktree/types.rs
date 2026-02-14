use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    pub id: String,
    pub name: String,
    pub root_path: String,
    pub default_branch: String,
    pub worktrees: Vec<Worktree>,
    pub added_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Worktree {
    pub id: String,
    pub name: String,
    pub branch: String,
    pub working_directory: String,
    pub repository_id: String,
    pub is_main: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeStatus {
    pub worktree_id: String,
    pub modified_files: u32,
    pub staged_files: u32,
    pub untracked_files: u32,
    pub ahead: u32,
    pub behind: u32,
}
