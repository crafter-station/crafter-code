//! Skill Loader - SKILL.md file discovery and parsing
//!
//! Implements the Agent Skills open standard (agentskills.io) for file-based
//! skill loading. Skills are discovered from directories and loaded lazily
//! to minimize context usage.
//!
//! SKILL.md Format:
//! ```markdown
//! ---
//! name: skill-name
//! description: When to use this skill
//! license: Apache-2.0  # Optional
//! compatibility: Requires X  # Optional
//! metadata:  # Optional
//!   author: name
//!   version: "1.0"
//! ---
//!
//! # Skill Instructions (Markdown body)
//! ...
//! ```

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

/// Errors that can occur when loading skills from files
#[derive(Debug, Error)]
pub enum SkillLoadError {
    #[error("File not found: {0}")]
    NotFound(PathBuf),

    #[error("Failed to read file: {0}")]
    ReadError(#[from] std::io::Error),

    #[error("Invalid SKILL.md format: {0}")]
    InvalidFormat(String),

    #[error("YAML parsing error: {0}")]
    YamlError(#[from] serde_yaml::Error),
}

/// Metadata parsed from SKILL.md frontmatter (lightweight)
/// Only loaded at discovery time - body is loaded on demand
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMetadata {
    /// Unique identifier (1-64 chars, lowercase, hyphens)
    pub name: String,

    /// When to use this skill (1-1024 chars)
    pub description: String,

    /// Optional license (e.g., "Apache-2.0", "MIT")
    #[serde(default)]
    pub license: Option<String>,

    /// Optional compatibility notes
    #[serde(default)]
    pub compatibility: Option<String>,

    /// Optional arbitrary key-value metadata
    #[serde(default)]
    pub metadata: HashMap<String, String>,

    /// Path to SKILL.md for lazy loading (not serialized to YAML)
    #[serde(skip)]
    pub path: PathBuf,
}

impl SkillMetadata {
    /// Validate the metadata according to Agent Skills spec
    pub fn validate(&self) -> Result<(), SkillLoadError> {
        // Name: 1-64 chars, lowercase, hyphens allowed
        if self.name.is_empty() || self.name.len() > 64 {
            return Err(SkillLoadError::InvalidFormat(
                "name must be 1-64 characters".to_string(),
            ));
        }
        if !self
            .name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c == '-' || c.is_ascii_digit())
        {
            return Err(SkillLoadError::InvalidFormat(
                "name must be lowercase with hyphens only".to_string(),
            ));
        }

        // Description: 1-1024 chars
        if self.description.is_empty() || self.description.len() > 1024 {
            return Err(SkillLoadError::InvalidFormat(
                "description must be 1-1024 characters".to_string(),
            ));
        }

        Ok(())
    }
}

/// Parse SKILL.md: extract YAML frontmatter + markdown body
///
/// # Arguments
/// * `path` - Path to the SKILL.md file
///
/// # Returns
/// Tuple of (metadata, body) where body is the markdown content after frontmatter
pub fn parse_skill_file(path: &Path) -> Result<(SkillMetadata, String), SkillLoadError> {
    if !path.exists() {
        return Err(SkillLoadError::NotFound(path.to_path_buf()));
    }

    let content = fs::read_to_string(path)?;

    // Check for frontmatter delimiter
    if !content.starts_with("---") {
        return Err(SkillLoadError::InvalidFormat(
            "SKILL.md must start with YAML frontmatter (---)".to_string(),
        ));
    }

    // Find the closing frontmatter delimiter
    let rest = &content[3..]; // Skip opening "---"
    let end_pos = rest.find("\n---").ok_or_else(|| {
        SkillLoadError::InvalidFormat("Missing closing frontmatter delimiter (---)".to_string())
    })?;

    // Extract YAML and body
    let yaml_content = &rest[..end_pos];
    let body_start = end_pos + 4; // Skip "\n---"
    let body = if body_start < rest.len() {
        rest[body_start..].trim().to_string()
    } else {
        String::new()
    };

    // Parse YAML frontmatter
    let mut metadata: SkillMetadata = serde_yaml::from_str(yaml_content)?;
    metadata.path = path.to_path_buf();

    // Validate according to spec
    metadata.validate()?;

    Ok((metadata, body))
}

/// Discover all skills in a directory
///
/// Scans for subdirectories containing SKILL.md files and parses their metadata.
/// Only loads frontmatter at discovery time (body is loaded lazily).
///
/// # Arguments
/// * `dir` - Directory to scan for skill subdirectories
///
/// # Returns
/// Vector of discovered skill metadata (sorted by name)
pub fn discover_skills(dir: &Path) -> Vec<SkillMetadata> {
    let mut skills = Vec::new();

    if !dir.exists() || !dir.is_dir() {
        return skills;
    }

    // Scan for subdirectories containing SKILL.md
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let skill_file = path.join("SKILL.md");
                if skill_file.exists() {
                    match parse_skill_file(&skill_file) {
                        Ok((metadata, _body)) => {
                            skills.push(metadata);
                        }
                        Err(e) => {
                            // Log error but continue discovering other skills
                            eprintln!("Warning: Failed to load skill from {:?}: {}", skill_file, e);
                        }
                    }
                }
            }
        }
    }

    // Sort by name for consistent ordering
    skills.sort_by(|a, b| a.name.cmp(&b.name));

    skills
}

