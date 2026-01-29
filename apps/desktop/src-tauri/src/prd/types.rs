use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Acceptance criterion types for story verification
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CriterionType {
    Test,
    FileExists,
    Pattern,
    Custom,
}

/// Acceptance criterion for a story
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceptanceCriterion {
    #[serde(rename = "type")]
    pub criterion_type: CriterionType,
    /// For type: "test" - command to run
    pub command: Option<String>,
    /// For type: "file_exists" - path to check
    pub path: Option<String>,
    /// For type: "pattern" - file to search in
    pub file: Option<String>,
    /// For type: "pattern" - regex pattern to match
    pub pattern: Option<String>,
    /// For type: "custom" - script to execute
    pub script: Option<String>,
    /// Human-readable description
    pub description: Option<String>,
}

/// Status of a criterion check
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CriterionStatus {
    pub passed: bool,
    pub error: Option<String>,
    pub last_checked: Option<i64>,
}

impl CriterionStatus {
    pub fn passed() -> Self {
        Self {
            passed: true,
            error: None,
            last_checked: Some(chrono_timestamp()),
        }
    }

    pub fn failed(error: String) -> Self {
        Self {
            passed: false,
            error: Some(error),
            last_checked: Some(chrono_timestamp()),
        }
    }
}

/// Story execution status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum StoryStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Blocked,
}

/// Model identifier for Claude models
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ModelId {
    Opus,
    Sonnet,
    Haiku,
}

impl ModelId {
    /// Cost per million input tokens
    pub fn input_cost_per_million(&self) -> f64 {
        match self {
            ModelId::Opus => 15.0,
            ModelId::Sonnet => 3.0,
            ModelId::Haiku => 0.25,
        }
    }

    /// Cost per million output tokens
    pub fn output_cost_per_million(&self) -> f64 {
        match self {
            ModelId::Opus => 75.0,
            ModelId::Sonnet => 15.0,
            ModelId::Haiku => 1.25,
        }
    }

    /// Calculate cost for given token counts
    pub fn calculate_cost(&self, input_tokens: u64, output_tokens: u64) -> f64 {
        let input_cost = (input_tokens as f64 / 1_000_000.0) * self.input_cost_per_million();
        let output_cost = (output_tokens as f64 / 1_000_000.0) * self.output_cost_per_million();
        input_cost + output_cost
    }
}

/// Story complexity level
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Complexity {
    Low,
    Medium,
    High,
}

impl Complexity {
    /// Get recommended model for this complexity
    pub fn recommended_model(&self) -> ModelId {
        match self {
            Complexity::Low => ModelId::Haiku,
            Complexity::Medium => ModelId::Sonnet,
            Complexity::High => ModelId::Opus,
        }
    }
}

/// A story in the PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Story {
    pub id: String,
    pub title: String,
    pub description: String,
    pub acceptance_criteria: Vec<AcceptanceCriterion>,
    pub dependencies: Vec<String>,
    pub hints: Option<Vec<String>>,
    /// Auto-detected or manually set complexity
    pub complexity: Option<Complexity>,
    /// Model to use (auto-assigned based on complexity)
    pub model: Option<ModelId>,
}

/// Progress tracking for a story
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryProgress {
    pub status: StoryStatus,
    pub worker_id: Option<String>,
    pub iteration: u32,
    pub max_iterations: u32,
    pub criteria_status: Vec<CriterionStatus>,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub error: Option<String>,
}

impl StoryProgress {
    pub fn new(max_iterations: u32, criteria_count: usize) -> Self {
        Self {
            status: StoryStatus::Pending,
            worker_id: None,
            iteration: 0,
            max_iterations,
            criteria_status: vec![
                CriterionStatus {
                    passed: false,
                    error: None,
                    last_checked: None,
                };
                criteria_count
            ],
            started_at: None,
            completed_at: None,
            error: None,
        }
    }

    pub fn start(&mut self, worker_id: String) {
        self.status = StoryStatus::InProgress;
        self.worker_id = Some(worker_id);
        self.started_at = Some(chrono_timestamp());
    }

