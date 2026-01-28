//! Tauri commands for skills and slash commands

use crate::acp::registry::get_agent_config;
use crate::acp::skill_loader::get_skill_directories;
use crate::acp::skills::{Skill, SkillManager};
use crate::acp::slash_commands::{CommandCategory, CommandRegistry, SlashCommand};
use parking_lot::Mutex;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

/// Get the config directory for an agent ID
/// Falls back to ".claude" if agent not found
fn get_agent_config_dir(agent_id: Option<&str>) -> String {
    agent_id
        .and_then(|id| get_agent_config(id))
        .map(|agent| agent.config_dir)
        .unwrap_or_else(|| ".claude".to_string())
}

/// Global skill managers per session
static SKILL_MANAGERS: once_cell::sync::Lazy<Mutex<HashMap<String, Arc<Mutex<SkillManager>>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

/// Global command registries per session
static COMMAND_REGISTRIES: once_cell::sync::Lazy<Mutex<HashMap<String, Arc<Mutex<CommandRegistry>>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

fn get_skill_manager(session_id: &str) -> Arc<Mutex<SkillManager>> {
    let mut managers = SKILL_MANAGERS.lock();
    managers
        .entry(session_id.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(SkillManager::new())))
        .clone()
}

fn get_command_registry(session_id: &str) -> Arc<Mutex<CommandRegistry>> {
    let mut registries = COMMAND_REGISTRIES.lock();
    registries
        .entry(session_id.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(CommandRegistry::new())))
        .clone()
}

// ==================== SKILL COMMANDS ====================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub trigger_keywords: Vec<String>,
    pub active: bool,
}

impl From<&Skill> for SkillInfo {
    fn from(skill: &Skill) -> Self {
        Self {
            id: skill.id.clone(),
            name: skill.name.clone(),
            description: skill.description.clone(),
            trigger_keywords: skill.trigger_keywords.clone(),
            active: skill.active,
        }
    }
}

/// List all available skills
#[tauri::command]
pub fn list_skills(session_id: String) -> Vec<SkillInfo> {
    let manager = get_skill_manager(&session_id);
    let mgr = manager.lock();
    mgr.list_skills().iter().map(|s| (*s).into()).collect()
}

/// Get a specific skill by ID
#[tauri::command]
pub fn get_skill(session_id: String, skill_id: String) -> Option<SkillInfo> {
    let manager = get_skill_manager(&session_id);
    let mgr = manager.lock();
    mgr.get_skill(&skill_id).map(|s| s.into())
}

/// Activate a skill and return its prompt
#[tauri::command]
pub fn activate_skill(session_id: String, skill_id: String) -> Result<String, String> {
    let manager = get_skill_manager(&session_id);
    let mut mgr = manager.lock();
    mgr.activate_skill(&skill_id)
        .ok_or_else(|| format!("Skill '{}' not found or already active", skill_id))
}

/// Deactivate a skill
#[tauri::command]
pub fn deactivate_skill(session_id: String, skill_id: String) {
    let manager = get_skill_manager(&session_id);
    let mut mgr = manager.lock();
    mgr.deactivate_skill(&skill_id);
}

/// Get all active skill prompts combined
#[tauri::command]
pub fn get_active_skill_prompts(session_id: String) -> String {
    let manager = get_skill_manager(&session_id);
    let mgr = manager.lock();
    mgr.get_active_prompts()
}

/// Suggest skills based on user prompt
#[tauri::command]
pub fn suggest_skills(session_id: String, user_prompt: String) -> Vec<SkillInfo> {
    let manager = get_skill_manager(&session_id);
    let mgr = manager.lock();
    mgr.suggest_skills(&user_prompt)
        .into_iter()
        .map(|s| s.into())
        .collect()
}

/// Initialize skill manager with project context
///
/// Loads skills from directories in priority order:
/// 1. ~/.{config_dir}/skills/ (user global)
/// 2. {project}/.{config_dir}/skills/ (project local)
///
/// File-based skills override built-in skills with the same ID.
#[tauri::command]
pub fn init_skills(session_id: String, project_dir: Option<String>, agent_id: Option<String>) -> SkillLoadResult {
    let manager = get_skill_manager(&session_id);
    let mut mgr = manager.lock();

    let config_dir = get_agent_config_dir(agent_id.as_deref());
    let dirs = get_skill_directories(project_dir.as_ref().map(|s| Path::new(s)), Some(&config_dir));
    mgr.load_from_directories(&dirs);

    SkillLoadResult {
        total_skills: mgr.skill_count(),
        file_skills: mgr.file_skill_count(),
        directories_searched: dirs.iter().map(|p| p.display().to_string()).collect(),
    }
}