/// Load full skill content (body) on demand
///
/// # Arguments
/// * `path` - Path to the SKILL.md file
///
/// # Returns
/// The markdown body content of the skill
pub fn load_skill_body(path: &Path) -> Result<String, SkillLoadError> {
    let (_metadata, body) = parse_skill_file(path)?;
    Ok(body)
}

/// All known provider config directories
const ALL_PROVIDERS: &[&str] = &[".claude", ".gemini", ".codex", ".copilot", ".opencode"];

/// Get default skill directories in priority order
///
/// Returns directories to search for skills, with later entries having higher priority
/// (file-based skills override earlier ones with the same name).
///
/// Skills are aggregated from ALL providers so they're available universally.
/// Priority order (lowest to highest):
/// 1. ~/.crafter-code/skills/ (global shared)
/// 2. {project}/.crafter-code/skills/ (project shared)
/// 3. ~/.{other-providers}/skills/ (all other providers' global skills)
/// 4. {project}/.{other-providers}/skills/ (all other providers' project skills)
/// 5. ~/.{current-provider}/skills/ (current provider global)
/// 6. {project}/.{current-provider}/skills/ (current provider local - highest priority)
///
/// # Arguments
/// * `project_dir` - Optional project directory for project-local skills
/// * `config_dir` - Optional config directory name (e.g., ".claude", ".gemini", ".copilot")
///                  If None, defaults to ".claude" for backward compatibility
///
/// # Returns
/// Vector of skill directories to search (in priority order)
pub fn get_skill_directories(project_dir: Option<&Path>, config_dir: Option<&str>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let current_provider = config_dir.unwrap_or(".claude");

    // 1. User global shared: ~/.crafter-code/skills/
    if let Some(home) = dirs::home_dir() {
        let shared_skills = home.join(".crafter-code").join("skills");
        dirs.push(shared_skills);
    }

    // 2. Project shared: {project}/.crafter-code/skills/
    if let Some(project) = project_dir {
        let project_shared = project.join(".crafter-code").join("skills");
        dirs.push(project_shared);
    }

    // 3-4. All OTHER providers (lower priority than current)
    for provider in ALL_PROVIDERS {
        if *provider == current_provider {
            continue; // Skip current provider, add it last
        }

        // Global skills from other provider
        if let Some(home) = dirs::home_dir() {
            let provider_global = home.join(provider).join("skills");
            dirs.push(provider_global);
        }

        // Project skills from other provider
        if let Some(project) = project_dir {
            let provider_project = project.join(provider).join("skills");
            dirs.push(provider_project);
        }
    }

    // 5. Current provider global: ~/.{current_provider}/skills/
    if let Some(home) = dirs::home_dir() {
        let user_skills = home.join(current_provider).join("skills");
        dirs.push(user_skills);
    }

    // 6. Current provider project: {project}/.{current_provider}/skills/ (highest priority)
    if let Some(project) = project_dir {
        let project_skills = project.join(current_provider).join("skills");
        dirs.push(project_skills);
    }

    dirs
}

