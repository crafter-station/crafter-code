use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

/// Session mode controls how the agent behaves
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SessionMode {
    /// Normal mode - agent executes tools and makes changes directly
    #[default]
    Normal,
    /// Plan mode - agent explores and creates a plan before executing
    Plan,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSession {
    pub id: String,
    pub prompt: String,
    pub status: SessionStatus,
    pub mode: SessionMode,
    pub iteration: u32,
    pub max_iterations: u32,
    pub tokens_used: u64,
    pub cost_usd: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug)]
pub struct AgentManager {
    sessions: HashMap<String, AgentSession>,
}

impl AgentManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    pub fn create_session(&mut self, prompt: String, max_iterations: u32) -> AgentSession {
        self.create_session_with_mode(prompt, max_iterations, SessionMode::Normal)
    }

    pub fn create_session_with_mode(
        &mut self,
        prompt: String,
        max_iterations: u32,
        mode: SessionMode,
    ) -> AgentSession {
        let now = chrono_timestamp();
        let session = AgentSession {
            id: Uuid::new_v4().to_string(),
            prompt,
            status: SessionStatus::Pending,
            mode,
            iteration: 0,
            max_iterations,
            tokens_used: 0,
            cost_usd: 0.0,
            created_at: now,
            updated_at: now,
        };
        self.sessions.insert(session.id.clone(), session.clone());
        session
    }

    pub fn set_session_mode(&mut self, id: &str, mode: SessionMode) -> Option<&AgentSession> {
        if let Some(session) = self.sessions.get_mut(id) {
            session.mode = mode;
            session.updated_at = chrono_timestamp();
            return Some(session);
        }
        None
    }

    pub fn get_session_mode(&self, id: &str) -> Option<SessionMode> {
        self.sessions.get(id).map(|s| s.mode.clone())
    }

    pub fn get_session(&self, id: &str) -> Option<&AgentSession> {
        self.sessions.get(id)
    }

    pub fn update_session_status(&mut self, id: &str, status: SessionStatus) -> Option<&AgentSession> {
        if let Some(session) = self.sessions.get_mut(id) {
            session.status = status;
            session.updated_at = chrono_timestamp();
            return Some(session);
        }
        None
    }

    pub fn increment_iteration(&mut self, id: &str) -> Option<&AgentSession> {
        if let Some(session) = self.sessions.get_mut(id) {
            session.iteration += 1;
            session.updated_at = chrono_timestamp();
            return Some(session);
        }
        None
    }

    pub fn add_cost(&mut self, id: &str, tokens: u64, cost: f64) -> Option<&AgentSession> {
        if let Some(session) = self.sessions.get_mut(id) {
            session.tokens_used += tokens;
            session.cost_usd += cost;
            session.updated_at = chrono_timestamp();
            return Some(session);
        }
        None
    }

    pub fn list_sessions(&self) -> Vec<&AgentSession> {
        self.sessions.values().collect()
    }
}

impl Default for AgentManager {
    fn default() -> Self {
        Self::new()
    }
}

fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
