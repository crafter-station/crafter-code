//! Coordination system prompt builder
//!
//! Generates the system context that gets prepended to agent prompts
//! to enable swarm coordination via Task and Inbox primitives.

use crate::tasks::task::{Task, TaskStatus};

/// Build the coordination prompt to inject into agent context
pub fn build_coordination_prompt(
    worker_id: &str,
    session_id: &str,
    is_leader: bool,
    initial_tasks: &[Task],
) -> String {
    let role_description = if is_leader {
        "You are the **leader** of this session. Coordinate work, create tasks for the team, and manage other workers."
    } else {
        "You are a **worker** in this session. Claim tasks, complete work, and communicate with your team."
    };

    let task_list = format_tasks(initial_tasks);

    format!(
        r#"## Swarm Coordination

You are worker `{worker_id}` in session `{session_id}`.
{role_description}

### Available Commands (via Bash tool)

You can coordinate with other workers using these commands:

**Task Management:**
```bash
swarm task list                              # See all tasks
swarm task get <id>                          # Get task details
swarm task claim                             # Claim next available task
swarm task update <id> completed             # Mark task done
swarm task update <id> in_progress           # Mark task in progress
swarm task create "Subject" "Description"   # Create new task
swarm task delete <id>                       # Delete a task
```

**Communication:**
```bash
swarm inbox read                             # Check messages from other workers
swarm inbox read --unread                    # Check only unread messages
swarm inbox write <worker-id> "message"      # Send to specific worker
swarm inbox broadcast "message"              # Send to all workers
swarm inbox workers                          # List all workers
swarm inbox count                            # Count unread messages
swarm inbox mark-read                        # Mark all messages as read
```

### Coordination Workflow

1. **Check inbox first**: `swarm inbox read --unread`
2. **Review available tasks**: `swarm task list`
3. **Claim work**: `swarm task claim`
4. **Do the actual work** (write code, edit files, etc.)
5. **Mark complete**: `swarm task update <id> completed`
6. **Notify team**: `swarm inbox broadcast "Completed: <subject>"`
7. **Repeat** or wait for new work

### Task Status Flow

```
pending → in_progress → completed
                     ↘ deleted
```

- **pending**: Not started, available to claim
- **in_progress**: Someone is working on it
- **completed**: Done
- **deleted**: Removed

### Task Dependencies

Tasks can have dependencies (blocked_by). A task is only claimable when:
- Status is `pending`
- No owner assigned
- All `blocked_by` tasks are completed

### Current Session State

**Workers in session:** Check with `swarm inbox workers`

**Current Tasks:**
{task_list}

---

"#,
        worker_id = worker_id,
        session_id = session_id,
        role_description = role_description,
        task_list = task_list,
    )
}

/// Format tasks for display in the prompt
fn format_tasks(tasks: &[Task]) -> String {
    if tasks.is_empty() {
        return "No tasks created yet. Create some with `swarm task create`.".to_string();
    }

    let mut output = String::new();
    for task in tasks {
        let status_emoji = match task.status {
            TaskStatus::Pending => "[ ]",
            TaskStatus::InProgress => "[~]",
            TaskStatus::Completed => "[x]",
            TaskStatus::Deleted => "[-]",
        };

        let owner = task
            .owner
            .as_ref()
            .map(|o| format!(" ({})", o))
            .unwrap_or_default();

        let blocked = if !task.blocked_by.is_empty() {
            format!(" blocked by: {}", task.blocked_by.join(", "))
        } else {
            String::new()
        };

        output.push_str(&format!(
            "- {} #{} {}{}{}\n",
            status_emoji, task.id, task.subject, owner, blocked
        ));
    }

    output
}

/// Build a minimal prompt for non-coordinated sessions
#[allow(dead_code)]
pub fn build_minimal_prompt(worker_id: &str) -> String {
    format!(
        r#"You are worker `{worker_id}`.

If you need to coordinate with other workers, you can use swarm commands via Bash:
- `swarm task list` - See all tasks
- `swarm task claim` - Claim next available task
- `swarm inbox read` - Check messages

---

"#,
        worker_id = worker_id,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tasks::task::Task;
    use std::collections::HashMap;

    fn make_task(id: &str, subject: &str, status: TaskStatus) -> Task {
        Task {
            id: id.to_string(),
            subject: subject.to_string(),
            description: "Test description".to_string(),
            active_form: None,
            status,
            owner: None,
            blocked_by: vec![],
            blocks: vec![],
            metadata: HashMap::new(),
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn test_build_coordination_prompt_leader() {
        let tasks = vec![
            make_task("1", "Setup project", TaskStatus::Completed),
            make_task("2", "Implement feature", TaskStatus::Pending),
        ];

        let prompt = build_coordination_prompt("worker-1", "session-123", true, &tasks);

        assert!(prompt.contains("worker `worker-1`"));
        assert!(prompt.contains("session `session-123`"));
        assert!(prompt.contains("**leader**"));
        assert!(prompt.contains("[x] #1 Setup project"));
        assert!(prompt.contains("[ ] #2 Implement feature"));
    }

    #[test]
    fn test_build_coordination_prompt_worker() {
        let prompt = build_coordination_prompt("worker-2", "session-456", false, &[]);

        assert!(prompt.contains("**worker**"));
        assert!(prompt.contains("No tasks created yet"));
    }

    #[test]
    fn test_format_tasks_with_dependencies() {
        let mut task = make_task("3", "Deploy", TaskStatus::Pending);
        task.blocked_by = vec!["1".to_string(), "2".to_string()];

        let output = format_tasks(&[task]);
        assert!(output.contains("blocked by: 1, 2"));
    }
}
