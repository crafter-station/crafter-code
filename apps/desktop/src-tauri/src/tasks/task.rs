use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Deleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub subject: String,
    pub description: String,
    pub active_form: Option<String>,
    pub status: TaskStatus,
    pub owner: Option<String>,
    pub blocked_by: Vec<String>,
    pub blocks: Vec<String>,
    pub metadata: HashMap<String, serde_json::Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct TaskManager {
    tasks: Mutex<HashMap<String, Task>>,
    next_id: Mutex<u64>,
    #[allow(dead_code)]
    session_id: String,
}

impl TaskManager {
    pub fn new(session_id: String) -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
            session_id,
        }
    }

    pub fn create(
        &self,
        subject: String,
        description: String,
        active_form: Option<String>,
    ) -> Task {
        let mut tasks = self.tasks.lock();
        let mut next_id = self.next_id.lock();

        let id = next_id.to_string();
        *next_id += 1;

        let now = chrono::Utc::now().timestamp_millis();
        let task = Task {
            id: id.clone(),
            subject,
            description,
            active_form,
            status: TaskStatus::Pending,
            owner: None,
            blocked_by: vec![],
            blocks: vec![],
            metadata: HashMap::new(),
            created_at: now,
            updated_at: now,
        };

        tasks.insert(id, task.clone());
        task
    }

    pub fn update(&self, id: &str, updates: TaskUpdate) -> Option<Task> {
        let mut tasks = self.tasks.lock();
        let task_id = id.to_string();

        // First, check if task exists
        if !tasks.contains_key(id) {
            return None;
        }

        // Collect deferred updates for other tasks
        let mut unblock_tasks: Vec<String> = vec![];
        let mut add_blocks_to: Vec<(String, String)> = vec![]; // (task_id, blocks_id)
        let mut add_blocked_by_to: Vec<(String, String)> = vec![]; // (task_id, blocked_by_id)

        // Apply updates to the main task
        {
            let task = tasks.get_mut(id).unwrap();

            // Handle status update
            if let Some(status) = &updates.status {
                let was_not_completed = !matches!(task.status, TaskStatus::Completed);
                task.status = status.clone();

                // Collect tasks to unblock when completed
                if matches!(status, TaskStatus::Completed) && was_not_completed {
                    unblock_tasks = task.blocks.clone();
                }
            }

            // Handle other updates
            if let Some(owner) = updates.owner {
                task.owner = Some(owner);
            }

            if let Some(subject) = updates.subject {
                task.subject = subject;
            }

            if let Some(description) = updates.description {
                task.description = description;
            }

            if let Some(active_form) = updates.active_form {
                task.active_form = Some(active_form);
            }

            // Handle add_blocked_by - update main task and collect reverse updates
            if let Some(add_blocked_by) = updates.add_blocked_by {
                for blocker_id in add_blocked_by {
                    if !task.blocked_by.contains(&blocker_id) {
                        task.blocked_by.push(blocker_id.clone());
                        // Schedule reverse relationship update
                        add_blocks_to.push((blocker_id, task_id.clone()));
                    }
                }
            }

            // Handle add_blocks - update main task and collect reverse updates
            if let Some(add_blocks) = updates.add_blocks {
                for blocked_id in add_blocks {
                    if !task.blocks.contains(&blocked_id) {
                        task.blocks.push(blocked_id.clone());
                        // Schedule reverse relationship update
                        add_blocked_by_to.push((blocked_id, task_id.clone()));
                    }
                }
            }

            // Merge metadata
            if let Some(metadata) = updates.metadata {
                for (key, value) in metadata {
                    if value.is_null() {
                        task.metadata.remove(&key);
                    } else {
                        task.metadata.insert(key, value);
                    }
                }
            }

            task.updated_at = chrono::Utc::now().timestamp_millis();
        }

        // Apply deferred updates to other tasks

        // Unblock tasks (remove this task from their blocked_by)
        let now = chrono::Utc::now().timestamp_millis();
        for blocked_id in unblock_tasks {
            if let Some(blocked_task) = tasks.get_mut(&blocked_id) {
                blocked_task.blocked_by.retain(|b| b != &task_id);
                blocked_task.updated_at = now;
            }
        }

        // Add blocks relationships
        for (target_id, blocks_id) in add_blocks_to {
            if let Some(target_task) = tasks.get_mut(&target_id) {
                if !target_task.blocks.contains(&blocks_id) {
                    target_task.blocks.push(blocks_id);
                    target_task.updated_at = now;
                }
            }
        }

        // Add blocked_by relationships
        for (target_id, blocked_by_id) in add_blocked_by_to {
            if let Some(target_task) = tasks.get_mut(&target_id) {
                if !target_task.blocked_by.contains(&blocked_by_id) {
                    target_task.blocked_by.push(blocked_by_id);
                    target_task.updated_at = now;
                }
            }
        }

        tasks.get(id).cloned()
    }

    pub fn list(&self) -> Vec<Task> {
        let tasks = self.tasks.lock();
        let mut result: Vec<Task> = tasks
            .values()
            .filter(|t| !matches!(t.status, TaskStatus::Deleted))
            .cloned()
            .collect();

        // Sort by created_at
        result.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        result
    }

    pub fn get(&self, id: &str) -> Option<Task> {
        self.tasks.lock().get(id).cloned()
    }

    pub fn claim_available(&self, worker_id: &str) -> Option<Task> {
        let mut tasks = self.tasks.lock();

        // Find first available task (pending, no owner, not blocked)
        let available_id = tasks
            .values()
            .find(|t| {
                matches!(t.status, TaskStatus::Pending)
                    && t.owner.is_none()
                    && t.blocked_by.is_empty()
            })
            .map(|t| t.id.clone());

        if let Some(id) = available_id {
            if let Some(task) = tasks.get_mut(&id) {
                task.owner = Some(worker_id.to_string());
                task.status = TaskStatus::InProgress;
                task.updated_at = chrono::Utc::now().timestamp_millis();
                return Some(task.clone());
            }
        }

        None
    }

    pub fn delete(&self, id: &str) -> Option<Task> {
        self.update(
            id,
            TaskUpdate {
                status: Some(TaskStatus::Deleted),
                ..Default::default()
            },
        )
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskUpdate {
    pub status: Option<TaskStatus>,
    pub owner: Option<String>,
    pub subject: Option<String>,
    pub description: Option<String>,
    pub active_form: Option<String>,
    pub add_blocked_by: Option<Vec<String>>,
    pub add_blocks: Option<Vec<String>>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}
