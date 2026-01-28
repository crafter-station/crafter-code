//! Swarm CLI command parser and executor
//!
//! Agents communicate with the coordination system via "swarm" commands
//! that get intercepted before being executed as real bash commands.

use crate::inbox::message::MessageType;
use crate::inbox::InboxManager;
use crate::tasks::task::{TaskStatus, TaskUpdate};
use crate::tasks::TaskManager;
use std::sync::Arc;

/// Categories of swarm commands
#[derive(Debug, Clone, PartialEq)]
pub enum SwarmCategory {
    Task,
    Inbox,
    Team, // Future: team management
}

/// Parsed swarm command
#[derive(Debug, Clone)]
pub struct SwarmCommand {
    pub category: SwarmCategory,
    pub action: String,
    pub args: Vec<String>,
}

/// Result of executing a swarm command
#[derive(Debug, Clone)]
pub struct SwarmResult {
    pub success: bool,
    pub output: String,
    pub data: Option<serde_json::Value>,
}

impl SwarmResult {
    pub fn success(output: String, data: Option<serde_json::Value>) -> Self {
        Self {
            success: true,
            output,
            data,
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            success: false,
            output: message,
            data: None,
        }
    }

    pub fn to_json(&self) -> String {
        serde_json::json!({
            "success": self.success,
            "output": self.output,
            "data": self.data
        })
        .to_string()
    }
}

/// Parse a bash command string to check if it's a swarm command
///
/// Format: `swarm <category> <action> [args...]`
///
/// Examples:
/// - `swarm task list`
/// - `swarm task claim`
/// - `swarm task create "Subject" "Description"`
/// - `swarm inbox read`
/// - `swarm inbox write worker-2 "Hello"`
pub fn parse_swarm_command(command: &str) -> Option<SwarmCommand> {
    let trimmed = command.trim();

    // Must start with "swarm "
    if !trimmed.starts_with("swarm ") {
        return None;
    }

    // Parse tokens (respecting quoted strings)
    let tokens = parse_shell_tokens(&trimmed[6..]);
    if tokens.is_empty() {
        return None;
    }

    // First token is category
    let category = match tokens[0].to_lowercase().as_str() {
        "task" => SwarmCategory::Task,
        "inbox" => SwarmCategory::Inbox,
        "team" => SwarmCategory::Team,
        _ => return None,
    };

    // Second token is action
    let action = tokens.get(1).cloned().unwrap_or_default();
    if action.is_empty() {
        return None;
    }

    // Remaining tokens are args
    let args = tokens.into_iter().skip(2).collect();

    Some(SwarmCommand {
        category,
        action,
        args,
    })
}

