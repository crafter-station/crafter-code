use crate::claude::pricing::Model;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkerStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
    Paused,
    /// Worker is idle, ready to accept new prompts (after cancel or completion)
    Idle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerSession {
    pub id: String,
    pub session_id: String,
    pub task: String,
    pub status: WorkerStatus,
    pub model: Model,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
    pub output_buffer: String,
    pub files_touched: Vec<String>,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub paused_at: Option<i64>,
    pub task_id: Option<String>,
}

impl WorkerSession {
    pub fn new(id: String, session_id: String, task: String, model: Model) -> Self {
        let now = chrono_timestamp();
        Self {
            id,
            session_id,
            task,
            status: WorkerStatus::Pending,
            model,
            input_tokens: 0,
            output_tokens: 0,
            cost_usd: 0.0,
            output_buffer: String::new(),
            files_touched: Vec::new(),
            error_message: None,
            created_at: now,
            updated_at: now,
            started_at: None,
            ended_at: None,
            paused_at: None,
            task_id: None,
        }
    }

    pub fn mark_running(&mut self) {
        self.status = WorkerStatus::Running;
        let now = chrono_timestamp();
        if self.started_at.is_none() {
            self.started_at = Some(now);
        }
        self.updated_at = now;
    }

    pub fn mark_completed(&mut self) {
        self.status = WorkerStatus::Completed;
        let now = chrono_timestamp();
        self.ended_at = Some(now);
        self.updated_at = now;
    }

    pub fn mark_failed(&mut self, error: String) {
        self.status = WorkerStatus::Failed;
        self.error_message = Some(error);
        let now = chrono_timestamp();
        self.ended_at = Some(now);
        self.updated_at = now;
    }

    pub fn mark_cancelled(&mut self) {
        self.status = WorkerStatus::Cancelled;
        let now = chrono_timestamp();
        self.ended_at = Some(now);
        self.updated_at = now;
    }

    pub fn mark_paused(&mut self) {
        self.status = WorkerStatus::Paused;
        let now = chrono_timestamp();
        self.paused_at = Some(now);
        self.updated_at = now;
    }

    pub fn append_output(&mut self, text: &str) {
        self.output_buffer.push_str(text);
        self.updated_at = chrono_timestamp();
    }

    pub fn set_usage(&mut self, input_tokens: u64, output_tokens: u64, cost: f64) {
        self.input_tokens = input_tokens;
        self.output_tokens = output_tokens;
        self.cost_usd = cost;
        self.updated_at = chrono_timestamp();
    }

    pub fn add_file(&mut self, path: String) {
        if !self.files_touched.contains(&path) {
            self.files_touched.push(path);
            self.updated_at = chrono_timestamp();
        }
    }

    pub fn get_last_output(&self, chars: usize) -> &str {
        let len = self.output_buffer.len();
        if len <= chars {
            &self.output_buffer
        } else {
            &self.output_buffer[len - chars..]
        }
    }
}

fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
