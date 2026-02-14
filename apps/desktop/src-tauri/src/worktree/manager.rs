use super::types::{Repository, Worktree, WorktreeStatus};
use chrono::Utc;
use parking_lot::Mutex;
use rand::seq::SliceRandom;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use uuid::Uuid;

const ADJECTIVES: &[&str] = &[
    "bold", "calm", "dark", "eager", "fast", "glad", "keen", "mild", "neat", "pure", "rare",
    "safe", "tall", "warm", "wise", "able", "blue", "cool", "deep", "fair",
];

const ANIMALS: &[&str] = &[
    "panda", "tiger", "eagle", "whale", "raven", "viper", "bison", "crane", "gecko", "husky",
    "koala", "llama", "moose", "otter", "quail", "robin", "sloth", "trout", "wren", "zebra",
];

pub struct WorktreeManager {
    base_dir: PathBuf,
    config_path: PathBuf,
    repositories: Vec<Repository>,
}

impl WorktreeManager {
    pub fn new() -> Self {
        let home = dirs::home_dir().expect("Could not find home directory");
        let base_dir = home.join(".crafter-code").join("worktrees");
        let config_path = home.join(".crafter-code").join("repositories.json");

        fs::create_dir_all(&base_dir).expect("Could not create base directory");

        let mut manager = Self {
            base_dir,
            config_path,
            repositories: Vec::new(),
        };

        let _ = manager.load_from_disk();
        manager
    }