/// Reload skills from disk
///
/// Clears all file-based skills and reloads from directories.
/// Built-in skills are preserved.
#[tauri::command]
pub fn reload_skills(session_id: String, project_dir: Option<String>, agent_id: Option<String>) -> SkillLoadResult {
    let manager = get_skill_manager(&session_id);
    let mut mgr = manager.lock();

    // Clear file-based skills, keep hardcoded
    mgr.clear_file_skills();

    // Reload from directories
    let config_dir = get_agent_config_dir(agent_id.as_deref());
    let dirs = get_skill_directories(project_dir.as_ref().map(|s| Path::new(s)), Some(&config_dir));
    mgr.load_from_directories(&dirs);

    SkillLoadResult {
        total_skills: mgr.skill_count(),
        file_skills: mgr.file_skill_count(),
        directories_searched: dirs.iter().map(|p| p.display().to_string()).collect(),
    }
}

/// Result of skill loading operations
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillLoadResult {
    /// Total number of skills available
    pub total_skills: usize,
    /// Number of file-based skills loaded
    pub file_skills: usize,
    /// Directories that were searched
    pub directories_searched: Vec<String>,
}

// ==================== SLASH COMMAND COMMANDS ====================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandInfo {
    pub name: String,
    pub description: String,
    pub input_hint: Option<String>,
    pub category: String,
}

impl From<&SlashCommand> for CommandInfo {
    fn from(cmd: &SlashCommand) -> Self {
        Self {
            name: cmd.name.clone(),
            description: cmd.description.clone(),
            input_hint: cmd.input_hint.clone(),
            category: format!("{:?}", cmd.category).to_lowercase(),
        }
    }
}

/// List all available slash commands
#[tauri::command]
pub fn list_slash_commands(session_id: String) -> Vec<CommandInfo> {
    let registry = get_command_registry(&session_id);
    let reg = registry.lock();
    reg.list_commands().iter().map(|c| c.into()).collect()
}

/// List commands by category
#[tauri::command]
pub fn list_commands_by_category(session_id: String, category: String) -> Vec<CommandInfo> {
    let registry = get_command_registry(&session_id);
    let reg = registry.lock();

    let cat = match category.to_lowercase().as_str() {
        "swarm" => CommandCategory::Swarm,
        "code" => CommandCategory::Code,
        "git" => CommandCategory::Git,
        "analysis" => CommandCategory::Analysis,
        "utility" => CommandCategory::Utility,
        _ => return vec![],
    };

    reg.get_by_category(cat).into_iter().map(|c| c.into()).collect()
}

/// Process a slash command and return the expanded prompt
#[tauri::command]
pub fn process_slash_command(session_id: String, input: String) -> Option<String> {
    let registry = get_command_registry(&session_id);
    let reg = registry.lock();
    reg.process_command(&input)
}

/// Check if input is a slash command
#[tauri::command]
pub fn is_slash_command(input: String) -> bool {
    input.trim().starts_with('/')
}

// ==================== COMBINED FEATURES ====================

/// Process user input, handling skills and slash commands
/// Returns the processed prompt and any skill suggestions
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessedInput {
    /// The final prompt to send (may be expanded from slash command)
    pub prompt: String,
    /// Whether this was a slash command
    pub was_command: bool,
    /// Suggested skills based on the prompt
    pub skill_suggestions: Vec<SkillInfo>,
    /// Active skill prompts to prepend
    pub skill_context: String,
}

#[tauri::command]
pub fn process_user_input(session_id: String, input: String) -> ProcessedInput {
    let skill_manager = get_skill_manager(&session_id);
    let command_registry = get_command_registry(&session_id);

    let skill_mgr = skill_manager.lock();
    let cmd_reg = command_registry.lock();

    // Check if it's a slash command
    let (prompt, was_command) = if let Some(expanded) = cmd_reg.process_command(&input) {
        (expanded, true)
    } else {
        (input.clone(), false)
    };

    // Get skill suggestions
    let skill_suggestions: Vec<SkillInfo> = skill_mgr
        .suggest_skills(&prompt)
        .into_iter()
        .map(|s| s.into())
        .collect();

    // Get active skill context
    let skill_context = skill_mgr.get_active_prompts();

    ProcessedInput {
        prompt,
        was_command,
        skill_suggestions,
        skill_context,
    }
}

/// Cleanup session data
#[tauri::command]
pub fn cleanup_session_features(session_id: String) {
    {
        let mut managers = SKILL_MANAGERS.lock();
        managers.remove(&session_id);
    }
    {
        let mut registries = COMMAND_REGISTRIES.lock();
        registries.remove(&session_id);
    }
}

