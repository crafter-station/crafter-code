//! Agent registry for ACP-compatible CLI agents
//!
//! Supported agents:
//! - Claude Code (via claude-code-acp adapter)
//! - Gemini CLI (native ACP support)
//! - Codex CLI (OpenAI's coding agent)
//! - OpenCode (open source coding agent)
//! - GitHub Copilot (via copilot-language-server)

use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub command: String,
    pub args: Vec<String>,
    pub available: bool,
    /// Environment variables required for this agent
    pub env_vars: Vec<String>,
    /// Config directory name for this agent (e.g., ".claude", ".gemini", ".copilot")
    /// Used for provider-specific skills and commands
    pub config_dir: String,
}

impl AgentConfig {
    fn new(
        id: &str,
        name: &str,
        description: &str,
        command: &str,
        args: Vec<&str>,
        env_vars: Vec<&str>,
        config_dir: &str,
    ) -> Self {
        let available = check_command_exists(command);
        // Use full path if found in common locations
        let resolved_command = if available {
            get_command_path(command)
        } else {
            command.to_string()
        };
        Self {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            command: resolved_command,
            args: args.into_iter().map(String::from).collect(),
            available,
            env_vars: env_vars.into_iter().map(String::from).collect(),
            config_dir: config_dir.to_string(),
        }
    }

    /// Create an agent that's always marked as unavailable (e.g., requires subscription)
    fn unavailable(
        id: &str,
        name: &str,
        description: &str,
        command: &str,
        args: Vec<&str>,
        config_dir: &str,
    ) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            command: command.to_string(),
            args: args.into_iter().map(String::from).collect(),
            available: false,
            env_vars: vec![],
            config_dir: config_dir.to_string(),
        }
    }
}

/// Check if a command exists in PATH or common install locations
fn check_command_exists(command: &str) -> bool {
    // First check PATH
    let in_path = Command::new("which")
        .arg(command)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false);

    if in_path {
        return true;
    }

    // Check common install locations
    let home = std::env::var("HOME").unwrap_or_default();
    let common_paths = [
        format!("{}/.opencode/bin/{}", home, command),
        format!("{}/go/bin/{}", home, command),
        format!("{}/.local/bin/{}", home, command),
        format!("{}/.cargo/bin/{}", home, command),
        format!("{}/.copilot/bin/{}", home, command),
    ];

    common_paths.iter().any(|path| std::path::Path::new(path).exists())
}

/// Get the actual command path (checking common locations)
fn get_command_path(command: &str) -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let common_paths = [
        (format!("{}/.opencode/bin/{}", home, command), command),
        (format!("{}/go/bin/{}", home, command), command),
        (format!("{}/.local/bin/{}", home, command), command),
        (format!("{}/.cargo/bin/{}", home, command), command),
        (format!("{}/.copilot/bin/{}", home, command), command),
    ];

    for (path, _cmd) in common_paths {
        if std::path::Path::new(&path).exists() {
            return path;
        }
    }

    // Fallback to command name (will use PATH)
    command.to_string()
}

/// Get the default list of known ACP-compatible agents
/// Registry: https://agentclientprotocol.com/registry
fn known_agents() -> Vec<AgentConfig> {
    vec![
        // Claude Code via ACP adapter
        // Install: npm install -g @anthropic-ai/claude-code-acp
        AgentConfig::new(
            "claude",
            "Claude Code",
            "Anthropic's Claude Code via ACP",
            "claude-code-acp",
            vec![],
            vec!["ANTHROPIC_API_KEY"],
            ".claude",
        ),
        // Gemini CLI with experimental ACP mode
        // Install: bun install -g @google/gemini-cli
        AgentConfig::new(
            "gemini",
            "Gemini CLI",
            "Google's Gemini 2.5 Pro",
            "gemini",
            vec!["--experimental-acp"],
            vec![],
            ".gemini",
        ),
        // Codex ACP adapter by Zed Industries
        // Install: bun install -g @zed-industries/codex-acp
        AgentConfig::new(
            "codex",
            "Codex CLI",
            "OpenAI Codex via ACP adapter",
            "codex-acp",
            vec![],
            vec!["OPENAI_API_KEY"],
            ".codex",
        ),
        // OpenCode - open source coding agent
        // Install: go install github.com/anomaly/opencode@latest
        // Docs: https://opencode.ai/docs/integrations/acp
        AgentConfig::new(
            "opencode",
            "OpenCode",
            "Open source coding agent",
            "opencode",
            vec!["acp"],
            vec![],
            ".opencode",
        ),
        // GitHub Copilot CLI with ACP support (hidden flag)
        // Install: brew install --cask copilot-cli
        // Requires: GitHub Copilot subscription (Pro/Enterprise)
        AgentConfig::unavailable(
            "copilot",
            "GitHub Copilot",
            "Requires Copilot subscription",
            "copilot",
            vec!["--acp"],
            ".copilot",
        ),
    ]
}

/// Discover available CLI agents on the system
pub fn discover_agents() -> Vec<AgentConfig> {
    known_agents()
        .into_iter()
        .filter(|agent| agent.available)
        .collect()
}

/// Get all known agents (including unavailable ones)
#[allow(dead_code)]
pub fn list_all_agents() -> Vec<AgentConfig> {
    known_agents()
}

/// Get a specific agent by ID (only if available)
pub fn get_agent(id: &str) -> Option<AgentConfig> {
    known_agents().into_iter().find(|a| a.id == id && a.available)
}

/// Get a specific agent config by ID (regardless of availability)
/// Used for getting config_dir even when agent is not installed
pub fn get_agent_config(id: &str) -> Option<AgentConfig> {
    known_agents().into_iter().find(|a| a.id == id)
}

/// Get the default agent (Claude if available, otherwise first available)
#[allow(dead_code)]
pub fn default_agent() -> Option<AgentConfig> {
    let agents = discover_agents();
    agents
        .iter()
        .find(|a| a.id == "claude")
        .cloned()
        .or_else(|| agents.into_iter().next())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_known_agents_not_empty() {
        assert!(!known_agents().is_empty());
    }

    #[test]
    fn test_claude_is_first() {
        let agents = known_agents();
        assert_eq!(agents[0].id, "claude");
    }
}