    fn save_to_disk(&self) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&self.repositories).map_err(|e| e.to_string())?;
        fs::write(&self.config_path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn load_from_disk(&mut self) -> Result<(), String> {
        if !self.config_path.exists() {
            return Ok(());
        }

        let json = fs::read_to_string(&self.config_path).map_err(|e| e.to_string())?;
        self.repositories = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn generate_random_name(&self, repo_id: &str) -> String {
        let mut rng = rand::thread_rng();
        let existing_names: HashSet<String> = self
            .repositories
            .iter()
            .find(|r| r.id == repo_id)
            .map(|r| r.worktrees.iter().map(|w| w.name.clone()).collect())
            .unwrap_or_default();

        loop {
            let adjective = ADJECTIVES.choose(&mut rng).unwrap();
            let animal = ANIMALS.choose(&mut rng).unwrap();
            let name = format!("{}-{}", adjective, animal);

            if !existing_names.contains(&name) {
                return name;
            }
        }
    }

    fn parse_worktree_list(repo_path: &str) -> Vec<Worktree> {
        let output = Command::new("git")
            .arg("-C")
            .arg(repo_path)
            .arg("worktree")
            .arg("list")
            .arg("--porcelain")
            .output();

        let Ok(output) = output else {
            return Vec::new();
        };

        if !output.status.success() {
            return Vec::new();
        }

        let text = String::from_utf8_lossy(&output.stdout);
        let mut worktrees = Vec::new();
        let mut current_worktree: Option<(String, String, String)> = None;
        let mut is_first = true;

        for line in text.lines() {
            if line.is_empty() {
                if let Some((path, _head, branch)) = current_worktree.take() {
                    let name = Path::new(&branch)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or(&branch)
                        .to_string();

                    worktrees.push(Worktree {
                        id: Uuid::new_v4().to_string(),
                        name,
                        branch,
                        working_directory: path,
                        repository_id: String::new(),
                        is_main: is_first,
                        created_at: Utc::now().timestamp(),
                    });
                    is_first = false;
                }
            } else if line.starts_with("worktree ") {
                let path = line.strip_prefix("worktree ").unwrap_or("").to_string();
                current_worktree = Some((path, String::new(), String::new()));
            } else if let Some((path, head, _)) = current_worktree.as_mut() {
                if line.starts_with("HEAD ") {
                    *head = line.strip_prefix("HEAD ").unwrap_or("").to_string();
                } else if line.starts_with("branch ") {
                    let branch = line.strip_prefix("branch ").unwrap_or("").to_string();
                    current_worktree = Some((path.clone(), head.clone(), branch));
                }
            }
        }

        if let Some((path, _, branch)) = current_worktree {
            let name = Path::new(&branch)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(&branch)
                .to_string();

            worktrees.push(Worktree {
                id: Uuid::new_v4().to_string(),
                name,
                branch,
                working_directory: path,
                repository_id: String::new(),
                is_main: is_first,
                created_at: Utc::now().timestamp(),
            });
        }

        worktrees
    }

    pub fn add_repository(&mut self, path: &str) -> Result<Repository, String> {
        let output = Command::new("git")
            .arg("-C")
            .arg(path)
            .arg("rev-parse")
            .arg("--git-dir")
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err("Not a git repository".to_string());
        }

        let name = Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "Invalid path".to_string())?
            .to_string();

        let default_branch_output = Command::new("git")
            .arg("-C")
            .arg(path)
            .arg("symbolic-ref")
            .arg("refs/remotes/origin/HEAD")
            .output();

        let default_branch = if let Ok(output) = default_branch_output {
            if output.status.success() {
                let branch = String::from_utf8_lossy(&output.stdout);
                branch
                    .trim()
                    .strip_prefix("refs/remotes/origin/")
                    .unwrap_or("main")
                    .to_string()
            } else {
                "main".to_string()
            }
        } else {
            "main".to_string()
        };

        let mut worktrees = Self::parse_worktree_list(path);
        let id = Uuid::new_v4().to_string();

        for worktree in &mut worktrees {
            worktree.repository_id = id.clone();
        }

        let repository = Repository {
            id: id.clone(),
            name,
            root_path: path.to_string(),
            default_branch,
            worktrees,
            added_at: Utc::now().timestamp(),
        };

        self.repositories.push(repository.clone());
        self.save_to_disk()?;

        Ok(repository)
    }

    pub fn remove_repository(&mut self, id: &str) -> Result<(), String> {
        let index = self
            .repositories
            .iter()
            .position(|r| r.id == id)
            .ok_or_else(|| format!("Repository not found: {}", id))?;

        self.repositories.remove(index);
        self.save_to_disk()?;

        Ok(())
    }

    pub fn list_repositories(&self) -> Vec<Repository> {
        self.repositories.clone()
    }

    pub fn create_worktree(
        &mut self,
        repo_id: &str,
        base_ref: Option<&str>,
    ) -> Result<Worktree, String> {
        let repo_index = self
            .repositories
            .iter()
            .position(|r| r.id == repo_id)
            .ok_or_else(|| format!("Repository not found: {}", repo_id))?;

        let name = self.generate_random_name(repo_id);
        let repo = &self.repositories[repo_index];
        let base = base_ref.unwrap_or(&repo.default_branch).to_string();
        let root_path = repo.root_path.clone();

        let worktree_path = self.base_dir.join(repo_id).join(&name);
        fs::create_dir_all(worktree_path.parent().unwrap()).map_err(|e| e.to_string())?;

        let output = Command::new("git")
            .arg("-C")
            .arg(&root_path)
            .arg("worktree")
            .arg("add")
            .arg("-b")
            .arg(&name)
            .arg(&worktree_path)
            .arg(&base)
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let worktree = Worktree {
            id: Uuid::new_v4().to_string(),
            name: name.clone(),
            branch: name,
            working_directory: worktree_path.to_string_lossy().to_string(),
            repository_id: repo_id.to_string(),
            is_main: false,
            created_at: Utc::now().timestamp(),
        };

        self.repositories[repo_index].worktrees.push(worktree.clone());
        self.save_to_disk()?;

        Ok(worktree)
    }

    pub fn delete_worktree(&mut self, repo_id: &str, worktree_id: &str) -> Result<(), String> {
        let repo = self
            .repositories
            .iter_mut()
            .find(|r| r.id == repo_id)
            .ok_or_else(|| format!("Repository not found: {}", repo_id))?;

        let worktree_index = repo
            .worktrees
            .iter()
            .position(|w| w.id == worktree_id)
            .ok_or_else(|| format!("Worktree not found: {}", worktree_id))?;

        let worktree = &repo.worktrees[worktree_index];

        if worktree.is_main {
            return Err("Cannot delete main worktree".to_string());
        }

        let output = Command::new("git")
            .arg("-C")
            .arg(&repo.root_path)
            .arg("worktree")
            .arg("remove")
            .arg(&worktree.working_directory)
            .arg("--force")
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let _ = Command::new("git")
            .arg("-C")
            .arg(&repo.root_path)
            .arg("branch")
            .arg("-d")
            .arg(&worktree.branch)
            .output();

        repo.worktrees.remove(worktree_index);
        self.save_to_disk()?;

        Ok(())
    }

    pub fn list_worktrees(&self, repo_id: &str) -> Result<Vec<Worktree>, String> {
        let repo = self
            .repositories
            .iter()
            .find(|r| r.id == repo_id)
            .ok_or_else(|| format!("Repository not found: {}", repo_id))?;

        Ok(repo.worktrees.clone())
    }

    pub fn get_worktree_status(&self, worktree_id: &str) -> Result<WorktreeStatus, String> {
        let worktree = self
            .repositories
            .iter()
            .flat_map(|r| &r.worktrees)
            .find(|w| w.id == worktree_id)
            .ok_or_else(|| format!("Worktree not found: {}", worktree_id))?;

        let status_output = Command::new("git")
            .arg("-C")
            .arg(&worktree.working_directory)
            .arg("status")
            .arg("--porcelain")
            .output()
            .map_err(|e| e.to_string())?;

        let mut modified_files = 0;
        let mut staged_files = 0;
        let mut untracked_files = 0;

        if status_output.status.success() {
            let status_text = String::from_utf8_lossy(&status_output.stdout);
            for line in status_text.lines() {
                if line.len() < 2 {
                    continue;
                }
                let x = line.chars().next().unwrap();
                let y = line.chars().nth(1).unwrap();

                if x != ' ' && x != '?' {
                    staged_files += 1;
                }
                if y != ' ' && y != '?' {
                    modified_files += 1;
                }
                if x == '?' && y == '?' {
                    untracked_files += 1;
                }
            }
        }

        let behind_output = Command::new("git")
            .arg("-C")
            .arg(&worktree.working_directory)
            .arg("rev-list")
            .arg("--count")
            .arg("HEAD..@{u}")
            .output();

        let behind = if let Ok(output) = behind_output {
            if output.status.success() {
                String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .parse()
                    .unwrap_or(0)
            } else {
                0
            }
        } else {
            0
        };

        let ahead_output = Command::new("git")
            .arg("-C")
            .arg(&worktree.working_directory)
            .arg("rev-list")
            .arg("--count")
            .arg("@{u}..HEAD")
            .output();

        let ahead = if let Ok(output) = ahead_output {
            if output.status.success() {
                String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .parse()
                    .unwrap_or(0)
            } else {
                0
            }
        } else {
            0
        };

        Ok(WorktreeStatus {
            worktree_id: worktree_id.to_string(),
            modified_files,
            staged_files,
            untracked_files,
            ahead,
            behind,
        })
    }
}

impl Default for WorktreeManager {
    fn default() -> Self {
        Self::new()
    }
}

lazy_static::lazy_static! {
    pub static ref WORKTREE_MANAGER: Arc<Mutex<WorktreeManager>> = Arc::new(Mutex::new(WorktreeManager::new()));
}
