use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessageType {
    /// Simple text message
    Text { content: String },

    /// Worker requests permission to shut down
    ShutdownRequest { request_id: String, reason: String },

    /// Leader approves shutdown
    ShutdownApproved { request_id: String },

    /// Leader rejects shutdown with reason
    ShutdownRejected { request_id: String, reason: String },

    /// Worker notifies it's idle (waiting for work)
    IdleNotification { completed_task_id: Option<String> },

    /// Notification that a task was completed
    TaskCompleted {
        task_id: String,
        task_subject: String,
    },

    /// Worker requests plan approval
    PlanApprovalRequest {
        request_id: String,
        plan_content: String,
    },

    /// Leader approves plan
    PlanApproved { request_id: String },

    /// Leader rejects plan with feedback
    PlanRejected { request_id: String, feedback: String },

    /// Generic structured data
    Custom {
        action: String,
        data: serde_json::Value,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub from: String,
    pub to: String,
    pub message: MessageType,
    pub read: bool,
    pub timestamp: i64,
}

pub struct InboxManager {
    /// worker_id -> messages
    inboxes: Mutex<HashMap<String, Vec<Message>>>,
    /// Track all known workers for broadcast
    workers: Mutex<Vec<String>>,
    #[allow(dead_code)]
    session_id: String,
}

impl InboxManager {
    pub fn new(session_id: String) -> Self {
        Self {
            inboxes: Mutex::new(HashMap::new()),
            workers: Mutex::new(Vec::new()),
            session_id,
        }
    }

    /// Register a worker (call when worker joins session)
    pub fn register_worker(&self, worker_id: &str) {
        let mut workers = self.workers.lock();
        if !workers.contains(&worker_id.to_string()) {
            workers.push(worker_id.to_string());
        }

        // Initialize inbox
        let mut inboxes = self.inboxes.lock();
        inboxes
            .entry(worker_id.to_string())
            .or_insert_with(Vec::new);
    }

    /// Send a message from one worker to another
    pub fn send(&self, from: &str, to: &str, message: MessageType) -> Message {
        let mut inboxes = self.inboxes.lock();
        let inbox = inboxes.entry(to.to_string()).or_insert_with(Vec::new);

        let msg = Message {
            id: uuid::Uuid::new_v4().to_string(),
            from: from.to_string(),
            to: to.to_string(),
            message,
            read: false,
            timestamp: chrono::Utc::now().timestamp_millis(),
        };

        inbox.push(msg.clone());
        msg
    }

    /// Broadcast a message to all workers except sender
    pub fn broadcast(&self, from: &str, message: MessageType) -> Vec<Message> {
        let workers = self.workers.lock().clone();
        workers
            .iter()
            .filter(|w| *w != from)
            .map(|to| self.send(from, to, message.clone()))
            .collect()
    }

    /// Broadcast to specific workers
    pub fn broadcast_to(&self, from: &str, message: MessageType, targets: &[String]) -> Vec<Message> {
        targets
            .iter()
            .filter(|w| *w != from)
            .map(|to| self.send(from, to, message.clone()))
            .collect()
    }

    /// Read all messages for a worker
    pub fn read(&self, worker_id: &str) -> Vec<Message> {
        let inboxes = self.inboxes.lock();
        inboxes.get(worker_id).cloned().unwrap_or_default()
    }

    /// Read only unread messages
    pub fn read_unread(&self, worker_id: &str) -> Vec<Message> {
        let inboxes = self.inboxes.lock();
        inboxes
            .get(worker_id)
            .map(|msgs| msgs.iter().filter(|m| !m.read).cloned().collect())
            .unwrap_or_default()
    }

    /// Mark specific messages as read
    pub fn mark_read(&self, worker_id: &str, message_ids: &[String]) {
        let mut inboxes = self.inboxes.lock();
        if let Some(inbox) = inboxes.get_mut(worker_id) {
            for msg in inbox.iter_mut() {
                if message_ids.contains(&msg.id) {
                    msg.read = true;
                }
            }
        }
    }

    /// Mark all messages as read
    pub fn mark_all_read(&self, worker_id: &str) {
        let mut inboxes = self.inboxes.lock();
        if let Some(inbox) = inboxes.get_mut(worker_id) {
            for msg in inbox.iter_mut() {
                msg.read = true;
            }
        }
    }

    /// Get all registered workers
    pub fn get_workers(&self) -> Vec<String> {
        self.workers.lock().clone()
    }

    /// Unregister a worker (call when worker leaves session)
    pub fn unregister_worker(&self, worker_id: &str) {
        let mut workers = self.workers.lock();
        workers.retain(|w| w != worker_id);
    }

    /// Get message count for a worker
    pub fn count(&self, worker_id: &str, unread_only: bool) -> usize {
        let inboxes = self.inboxes.lock();
        inboxes
            .get(worker_id)
            .map(|msgs| {
                if unread_only {
                    msgs.iter().filter(|m| !m.read).count()
                } else {
                    msgs.len()
                }
            })
            .unwrap_or(0)
    }
}
