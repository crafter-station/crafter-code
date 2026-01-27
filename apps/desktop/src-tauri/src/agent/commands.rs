use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub is_hidden: bool,
    pub size: Option<u64>,
    pub modified: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub git_branch: Option<String>,
    pub git_status: Option<String>,
}

#[tauri::command]
pub fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir_path = Path::new(&path);

    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    let read_dir = fs::read_dir(dir_path).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let metadata = entry.metadata().ok();

        let name = entry.file_name().to_string_lossy().to_string();
        let is_hidden = name.starts_with('.');

        // Skip node_modules, .git, and other common ignored directories
        if is_hidden && (name == ".git" || name == "node_modules" || name == ".next" || name == "target") {
            continue;
        }

        let file_entry = FileEntry {
            name: name.clone(),
            path: path.to_string_lossy().to_string(),
            is_dir: path.is_dir(),
            is_file: path.is_file(),
            is_hidden,
            size: metadata.as_ref().map(|m| m.len()),
            modified: metadata.as_ref().and_then(|m| {
                m.modified().ok().map(|t| {
                    t.duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs() as i64
                })
            }),
        };

        entries.push(file_entry);
    }

    // Sort: directories first, then by name
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Err(format!("File does not exist: {}", path));
    }

    if !file_path.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }

    fs::read_to_string(file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_project_info(path: String) -> Result<ProjectInfo, String> {
    let dir_path = Path::new(&path);

    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let name = dir_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    // Try to get git info
    let git_dir = dir_path.join(".git");
    let (git_branch, git_status) = if git_dir.exists() {
        let branch = get_git_branch(&path);
        let status = get_git_status(&path);
        (branch, status)
    } else {
        (None, None)
    };

    Ok(ProjectInfo {
        name,
        path: path.clone(),
        git_branch,
        git_status,
    })
}

fn get_git_branch(path: &str) -> Option<String> {
    let output = std::process::Command::new("git")
        .current_dir(path)
        .args(["branch", "--show-current"])
        .output()
        .ok()?;

    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

fn get_git_status(path: &str) -> Option<String> {
    let output = std::process::Command::new("git")
        .current_dir(path)
        .args(["status", "--porcelain"])
        .output()
        .ok()?;

    if output.status.success() {
        let status = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if status.is_empty() {
            Some("clean".to_string())
        } else {
            Some("modified".to_string())
        }
    } else {
        None
    }
}