// ==================== COMMAND LOADING ====================

/// Metadata parsed from command .md file frontmatter
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandMetadata {
    /// Description of when to use this command
    pub description: String,

    /// Path to the command file (for lazy loading body)
    #[serde(skip)]
    pub path: PathBuf,

    /// Command name (derived from filename)
    #[serde(skip)]
    pub name: String,
}

/// Parse a command .md file: extract YAML frontmatter + markdown body
pub fn parse_command_file(path: &Path) -> Result<(CommandMetadata, String), SkillLoadError> {
    if !path.exists() {
        return Err(SkillLoadError::NotFound(path.to_path_buf()));
    }

    let content = fs::read_to_string(path)?;

    // Check for YAML frontmatter
    if !content.starts_with("---") {
        return Err(SkillLoadError::InvalidFormat(
            "Command file must start with YAML frontmatter (---)".to_string(),
        ));
    }

    // Find the end of frontmatter
    let rest = &content[3..];
    let end_marker = rest
        .find("---")
        .ok_or_else(|| SkillLoadError::InvalidFormat("Missing closing --- for frontmatter".to_string()))?;

    let yaml_str = &rest[..end_marker].trim();
    let body = rest[end_marker + 3..].trim().to_string();

    // Parse YAML frontmatter
    let mut metadata: CommandMetadata = serde_yaml::from_str(yaml_str)?;
    metadata.path = path.to_path_buf();
    metadata.name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    Ok((metadata, body))
}

/// Discover all commands in a directory
///
/// Commands are .md files directly in the directory (not subdirectories like skills)
pub fn discover_commands(dir: &Path) -> Vec<CommandMetadata> {
    let mut commands = Vec::new();

    if !dir.exists() {
        return commands;
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => {
            eprintln!("[CommandLoader] Failed to read directory {:?}: {}", dir, e);
            return commands;
        }
    };

    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();

        // Only process .md files (not directories)
        if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
            match parse_command_file(&path) {
                Ok((metadata, _body)) => {
                    commands.push(metadata);
                }
                Err(e) => {
                    eprintln!("[CommandLoader] Failed to parse {:?}: {}", path, e);
                }
            }
        }
    }

    commands
}

/// Get default command directories
///
/// Returns directories to search for commands in priority order.
/// Commands are aggregated from ALL providers so they're available universally.
///
/// Priority order (lowest to highest):
/// 1. ~/.crafter-code/commands/ (global shared)
/// 2. {project}/.crafter-code/commands/ (project shared)
/// 3. ~/.{other-providers}/commands/ (all other providers' global)
/// 4. {project}/.{other-providers}/commands/ (all other providers' project)
/// 5. ~/.{current-provider}/commands/ (current provider global)
/// 6. {project}/.{current-provider}/commands/ (current provider local - highest priority)
///
/// # Arguments
/// * `project_dir` - Optional project directory for project-local commands
/// * `config_dir` - Optional config directory name (e.g., ".claude", ".gemini", ".copilot")
///                  If None, defaults to ".claude" for backward compatibility
pub fn get_command_directories(project_dir: Option<&Path>, config_dir: Option<&str>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let current_provider = config_dir.unwrap_or(".claude");

    // 1. User global shared: ~/.crafter-code/commands/
    if let Some(home) = dirs::home_dir() {
        let shared_commands = home.join(".crafter-code").join("commands");
        dirs.push(shared_commands);
    }

    // 2. Project shared: {project}/.crafter-code/commands/
    if let Some(project) = project_dir {
        let project_shared = project.join(".crafter-code").join("commands");
        dirs.push(project_shared);
    }

    // 3-4. All OTHER providers (lower priority than current)
    for provider in ALL_PROVIDERS {
        if *provider == current_provider {
            continue;
        }

        // Global commands from other provider
        if let Some(home) = dirs::home_dir() {
            let provider_global = home.join(provider).join("commands");
            dirs.push(provider_global);
        }

        // Project commands from other provider
        if let Some(project) = project_dir {
            let provider_project = project.join(provider).join("commands");
            dirs.push(provider_project);
        }
    }

    // 5. Current provider global: ~/.{current_provider}/commands/
    if let Some(home) = dirs::home_dir() {
        let global_commands = home.join(current_provider).join("commands");
        dirs.push(global_commands);
    }

    // 6. Current provider project: {project}/.{current_provider}/commands/ (highest priority)
    if let Some(project) = project_dir {
        let project_commands = project.join(current_provider).join("commands");
        dirs.push(project_commands);
    }

    dirs
}

