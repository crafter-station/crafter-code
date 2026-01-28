//! Session persistence for ACP sessions
//!
//! Stores session data in ~/.crafter-code/sessions/{session_id}.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// A message in a persisted session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedMessage {
    pub role: String, // "user" or "assistant"
    pub content: String,
    pub timestamp: i64,
}

/// A persisted session that can be saved/loaded from disk
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedSession {
    /// Our internal session ID
    pub id: String,
    /// The ACP session ID from the agent
    pub acp_session_id: String,
    /// Working directory for the session
    pub cwd: String,
    /// Agent ID (e.g., "claude", "gemini")
    pub agent_id: String,
    /// Unix timestamp when session was created
    pub created_at: i64,
    /// Unix timestamp when session was last updated
    pub updated_at: i64,
    /// Conversation history
    pub messages: Vec<PersistedMessage>,
    /// Current session mode (e.g., "normal", "plan")
    pub mode: String,
    /// Original prompt that started the session
    pub initial_prompt: String,
}

/// Summary of a persisted session for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedSessionSummary {
    pub id: String,
    pub acp_session_id: String,
    pub cwd: String,
    pub agent_id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub message_count: usize,
    pub initial_prompt: String,
}

impl From<&PersistedSession> for PersistedSessionSummary {
    fn from(session: &PersistedSession) -> Self {
        Self {
            id: session.id.clone(),
            acp_session_id: session.acp_session_id.clone(),
            cwd: session.cwd.clone(),
            agent_id: session.agent_id.clone(),
            created_at: session.created_at,
            updated_at: session.updated_at,
            message_count: session.messages.len(),
            initial_prompt: session.initial_prompt.clone(),
        }
    }
}

/// Manages session persistence to disk
pub struct SessionStore {
    base_path: PathBuf,
}

impl SessionStore {
    /// Create a new session store
    pub fn new() -> Result<Self, String> {
        let base_path = dirs::home_dir()
            .ok_or_else(|| "Could not determine home directory".to_string())?
            .join(".crafter-code")
            .join("sessions");

        // Ensure the directory exists
        fs::create_dir_all(&base_path)
            .map_err(|e| format!("Failed to create sessions directory: {}", e))?;

        Ok(Self { base_path })
    }

    /// Get the file path for a session
    fn session_path(&self, session_id: &str) -> PathBuf {
        self.base_path.join(format!("{}.json", session_id))
    }

    /// Save a session to disk
    pub fn save_session(&self, session: &PersistedSession) -> Result<(), String> {
        let path = self.session_path(&session.id);
        let json = serde_json::to_string_pretty(session)
            .map_err(|e| format!("Failed to serialize session: {}", e))?;
        fs::write(&path, json)
            .map_err(|e| format!("Failed to write session file: {}", e))?;
        eprintln!("[SessionStore] Saved session {} to {:?}", session.id, path);
        Ok(())
    }

    /// Load a session from disk
    pub fn load_session(&self, session_id: &str) -> Result<PersistedSession, String> {
        let path = self.session_path(session_id);
        let json = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read session file: {}", e))?;
        let session: PersistedSession = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse session file: {}", e))?;
        Ok(session)
    }

    /// List all persisted sessions (returns summaries, sorted by updated_at desc)
    pub fn list_sessions(&self) -> Vec<PersistedSessionSummary> {
        let mut sessions = Vec::new();

        if let Ok(entries) = fs::read_dir(&self.base_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "json") {
                    if let Ok(json) = fs::read_to_string(&path) {
                        if let Ok(session) = serde_json::from_str::<PersistedSession>(&json) {
                            sessions.push(PersistedSessionSummary::from(&session));
                        }
                    }
                }
            }
        }

        // Sort by updated_at descending (most recent first)
        sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        sessions
    }

    /// Delete a session from disk
    pub fn delete_session(&self, session_id: &str) -> Result<(), String> {
        let path = self.session_path(session_id);
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete session file: {}", e))?;
            eprintln!("[SessionStore] Deleted session {}", session_id);
        }
        Ok(())
    }

    /// Check if a session exists
    pub fn session_exists(&self, session_id: &str) -> bool {
        self.session_path(session_id).exists()
    }
}

impl Default for SessionStore {
    fn default() -> Self {
        Self::new().expect("Failed to create session store")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_store() {
        let store = SessionStore::new().unwrap();

        let session = PersistedSession {
            id: "test_session_123".to_string(),
            acp_session_id: "acp_456".to_string(),
            cwd: "/tmp/test".to_string(),
            agent_id: "claude".to_string(),
            created_at: 1706000000,
            updated_at: 1706001000,
            messages: vec![
                PersistedMessage {
                    role: "user".to_string(),
                    content: "Hello".to_string(),
                    timestamp: 1706000100,
                },
            ],
            mode: "normal".to_string(),
            initial_prompt: "Hello".to_string(),
        };

        // Save
        store.save_session(&session).unwrap();

        // Load
        let loaded = store.load_session("test_session_123").unwrap();
        assert_eq!(loaded.id, session.id);
        assert_eq!(loaded.messages.len(), 1);

        // List
        let sessions = store.list_sessions();
        assert!(sessions.iter().any(|s| s.id == "test_session_123"));

        // Delete
        store.delete_session("test_session_123").unwrap();
        assert!(!store.session_exists("test_session_123"));
    }
}
