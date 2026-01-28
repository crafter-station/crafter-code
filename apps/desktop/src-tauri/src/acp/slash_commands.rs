//! Slash Commands System
//!
//! Client-side slash commands that users can invoke via `/command` syntax.
//! These are processed by the client before being sent to the agent.
//!
//! Similar to Claude Code's commands like `/commit`, `/test`, `/plan`.

use serde::{Deserialize, Serialize};

/// A slash command definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommand {
    /// Command name without the `/` prefix
    pub name: String,
    /// Human-readable description
    pub description: String,
    /// Input hint if command accepts arguments
    pub input_hint: Option<String>,
    /// Category for grouping in UI
    pub category: CommandCategory,
    /// The prompt template to inject when command is invoked
    /// Use `{input}` placeholder for user input
    pub prompt_template: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CommandCategory {
    Swarm,
    Code,
    Git,
    Analysis,
    Utility,
}

impl SlashCommand {
    pub fn new(
        name: impl Into<String>,
        description: impl Into<String>,
        category: CommandCategory,
        prompt_template: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            input_hint: None,
            category,
            prompt_template: prompt_template.into(),
        }
    }

    pub fn with_input(mut self, hint: impl Into<String>) -> Self {
        self.input_hint = Some(hint.into());
        self
    }

    /// Expand the prompt template with user input
    pub fn expand(&self, input: &str) -> String {
        self.prompt_template.replace("{input}", input)
    }
}

/// Get all built-in slash commands
pub fn get_builtin_commands() -> Vec<SlashCommand> {
    vec![
        // ==================== SWARM COMMANDS ====================
        SlashCommand::new(
            "tasks",
            "Show all tasks in the current session",
            CommandCategory::Swarm,
            "Use `swarm task list` to show me all current tasks. Display them in a clear format.",
        ),
        SlashCommand::new(
            "claim",
            "Claim the next available task",
            CommandCategory::Swarm,
            "Use `swarm task claim` to claim the next available task. Then tell me what task you claimed and what needs to be done.",
        ),
        SlashCommand::new(
            "inbox",
            "Check inbox for messages from other workers",
            CommandCategory::Swarm,
            "Use `swarm inbox read` to check for messages from other workers. Summarize any important messages.",
        ),
        SlashCommand::new(
            "workers",
            "List all workers in the session",
            CommandCategory::Swarm,
            "Use `swarm inbox workers` to list all workers in this session. Tell me who is available.",
        ),
        SlashCommand::new(
            "broadcast",
            "Send a message to all workers",
            CommandCategory::Swarm,
            "Use `swarm inbox broadcast \"{input}\"` to send this message to all workers.",
        )
        .with_input("message to broadcast"),
        SlashCommand::new(
            "create-task",
            "Create a new task",
            CommandCategory::Swarm,
            r#"Create a new task using: swarm task create "{input}"
After creating, show me the task details."#,
        )
        .with_input("task subject"),

        // ==================== CODE COMMANDS ====================
        SlashCommand::new(
            "review",
            "Review recent code changes",
            CommandCategory::Code,
            r#"Review the recent code changes in this project. Focus on:
1. Correctness - Does the code work as intended?
2. Security - Any potential vulnerabilities?
3. Performance - Any obvious inefficiencies?
4. Style - Does it follow project conventions?

Provide constructive feedback with specific suggestions."#,
        ),
        SlashCommand::new(
            "test",
            "Run tests for the project",
            CommandCategory::Code,
            "Find and run the appropriate test command for this project. Show me the results and summarize any failures.",
        ),
        SlashCommand::new(
            "explain",
            "Explain how something works",
            CommandCategory::Code,
            "Explain how {input} works in this codebase. Include relevant code snippets and architecture details.",
        )
        .with_input("feature or component to explain"),
        SlashCommand::new(
            "refactor",
            "Suggest refactoring improvements",
            CommandCategory::Code,
            r#"Analyze {input} and suggest refactoring improvements. Consider:
- Code duplication
- Complexity reduction
- Better abstractions
- Performance optimizations

Show specific before/after examples."#,
        )
        .with_input("file or function to refactor"),

        // ==================== GIT COMMANDS ====================
        SlashCommand::new(
            "status",
            "Show git status and recent changes",
            CommandCategory::Git,
            "Show git status and recent commits. Summarize what has changed.",
        ),
        SlashCommand::new(
            "commit",
            "Create a commit with a good message",
            CommandCategory::Git,
            r#"Review staged changes and create a commit with a well-formatted message following conventional commits:
- Use type: feat, fix, docs, refactor, test, chore
- Keep subject under 50 chars
- Add body if changes are complex

Show me the proposed commit message before committing."#,
        ),
        SlashCommand::new(
            "diff",
            "Show and explain current diff",
            CommandCategory::Git,
            "Show the current git diff and explain the changes. Group by file and highlight important modifications.",
        ),

        // ==================== ANALYSIS COMMANDS ====================
        SlashCommand::new(
            "analyze",
            "Analyze the codebase structure",
            CommandCategory::Analysis,
            "Analyze the structure of this codebase. Show me the main components, their relationships, and any notable patterns.",
        ),
        SlashCommand::new(
            "deps",
            "Analyze dependencies",
            CommandCategory::Analysis,
            "Analyze the project dependencies. List main dependencies, their purposes, and flag any that might be outdated or have known issues.",
        ),
        SlashCommand::new(
            "security",
            "Security analysis",
            CommandCategory::Analysis,
            r#"Perform a security analysis of the codebase. Look for:
1. Hardcoded secrets or credentials
2. SQL injection vulnerabilities
3. XSS vulnerabilities
4. Insecure dependencies
5. Authentication/authorization issues

Report findings with severity levels."#,
        ),

        // ==================== UTILITY COMMANDS ====================
        SlashCommand::new(
            "help",
            "Show available commands",
            CommandCategory::Utility,
            "List all available slash commands with their descriptions.",
        ),
        SlashCommand::new(
            "clear",
            "Clear context and start fresh",
            CommandCategory::Utility,
            "Acknowledge that the context should be cleared. The client will handle the actual clearing.",
        ),
        SlashCommand::new(
            "compact",
            "Summarize and compact the conversation",
            CommandCategory::Utility,
            "Summarize the key points of our conversation so far in a concise format. This will help maintain context while reducing token usage.",
        ),
    ]
}