// ==================== CRAFTER-CODE SHARED CONFIG ====================

/// Get paths to system prompt files in priority order
///
/// Returns paths to check for system prompts (CLAUDE.md, GEMINI.md, etc.)
/// Later entries override earlier ones.
///
/// Priority order:
/// 1. ~/.crafter-code/SYSTEM.md (global shared)
/// 2. {project}/.crafter-code/SYSTEM.md (project shared)
/// 3. ~/.{provider}/{PROVIDER}.md (provider global, e.g., ~/.claude/CLAUDE.md)
/// 4. {project}/{PROVIDER}.md (project root, e.g., ./CLAUDE.md - highest priority)
pub fn get_system_prompt_paths(project_dir: Option<&Path>, config_dir: Option<&str>) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    let config = config_dir.unwrap_or(".claude");
    let provider_file = match config {
        ".claude" => "CLAUDE.md",
        ".gemini" => "GEMINI.md",
        ".codex" => "CODEX.md",
        ".copilot" => "COPILOT.md",
        _ => "SYSTEM.md",
    };

    // 1. Global shared: ~/.crafter-code/SYSTEM.md
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".crafter-code").join("SYSTEM.md"));
    }

    // 2. Project shared: {project}/.crafter-code/SYSTEM.md
    if let Some(project) = project_dir {
        paths.push(project.join(".crafter-code").join("SYSTEM.md"));
    }

    // 3. Provider global: ~/.{provider}/{PROVIDER}.md
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(config).join(provider_file));
    }

    // 4. Project root: {project}/{PROVIDER}.md (highest priority)
    if let Some(project) = project_dir {
        paths.push(project.join(provider_file));
    }

    paths
}

/// Load and merge system prompts from all sources
///
/// Concatenates content from all existing system prompt files in priority order.
/// Each file's content is separated by a newline.
pub fn load_merged_system_prompt(project_dir: Option<&Path>, config_dir: Option<&str>) -> String {
    let paths = get_system_prompt_paths(project_dir, config_dir);
    let mut contents = Vec::new();

    for path in paths {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if !content.trim().is_empty() {
                    contents.push(content);
                }
            }
        }
    }

    contents.join("\n\n")
}