// ==================== WORKSPACE SKILLS (NO SESSION REQUIRED) ====================

/// List skills for workspace display (no session required)
///
/// Loads skills from provider-specific directories:
/// 1. ~/.{config_dir}/skills/ (user global)
/// 2. {project}/.{config_dir}/skills/ (project local)
///
/// The config_dir is determined by the agent_id parameter (defaults to ".claude")
#[tauri::command]
pub fn list_workspace_skills(project_dir: Option<String>, agent_id: Option<String>) -> WorkspaceSkills {
    use crate::acp::skill_loader::{discover_skills, get_skill_directories};

    let config_dir = get_agent_config_dir(agent_id.as_deref());
    let dirs = get_skill_directories(project_dir.as_ref().map(|s| Path::new(s)), Some(&config_dir));

    let mut global_skills = Vec::new();
    let mut project_skills = Vec::new();

    // Determine which directory is global (directly under home)
    let home = dirs::home_dir().unwrap_or_default();
    let global_dir = home.join(&config_dir).join("skills");

    for dir in &dirs {
        if !dir.exists() {
            continue;
        }

        let skills = discover_skills(dir);
        let is_global_dir = dir == &global_dir;

        for meta in skills {
            let info = WorkspaceSkillInfo {
                name: meta.name.clone(),
                description: meta.description.clone(),
                source: if is_global_dir { "user".to_string() } else { "project".to_string() },
                path: meta.path.display().to_string(),
            };

            if is_global_dir {
                global_skills.push(info);
            } else {
                project_skills.push(info);
            }
        }
    }

    WorkspaceSkills {
        global_skills,
        project_skills,
        directories_searched: dirs.iter().map(|p| p.display().to_string()).collect(),
    }
}

/// Skill info for workspace display
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkillInfo {
    pub name: String,
    pub description: String,
    pub source: String,
    pub path: String,
}

/// Result of workspace skills query
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSkills {
    pub global_skills: Vec<WorkspaceSkillInfo>,
    pub project_skills: Vec<WorkspaceSkillInfo>,
    pub directories_searched: Vec<String>,
}

// ==================== WORKSPACE COMMANDS (NO SESSION REQUIRED) ====================

/// List workspace commands (builtin + global + project)
///
/// Commands come from:
/// 1. Built-in commands (always available)
/// 2. ~/.{config_dir}/commands/ (global)
/// 3. {project}/.{config_dir}/commands/ (project)
///
/// The config_dir is determined by the agent_id parameter (defaults to ".claude")
#[tauri::command]
pub fn list_workspace_commands(project_dir: Option<String>, agent_id: Option<String>) -> WorkspaceCommands {
    use crate::acp::skill_loader::{discover_commands, get_command_directories};
    use crate::acp::slash_commands::get_builtin_commands;

    // Built-in commands
    let builtin_commands: Vec<WorkspaceCommandInfo> = get_builtin_commands()
        .into_iter()
        .map(|cmd| WorkspaceCommandInfo {
            name: cmd.name,
            description: cmd.description,
            category: format!("{:?}", cmd.category).to_lowercase(),
            input_hint: cmd.input_hint,
            source: "builtin".to_string(),
        })
        .collect();

    // Get command directories for the specified agent
    let config_dir = get_agent_config_dir(agent_id.as_deref());
    let dirs = get_command_directories(project_dir.as_ref().map(|s| Path::new(s)), Some(&config_dir));
    let home = dirs::home_dir().unwrap_or_default();
    let global_dir = home.join(&config_dir).join("commands");

    let mut global_commands = Vec::new();
    let mut project_commands = Vec::new();

    for dir in &dirs {
        if !dir.exists() {
            continue;
        }

        let commands = discover_commands(dir);
        let is_global = dir == &global_dir;

        for cmd in commands {
            let info = WorkspaceCommandInfo {
                name: cmd.name,
                description: cmd.description,
                category: "custom".to_string(),
                input_hint: None,
                source: if is_global { "user".to_string() } else { "project".to_string() },
            };

            if is_global {
                global_commands.push(info);
            } else {
                project_commands.push(info);
            }
        }
    }

    WorkspaceCommands {
        builtin_commands,
        global_commands,
        project_commands,
    }
}

/// Command info for workspace display
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCommandInfo {
    pub name: String,
    pub description: String,
    pub category: String,
    pub input_hint: Option<String>,
    pub source: String,
}

/// Result of workspace commands query
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCommands {
    pub builtin_commands: Vec<WorkspaceCommandInfo>,
    pub global_commands: Vec<WorkspaceCommandInfo>,
    pub project_commands: Vec<WorkspaceCommandInfo>,
}
