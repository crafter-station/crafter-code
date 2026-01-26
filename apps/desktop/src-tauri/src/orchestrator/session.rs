use crate::claude::pricing::Model;
use crate::orchestrator::worker::{WorkerSession, WorkerStatus};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Planning,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorSession {
    pub id: String,
    pub prompt: String,
    pub status: SessionStatus,
    pub model: Model,
    pub workers: Vec<WorkerSession>,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cost: f64,
    pub created_at: i64,
    pub updated_at: i64,
    pub plan: Option<String>,
}

impl OrchestratorSession {
    pub fn new(id: String, prompt: String, model: Model) -> Self {
        let now = chrono_timestamp();
        Self {
            id,
            prompt,
            status: SessionStatus::Planning,
            model,
            workers: Vec::new(),
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cost: 0.0,
            created_at: now,
            updated_at: now,
            plan: None,
        }
    }

    pub fn add_worker(&mut self, worker: WorkerSession) {
        self.workers.push(worker);
        self.updated_at = chrono_timestamp();
    }

    pub fn update_worker_status(&mut self, worker_id: &str, status: WorkerStatus) -> bool {
        if let Some(worker) = self.workers.iter_mut().find(|w| w.id == worker_id) {
            worker.status = status;
            worker.updated_at = chrono_timestamp();
            self.updated_at = chrono_timestamp();
            self.recalculate_status();
            return true;
        }
        false
    }

    pub fn update_worker_output(&mut self, worker_id: &str, output: &str) -> bool {
        if let Some(worker) = self.workers.iter_mut().find(|w| w.id == worker_id) {
            worker.output_buffer.push_str(output);
            worker.updated_at = chrono_timestamp();
            self.updated_at = chrono_timestamp();
            return true;
        }
        false
    }

    pub fn update_worker_cost(
        &mut self,
        worker_id: &str,
        input_tokens: u64,
        output_tokens: u64,
        cost: f64,
    ) -> bool {
        if let Some(worker) = self.workers.iter_mut().find(|w| w.id == worker_id) {
            worker.input_tokens = input_tokens;
            worker.output_tokens = output_tokens;
            worker.cost_usd = cost;
            worker.updated_at = chrono_timestamp();
            self.recalculate_totals();
            self.updated_at = chrono_timestamp();
            return true;
        }
        false
    }

    pub fn add_worker_file(&mut self, worker_id: &str, file_path: String) -> bool {
        if let Some(worker) = self.workers.iter_mut().find(|w| w.id == worker_id) {
            if !worker.files_touched.contains(&file_path) {
                worker.files_touched.push(file_path);
                worker.updated_at = chrono_timestamp();
                self.updated_at = chrono_timestamp();
            }
            return true;
        }
        false
    }

    pub fn detect_conflicts(&self) -> Vec<FileConflict> {
        let mut file_workers: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();

        for worker in &self.workers {
            for file in &worker.files_touched {
                file_workers
                    .entry(file.clone())
                    .or_default()
                    .push(worker.id.clone());
            }
        }

        file_workers
            .into_iter()
            .filter(|(_, workers)| workers.len() > 1)
            .map(|(file, workers)| FileConflict {
                file_path: file,
                worker_ids: workers,
            })
            .collect()
    }

    fn recalculate_totals(&mut self) {
        self.total_input_tokens = self.workers.iter().map(|w| w.input_tokens).sum();
        self.total_output_tokens = self.workers.iter().map(|w| w.output_tokens).sum();
        self.total_cost = self.workers.iter().map(|w| w.cost_usd).sum();
    }

    fn recalculate_status(&mut self) {
        let all_completed = self
            .workers
            .iter()
            .all(|w| w.status == WorkerStatus::Completed);
        let any_failed = self.workers.iter().any(|w| w.status == WorkerStatus::Failed);
        let any_running = self
            .workers
            .iter()
            .any(|w| w.status == WorkerStatus::Running);

        if any_failed {
            self.status = SessionStatus::Failed;
        } else if all_completed && !self.workers.is_empty() {
            self.status = SessionStatus::Completed;
        } else if any_running {
            self.status = SessionStatus::Running;
        }
    }

    pub fn get_completed_workers(&self) -> usize {
        self.workers
            .iter()
            .filter(|w| w.status == WorkerStatus::Completed)
            .count()
    }

    pub fn get_worker(&self, worker_id: &str) -> Option<&WorkerSession> {
        self.workers.iter().find(|w| w.id == worker_id)
    }

    pub fn get_worker_mut(&mut self, worker_id: &str) -> Option<&mut WorkerSession> {
        self.workers.iter_mut().find(|w| w.id == worker_id)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileConflict {
    pub file_path: String,
    pub worker_ids: Vec<String>,
}

fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
