//! Agent registry for ACP-compatible CLI agents
//!
//! Supported agents:
//! - Claude Code (via claude-code-acp adapter)
//! - Gemini CLI (native ACP support)
//! - Codex CLI (OpenAI's coding agent)

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
}

impl AgentConfig {
    fn new(
        id: &str,
        name: &str,
        description: &str,
        command: &str,
        args: Vec<&str>,
        env_vars: Vec<&str>,
    ) -> Self {
        let available = check_command_exists(command);
        Self {
            id: id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            command: command.to_string(),
            args: args.into_iter().map(String::from).collect(),
            available,
            env_vars: env_vars.into_iter().map(String::from).collect(),
        }
    }
}

/// Check if a command exists in PATH
fn check_command_exists(command: &str) -> bool {
    Command::new("which")
        .arg(command)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
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

/// Get a specific agent by ID
pub fn get_agent(id: &str) -> Option<AgentConfig> {
    known_agents().into_iter().find(|a| a.id == id && a.available)
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