/// Parse a user input to extract slash command
pub fn parse_slash_command(input: &str) -> Option<(String, String)> {
    let trimmed = input.trim();
    if !trimmed.starts_with('/') {
        return None;
    }

    let without_slash = &trimmed[1..];
    let parts: Vec<&str> = without_slash.splitn(2, ' ').collect();

    let command_name = parts.first()?.to_string();
    let args = parts.get(1).map(|s| s.to_string()).unwrap_or_default();

    Some((command_name, args))
}

/// Command registry for a session
pub struct CommandRegistry {
    commands: Vec<SlashCommand>,
}

impl CommandRegistry {
    pub fn new() -> Self {
        Self {
            commands: get_builtin_commands(),
        }
    }

    /// Get all available commands
    pub fn list_commands(&self) -> &[SlashCommand] {
        &self.commands
    }

    /// Get commands by category
    pub fn get_by_category(&self, category: CommandCategory) -> Vec<&SlashCommand> {
        self.commands
            .iter()
            .filter(|c| c.category == category)
            .collect()
    }

    /// Find a command by name
    pub fn find_command(&self, name: &str) -> Option<&SlashCommand> {
        self.commands.iter().find(|c| c.name == name)
    }

    /// Process a slash command input, returning the expanded prompt
    pub fn process_command(&self, input: &str) -> Option<String> {
        let (name, args) = parse_slash_command(input)?;
        let command = self.find_command(&name)?;
        Some(command.expand(&args))
    }

    /// Add a custom command
    #[allow(dead_code)]
    pub fn add_command(&mut self, command: SlashCommand) {
        // Replace if exists, otherwise add
        if let Some(idx) = self.commands.iter().position(|c| c.name == command.name) {
            self.commands[idx] = command;
        } else {
            self.commands.push(command);
        }
    }
}

impl Default for CommandRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_slash_command() {
        assert_eq!(
            parse_slash_command("/tasks"),
            Some(("tasks".to_string(), "".to_string()))
        );

        assert_eq!(
            parse_slash_command("/broadcast hello world"),
            Some(("broadcast".to_string(), "hello world".to_string()))
        );

        assert_eq!(parse_slash_command("not a command"), None);
    }

    #[test]
    fn test_command_expansion() {
        let cmd = SlashCommand::new(
            "test",
            "Test command",
            CommandCategory::Utility,
            "Do something with {input}",
        );

        assert_eq!(cmd.expand("foo bar"), "Do something with foo bar");
    }

    #[test]
    fn test_command_registry() {
        let registry = CommandRegistry::new();

        assert!(registry.find_command("tasks").is_some());
        assert!(registry.find_command("nonexistent").is_none());

        let swarm_cmds = registry.get_by_category(CommandCategory::Swarm);
        assert!(!swarm_cmds.is_empty());
    }
}
