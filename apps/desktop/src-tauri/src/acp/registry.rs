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
pub struct AgentModel {
    pub id: String,
    pub name: String,
    pub description: String,
}

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
    /// Available models for this agent
    pub models: Vec<AgentModel>,
    /// Default model ID
    pub default_model: String,
    /// Environment variable to set model (e.g., "ANTHROPIC_MODEL")
    pub model_env_var: Option<String>,
    /// CLI flag to pass model (e.g., "--model" for Claude)
    pub model_cli_flag: Option<String>,
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
        models: Vec<AgentModel>,
        default_model: &str,
        model_env_var: Option<&str>,
        model_cli_flag: Option<&str>,
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
            models,
            default_model: default_model.to_string(),
            model_env_var: model_env_var.map(String::from),
            model_cli_flag: model_cli_flag.map(String::from),
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
            models: vec![],
            default_model: String::new(),
            model_env_var: None,
            model_cli_flag: None,
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
            vec![
                AgentModel {
                    id: "claude-sonnet-4-5-20250929".to_string(),
                    name: "Sonnet 4.5".to_string(),
                    description: "Latest Sonnet - best balance of speed and intelligence".to_string(),
                },
                AgentModel {
                    id: "claude-opus-4-5-20251101".to_string(),
                    name: "Opus 4.5".to_string(),
                    description: "Most intelligent - frontier performance".to_string(),
                },
                AgentModel {
                    id: "claude-haiku-4-5-20251001".to_string(),
                    name: "Haiku 4.5".to_string(),
                    description: "Near-frontier at lower cost and faster speeds".to_string(),
                },
            ],
            "claude-sonnet-4-5-20250929",
            Some("ANTHROPIC_MODEL"),
            Some("--model"),  // CLI flag to pass model
        ),
        // Gemini CLI with experimental ACP mode
        // Install: bun install -g @google/gemini-cli
        AgentConfig::new(
            "gemini",
            "Gemini CLI",
            "Google's Gemini via ACP",
            "gemini",
            vec!["--experimental-acp"],
            vec![],
            ".gemini",
            vec![
                AgentModel {
                    id: "gemini-2.5-pro".to_string(),
                    name: "2.5 Pro".to_string(),
                    description: "Most capable - deep reasoning and analysis".to_string(),
                },
                AgentModel {
                    id: "gemini-2.5-flash".to_string(),
                    name: "2.5 Flash".to_string(),
                    description: "Fast reasoning with thinking features".to_string(),
                },
                AgentModel {
                    id: "gemini-2.5-flash-lite".to_string(),
                    name: "2.5 Flash-Lite".to_string(),
                    description: "Optimized for low latency, 1M context".to_string(),
                },
                AgentModel {
                    id: "gemini-3-flash-preview".to_string(),
                    name: "3 Flash Preview".to_string(),
                    description: "Next-gen preview - frontier performance".to_string(),
                },
            ],
            "gemini-2.5-pro",
            Some("GEMINI_MODEL"),
            Some("--model"),  // CLI flag to pass model
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
            vec![
                AgentModel {
                    id: "gpt-5.2-codex".to_string(),
                    name: "GPT-5.2 Codex".to_string(),
                    description: "Most advanced agentic coding model".to_string(),
                },
                AgentModel {
                    id: "codex-1".to_string(),
                    name: "Codex 1 (o3)".to_string(),
                    description: "Default Codex CLI model based on o3".to_string(),
                },
                AgentModel {
                    id: "codex-mini-latest".to_string(),
                    name: "Codex Mini".to_string(),
                    description: "Fast o4-mini based, low-latency editing".to_string(),
                },
                AgentModel {
                    id: "o3-pro".to_string(),
                    name: "o3 Pro".to_string(),
                    description: "More compute for complex reasoning".to_string(),
                },
            ],
            "codex-1",
            Some("OPENAI_MODEL"),
            Some("--model"),  // CLI flag to pass model
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
            vec![
                AgentModel {
                    id: "default".to_string(),
                    name: "Default".to_string(),
                    description: "OpenCode default model".to_string(),
                },
            ],
            "default",
            None,
            None,  // No CLI flag for model
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