/// Parse shell-style tokens, respecting quoted strings
fn parse_shell_tokens(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut quote_char = '"';

    for c in input.chars() {
        match c {
            '"' | '\'' if !in_quotes => {
                in_quotes = true;
                quote_char = c;
            }
            c if c == quote_char && in_quotes => {
                in_quotes = false;
            }
            ' ' if !in_quotes => {
                if !current.is_empty() {
                    tokens.push(current);
                    current = String::new();
                }
            }
            _ => {
                current.push(c);
            }
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

/// Execute a swarm command against the TaskManager and InboxManager
pub fn execute_swarm_command(
    cmd: &SwarmCommand,
    task_manager: &Arc<TaskManager>,
    inbox_manager: &Arc<InboxManager>,
    worker_id: &str,
) -> SwarmResult {
    match cmd.category {
        SwarmCategory::Task => execute_task_command(cmd, task_manager, worker_id),
        SwarmCategory::Inbox => execute_inbox_command(cmd, inbox_manager, worker_id),
        SwarmCategory::Team => SwarmResult::error("Team commands not yet implemented".to_string()),
    }
}

/// Execute task-related swarm commands
fn execute_task_command(
    cmd: &SwarmCommand,
    task_manager: &Arc<TaskManager>,
    worker_id: &str,
) -> SwarmResult {
    match cmd.action.as_str() {
        "list" => {
            let tasks = task_manager.list();
            SwarmResult::success(
                format!("Found {} tasks", tasks.len()),
                Some(serde_json::json!(tasks)),
            )
        }

        "get" => {
            let id = cmd.args.first().map(|s| s.as_str()).unwrap_or("");
            if id.is_empty() {
                return SwarmResult::error("Usage: swarm task get <id>".to_string());
            }

            match task_manager.get(id) {
                Some(task) => SwarmResult::success(
                    format!("Task {}: {}", task.id, task.subject),
                    Some(serde_json::json!(task)),
                ),
                None => SwarmResult::error(format!("Task '{}' not found", id)),
            }
        }

        "claim" => {
            match task_manager.claim_available(worker_id) {
                Some(task) => SwarmResult::success(
                    format!("Claimed task {}: {}", task.id, task.subject),
                    Some(serde_json::json!(task)),
                ),
                None => SwarmResult::error("No available tasks to claim".to_string()),
            }
        }

        "create" => {
            if cmd.args.len() < 2 {
                return SwarmResult::error(
                    "Usage: swarm task create \"Subject\" \"Description\"".to_string(),
                );
            }

            let subject = &cmd.args[0];
            let description = &cmd.args[1];
            let active_form = cmd.args.get(2).cloned();

            let task = task_manager.create(subject.clone(), description.clone(), active_form);

            SwarmResult::success(
                format!("Created task {}: {}", task.id, task.subject),
                Some(serde_json::json!(task)),
            )
        }

        "update" => {
            if cmd.args.len() < 2 {
                return SwarmResult::error(
                    "Usage: swarm task update <id> <status|field=value>".to_string(),
                );
            }

            let id = &cmd.args[0];
            let status_or_field = &cmd.args[1];

            // Parse status
            let status = match status_or_field.to_lowercase().as_str() {
                "pending" => Some(TaskStatus::Pending),
                "in_progress" | "inprogress" => Some(TaskStatus::InProgress),
                "completed" | "done" => Some(TaskStatus::Completed),
                "deleted" => Some(TaskStatus::Deleted),
                _ => None,
            };

            let updates = if let Some(s) = status {
                TaskUpdate {
                    status: Some(s),
                    ..Default::default()
                }
            } else {
                // Try to parse as field=value
                return SwarmResult::error(format!(
                    "Invalid status '{}'. Use: pending, in_progress, completed, deleted",
                    status_or_field
                ));
            };

            match task_manager.update(id, updates) {
                Some(task) => SwarmResult::success(
                    format!("Updated task {}: status={:?}", task.id, task.status),
                    Some(serde_json::json!(task)),
                ),
                None => SwarmResult::error(format!("Task '{}' not found", id)),
            }
        }

        "delete" => {
            let id = cmd.args.first().map(|s| s.as_str()).unwrap_or("");
            if id.is_empty() {
                return SwarmResult::error("Usage: swarm task delete <id>".to_string());
            }

            match task_manager.delete(id) {
                Some(task) => SwarmResult::success(
                    format!("Deleted task {}", task.id),
                    Some(serde_json::json!(task)),
                ),
                None => SwarmResult::error(format!("Task '{}' not found", id)),
            }
        }

        _ => SwarmResult::error(format!(
            "Unknown task action '{}'. Available: list, get, claim, create, update, delete",
            cmd.action
        )),
    }
}

/// Execute inbox-related swarm commands
fn execute_inbox_command(
    cmd: &SwarmCommand,
    inbox_manager: &Arc<InboxManager>,
    worker_id: &str,
) -> SwarmResult {
    match cmd.action.as_str() {
        "read" => {
            let unread_only = cmd.args.first().map(|s| s == "--unread").unwrap_or(false);
            let messages = if unread_only {
                inbox_manager.read_unread(worker_id)
            } else {
                inbox_manager.read(worker_id)
            };

            SwarmResult::success(
                format!("Found {} messages", messages.len()),
                Some(serde_json::json!(messages)),
            )
        }

        "write" => {
            if cmd.args.len() < 2 {
                return SwarmResult::error(
                    "Usage: swarm inbox write <to_worker_id> \"message\"".to_string(),
                );
            }

            let to = &cmd.args[0];
            let content = &cmd.args[1];

            let msg = inbox_manager.send(worker_id, to, MessageType::Text {
                content: content.clone(),
            });

            SwarmResult::success(
                format!("Message sent to {}", to),
                Some(serde_json::json!(msg)),
            )
        }

        "broadcast" => {
            if cmd.args.is_empty() {
                return SwarmResult::error(
                    "Usage: swarm inbox broadcast \"message\"".to_string(),
                );
            }

            let content = &cmd.args[0];

            let messages = inbox_manager.broadcast(worker_id, MessageType::Text {
                content: content.clone(),
            });

            SwarmResult::success(
                format!("Broadcast sent to {} workers", messages.len()),
                Some(serde_json::json!(messages)),
            )
        }

        "workers" => {
            let workers = inbox_manager.get_workers();
            SwarmResult::success(
                format!("Found {} workers", workers.len()),
                Some(serde_json::json!(workers)),
            )
        }

        "mark-read" => {
            inbox_manager.mark_all_read(worker_id);
            SwarmResult::success("All messages marked as read".to_string(), None)
        }

        "count" => {
            let unread_only = cmd.args.first().map(|s| s == "--unread").unwrap_or(true);
            let count = inbox_manager.count(worker_id, unread_only);
            SwarmResult::success(
                format!("{} {} messages", count, if unread_only { "unread" } else { "total" }),
                Some(serde_json::json!({ "count": count })),
            )
        }

        _ => SwarmResult::error(format!(
            "Unknown inbox action '{}'. Available: read, write, broadcast, workers, mark-read, count",
            cmd.action
        )),
    }
}

/// Check if a command string is a swarm command
pub fn is_swarm_command(command: &str) -> bool {
    command.trim().starts_with("swarm ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_swarm_command() {
        // Task list
        let cmd = parse_swarm_command("swarm task list").unwrap();
        assert_eq!(cmd.category, SwarmCategory::Task);
        assert_eq!(cmd.action, "list");
        assert!(cmd.args.is_empty());

        // Task create with quoted args
        let cmd = parse_swarm_command("swarm task create \"My Task\" \"Description here\"").unwrap();
        assert_eq!(cmd.category, SwarmCategory::Task);
        assert_eq!(cmd.action, "create");
        assert_eq!(cmd.args, vec!["My Task", "Description here"]);

        // Inbox write
        let cmd = parse_swarm_command("swarm inbox write worker-2 \"Hello there\"").unwrap();
        assert_eq!(cmd.category, SwarmCategory::Inbox);
        assert_eq!(cmd.action, "write");
        assert_eq!(cmd.args, vec!["worker-2", "Hello there"]);

        // Not a swarm command
        assert!(parse_swarm_command("ls -la").is_none());
        assert!(parse_swarm_command("echo swarm").is_none());
    }

    #[test]
    fn test_parse_shell_tokens() {
        let tokens = parse_shell_tokens("task list");
        assert_eq!(tokens, vec!["task", "list"]);

        let tokens = parse_shell_tokens("task create \"Hello World\" \"Description\"");
        assert_eq!(tokens, vec!["task", "create", "Hello World", "Description"]);

        let tokens = parse_shell_tokens("inbox write worker-1 'Single quotes'");
        assert_eq!(tokens, vec!["inbox", "write", "worker-1", "Single quotes"]);
    }
}