    pub fn complete(&mut self) {
        self.status = StoryStatus::Completed;
        self.completed_at = Some(chrono_timestamp());
    }

    pub fn fail(&mut self, error: String) {
        self.status = StoryStatus::Failed;
        self.error = Some(error);
        self.completed_at = Some(chrono_timestamp());
    }

    pub fn all_criteria_passed(&self) -> bool {
        self.criteria_status.iter().all(|c| c.passed)
    }
}

/// PRD constraints
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct PrdConstraints {
    pub max_workers: u32,
    pub max_iterations_per_story: u32,
    pub total_timeout_minutes: Option<u32>,
    pub models: Option<ModelConstraints>,
}

impl Default for PrdConstraints {
    fn default() -> Self {
        Self {
            max_workers: 3,
            max_iterations_per_story: 15,
            total_timeout_minutes: Some(120),
            models: Some(ModelConstraints::default()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConstraints {
    pub master: Option<ModelId>,
    pub default: Option<ModelId>,
}

impl Default for ModelConstraints {
    fn default() -> Self {
        Self {
            master: Some(ModelId::Opus),
            default: Some(ModelId::Sonnet),
        }
    }
}

/// Product Requirements Document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prd {
    pub title: String,
    pub description: Option<String>,
    pub stories: Vec<Story>,
    pub constraints: PrdConstraints,
}

/// Worker status in the pool
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkerStatus {
    Idle,
    Working,
    Completed,
    Error,
}

/// A Ralph worker executing stories
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphWorker {
    pub id: String,
    pub model: ModelId,
    pub status: WorkerStatus,
    pub current_story_id: Option<String>,
    pub iteration: u32,
    pub started_at: Option<i64>,
    pub last_activity_at: Option<i64>,
    pub error: Option<String>,
}

impl RalphWorker {
    pub fn new(id: String, model: ModelId) -> Self {
        Self {
            id,
            model,
            status: WorkerStatus::Idle,
            current_story_id: None,
            iteration: 0,
            started_at: None,
            last_activity_at: None,
            error: None,
        }
    }

    pub fn start_story(&mut self, story_id: String) {
        self.status = WorkerStatus::Working;
        self.current_story_id = Some(story_id);
        self.iteration = 1;
        self.started_at = Some(chrono_timestamp());
        self.last_activity_at = Some(chrono_timestamp());
    }

    pub fn next_iteration(&mut self) {
        self.iteration += 1;
        self.last_activity_at = Some(chrono_timestamp());
    }

    pub fn complete(&mut self) {
        self.status = WorkerStatus::Completed;
        self.last_activity_at = Some(chrono_timestamp());
    }

    pub fn fail(&mut self, error: String) {
        self.status = WorkerStatus::Error;
        self.error = Some(error);
        self.last_activity_at = Some(chrono_timestamp());
    }

    pub fn reset(&mut self) {
        self.status = WorkerStatus::Idle;
        self.current_story_id = None;
        self.iteration = 0;
        self.started_at = None;
        self.error = None;
    }
}

/// PRD session status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PrdSessionStatus {
    Idle,
    Validating,
    Running,
    Paused,
    Completed,
    Failed,
}

/// A PRD execution session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdSession {
    pub id: String,
    pub prd: Prd,
    pub status: PrdSessionStatus,
    pub workers: Vec<RalphWorker>,
    pub story_progress: HashMap<String, StoryProgress>,
    pub total_cost: f64,
    pub tokens_used: TokenUsage,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub pr_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TokenUsage {
    pub input: u64,
    pub output: u64,
}

impl PrdSession {
    pub fn new(id: String, prd: Prd) -> Self {
        let max_iterations = prd.constraints.max_iterations_per_story;
        let mut story_progress = HashMap::new();

        for story in &prd.stories {
            story_progress.insert(
                story.id.clone(),
                StoryProgress::new(max_iterations, story.acceptance_criteria.len()),
            );
        }

        // Initialize workers based on constraints
        let workers = (0..prd.constraints.max_workers)
            .map(|i| {
                let model = prd
                    .constraints
                    .models
                    .as_ref()
                    .and_then(|m| m.default)
                    .unwrap_or(ModelId::Sonnet);
                RalphWorker::new(format!("worker-{}", i), model)
            })
            .collect();

        Self {
            id,
            prd,
            status: PrdSessionStatus::Idle,
            workers,
            story_progress,
            total_cost: 0.0,
            tokens_used: TokenUsage::default(),
            started_at: None,
            completed_at: None,
            pr_url: None,
        }
    }

    pub fn get_ready_stories(&self) -> Vec<&Story> {
        self.prd
            .stories
            .iter()
            .filter(|story| {
                // Story must be pending
                let progress = self.story_progress.get(&story.id);
                if !matches!(progress.map(|p| &p.status), Some(StoryStatus::Pending)) {
                    return false;
                }

                // All dependencies must be completed
                story.dependencies.iter().all(|dep_id| {
                    self.story_progress
                        .get(dep_id)
                        .map(|p| p.status == StoryStatus::Completed)
                        .unwrap_or(false)
                })
            })
            .collect()
    }

    pub fn get_idle_workers(&self) -> Vec<&RalphWorker> {
        self.workers
            .iter()
            .filter(|w| w.status == WorkerStatus::Idle)
            .collect()
    }

    pub fn all_stories_completed(&self) -> bool {
        self.story_progress
            .values()
            .all(|p| p.status == StoryStatus::Completed)
    }

    pub fn any_story_failed(&self) -> bool {
        self.story_progress
            .values()
            .any(|p| p.status == StoryStatus::Failed)
    }

    pub fn add_cost(&mut self, model: ModelId, input_tokens: u64, output_tokens: u64) {
        self.tokens_used.input += input_tokens;
        self.tokens_used.output += output_tokens;
        self.total_cost += model.calculate_cost(input_tokens, output_tokens);
    }
}

/// Validation result for a PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub estimated_cost: f64,
    pub model_assignments: HashMap<String, ModelId>,
    pub dependency_order: Vec<String>,
}

impl ValidationResult {
    pub fn valid(
        estimated_cost: f64,
        model_assignments: HashMap<String, ModelId>,
        dependency_order: Vec<String>,
    ) -> Self {
        Self {
            valid: true,
            errors: vec![],
            warnings: vec![],
            estimated_cost,
            model_assignments,
            dependency_order,
        }
    }

