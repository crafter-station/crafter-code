use serde::{Deserialize, Serialize};

/// Ralph Loop stop hook detection
///
/// The Ralph Wiggum Method keeps agents iterating until they deliver
/// a completion promise. This module detects:
/// 1. Agent exit attempts (should re-prompt)
/// 2. Completion promises (should stop the loop)

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopHookEvent {
    pub event_type: StopHookEventType,
    pub session_id: String,
    pub message: String,
    pub timestamp: i64,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StopHookEventType {
    /// Agent attempted to exit without completion
    ExitAttempt,
    /// Agent delivered a completion promise
    CompletionPromise,
    /// Agent hit max iterations
    MaxIterationsReached,
    /// Agent encountered an error
    Error,
    /// User manually stopped the agent
    UserCancelled,
}

#[allow(dead_code)]
/// Patterns that indicate a completion promise
const COMPLETION_PATTERNS: &[&str] = &[
    "task complete",
    "task completed",
    "successfully completed",
    "finished implementing",
    "implementation complete",
    "all tests passing",
    "ready for review",
    "pr created",
    "pull request created",
    "deployed successfully",
    "build successful",
];

#[allow(dead_code)]
/// Patterns that indicate an exit attempt without completion
const EXIT_PATTERNS: &[&str] = &[
    "let me know if",
    "feel free to",
    "is there anything else",
    "shall i",
    "would you like me to",
    "i can help with",
    "what would you like",
    "how can i assist",
];

#[allow(dead_code)]
pub struct StopHookHandler;

#[allow(dead_code)]
impl StopHookHandler {
    /// Analyze output to detect stop events
    pub fn analyze_output(session_id: &str, output: &str) -> Option<StopHookEvent> {
        let output_lower = output.to_lowercase();

        // Check for completion patterns first
        for pattern in COMPLETION_PATTERNS {
            if output_lower.contains(pattern) {
                return Some(StopHookEvent {
                    event_type: StopHookEventType::CompletionPromise,
                    session_id: session_id.to_string(),
                    message: format!("Detected completion: {}", pattern),
                    timestamp: chrono_timestamp(),
                });
            }
        }

        // Check for exit patterns
        for pattern in EXIT_PATTERNS {
            if output_lower.contains(pattern) {
                return Some(StopHookEvent {
                    event_type: StopHookEventType::ExitAttempt,
                    session_id: session_id.to_string(),
                    message: format!("Detected exit attempt: {}", pattern),
                    timestamp: chrono_timestamp(),
                });
            }
        }

        None
    }

    /// Create a re-prompt message for exit attempts
    pub fn create_reprompt(original_prompt: &str, iteration: u32) -> String {
        format!(
            "Your task is not complete. Continue working on: {}\n\n\
            This is iteration {}. Do not ask for confirmation or clarification. \
            Complete the task and report when done with a completion statement like \
            'Task completed' or 'Implementation complete'.",
            original_prompt,
            iteration + 1
        )
    }
}

#[allow(dead_code)]
fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detects_completion() {
        let result = StopHookHandler::analyze_output("test-session", "Task completed successfully");
        assert!(result.is_some());
        assert_eq!(result.unwrap().event_type, StopHookEventType::CompletionPromise);
    }

    #[test]
    fn test_detects_exit_attempt() {
        let result = StopHookHandler::analyze_output("test-session", "Let me know if you need anything else");
        assert!(result.is_some());
        assert_eq!(result.unwrap().event_type, StopHookEventType::ExitAttempt);
    }

    #[test]
    fn test_no_detection_on_normal_output() {
        let result = StopHookHandler::analyze_output("test-session", "Writing the function now...");
        assert!(result.is_none());
    }
}