/// Initialize .crafter-code directory structure
///
/// Creates the directory structure if it doesn't exist:
/// ```
/// .crafter-code/
/// ├── skills/
/// ├── commands/
/// ├── SYSTEM.md (optional template)
/// └── providers/
///     ├── claude/
///     ├── gemini/
///     └── codex/
/// ```
pub fn init_crafter_code_dir(base_dir: &Path) -> Result<PathBuf, std::io::Error> {
    let crafter_dir = base_dir.join(".crafter-code");

    // Create main directories
    fs::create_dir_all(crafter_dir.join("skills"))?;
    fs::create_dir_all(crafter_dir.join("commands"))?;

    // Create provider override directories
    for provider in &["claude", "gemini", "codex", "copilot"] {
        fs::create_dir_all(crafter_dir.join("providers").join(provider))?;
    }

    // Create template SYSTEM.md if it doesn't exist
    let system_md = crafter_dir.join("SYSTEM.md");
    if !system_md.exists() {
        let template = r#"# Crafter Code System Prompt

This file contains shared instructions for all AI providers.
Provider-specific overrides can be placed in:
- `./CLAUDE.md` for Claude
- `./GEMINI.md` for Gemini
- etc.

## Project Context

<!-- Add your project-specific context here -->

## Conventions

<!-- Add coding conventions, style guides, etc. -->
"#;
        fs::write(&system_md, template)?;
    }

    Ok(crafter_dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn create_test_skill(dir: &Path, name: &str, description: &str, body: &str) {
        let skill_dir = dir.join(name);
        fs::create_dir_all(&skill_dir).unwrap();

        let content = format!(
            r#"---
name: {name}
description: {description}
metadata:
  author: test
  version: "1.0"
---

{body}
"#
        );

        fs::write(skill_dir.join("SKILL.md"), content).unwrap();
    }

    #[test]
    fn test_parse_skill_file() {
        let tmp = TempDir::new().unwrap();
        create_test_skill(
            tmp.path(),
            "test-skill",
            "A test skill for verification.",
            "# Test Skill\n\nThis is the body.",
        );

        let skill_file = tmp.path().join("test-skill").join("SKILL.md");
        let (metadata, body) = parse_skill_file(&skill_file).unwrap();

        assert_eq!(metadata.name, "test-skill");
        assert_eq!(metadata.description, "A test skill for verification.");
        assert!(body.contains("This is the body"));
    }

    #[test]
    fn test_discover_skills() {
        let tmp = TempDir::new().unwrap();
        create_test_skill(tmp.path(), "skill-a", "First skill", "Body A");
        create_test_skill(tmp.path(), "skill-b", "Second skill", "Body B");

        let skills = discover_skills(tmp.path());

        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "skill-a");
        assert_eq!(skills[1].name, "skill-b");
    }

    #[test]
    fn test_load_skill_body() {
        let tmp = TempDir::new().unwrap();
        create_test_skill(
            tmp.path(),
            "body-test",
            "Test body loading",
            "# Instructions\n\nDo the thing.",
        );

        let skill_file = tmp.path().join("body-test").join("SKILL.md");
        let body = load_skill_body(&skill_file).unwrap();

        assert!(body.contains("# Instructions"));
        assert!(body.contains("Do the thing."));
    }

    #[test]
    fn test_invalid_skill_name() {
        let tmp = TempDir::new().unwrap();
        let skill_dir = tmp.path().join("invalid");
        fs::create_dir_all(&skill_dir).unwrap();

        // Name with uppercase (invalid)
        let content = r#"---
name: InvalidName
description: This has invalid name
---

Body here.
"#;
        fs::write(skill_dir.join("SKILL.md"), content).unwrap();

        let result = parse_skill_file(&skill_dir.join("SKILL.md"));
        assert!(result.is_err());
    }

    #[test]
    fn test_missing_frontmatter() {
        let tmp = TempDir::new().unwrap();
        let skill_dir = tmp.path().join("no-frontmatter");
        fs::create_dir_all(&skill_dir).unwrap();

        let content = "# Just a markdown file\n\nNo frontmatter.";
        fs::write(skill_dir.join("SKILL.md"), content).unwrap();

        let result = parse_skill_file(&skill_dir.join("SKILL.md"));
        assert!(result.is_err());
    }

    #[test]
    fn test_get_skill_directories() {
        let project = PathBuf::from("/test/project");

        // Test with default config_dir (.claude)
        let dirs = get_skill_directories(Some(&project), None);
        // Should include: crafter-code + all providers (both global and project)
        assert!(dirs.len() >= 6);
        assert!(dirs.iter().any(|d| d.ends_with(".crafter-code/skills")));
        assert!(dirs.iter().any(|d| d.ends_with(".claude/skills")));
        // Should also include other providers
        assert!(dirs.iter().any(|d| d.ends_with(".gemini/skills")));

        // Test with gemini - should still see claude skills
        let dirs_gemini = get_skill_directories(Some(&project), Some(".gemini"));
        assert!(dirs_gemini.iter().any(|d| d.ends_with(".crafter-code/skills")));
        assert!(dirs_gemini.iter().any(|d| d.ends_with(".gemini/skills")));
        assert!(dirs_gemini.iter().any(|d| d.ends_with(".claude/skills"))); // Can see Claude skills!

        // Verify current provider comes LAST (highest priority)
        let last_dir = dirs_gemini.last().unwrap();
        assert!(last_dir.ends_with(".gemini/skills"));
    }

    #[test]
    fn test_empty_directory() {
        let tmp = TempDir::new().unwrap();
        let skills = discover_skills(tmp.path());
        assert!(skills.is_empty());
    }

    #[test]
    fn test_nonexistent_directory() {
        let skills = discover_skills(Path::new("/nonexistent/path"));
        assert!(skills.is_empty());
    }
}