    pub fn invalid(errors: Vec<String>) -> Self {
        Self {
            valid: false,
            errors,
            warnings: vec![],
            estimated_cost: 0.0,
            model_assignments: HashMap::new(),
            dependency_order: vec![],
        }
    }

    pub fn add_warning(&mut self, warning: String) {
        self.warnings.push(warning);
    }
}

/// Cost breakdown per story
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostBreakdown {
    pub story_id: String,
    pub model: ModelId,
    pub iterations: u32,
    pub tokens: TokenUsage,
    pub cost: f64,
}

/// Session summary for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdSessionSummary {
    pub id: String,
    pub title: String,
    pub status: PrdSessionStatus,
    pub stories_total: usize,
    pub stories_completed: usize,
    pub active_workers: usize,
    pub total_cost: f64,
    pub started_at: Option<i64>,
}

impl From<&PrdSession> for PrdSessionSummary {
    fn from(session: &PrdSession) -> Self {
        let stories_completed = session
            .story_progress
            .values()
            .filter(|p| p.status == StoryStatus::Completed)
            .count();

        let active_workers = session
            .workers
            .iter()
            .filter(|w| w.status == WorkerStatus::Working)
            .count();

        Self {
            id: session.id.clone(),
            title: session.prd.title.clone(),
            status: session.status.clone(),
            stories_total: session.prd.stories.len(),
            stories_completed,
            active_workers,
            total_cost: session.total_cost,
            started_at: session.started_at,
        }
    }
}

fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}
