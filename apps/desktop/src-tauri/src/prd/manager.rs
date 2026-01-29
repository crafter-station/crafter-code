//! PRD session management

use super::parser::validate_prd;
use super::types::{
    CostBreakdown, ModelId, Prd, PrdSession, PrdSessionStatus, PrdSessionSummary, RalphWorker,
    StoryProgress, StoryStatus, Story, TokenUsage, ValidationResult, WorkerStatus,
};
use super::verifier::{all_criteria_pass, verify_all_criteria};
use crate::acp::client::AcpClient;
use crate::acp::registry::get_agent;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use uuid::Uuid;

/// Manager for PRD sessions
pub struct PrdManager {
    sessions: Mutex<HashMap<String, PrdSession>>,
    /// Cancel channels for running workers
    cancel_channels: Mutex<HashMap<String, mpsc::Sender<()>>>,
    /// Working directory for file operations
    working_dir: Option<PathBuf>,
}

impl PrdManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            cancel_channels: Mutex::new(HashMap::new()),
            working_dir: None,
        }
    }

    pub fn with_working_dir(mut self, dir: PathBuf) -> Self {
        self.working_dir = Some(dir);
        self
    }

    /// Validate a PRD
    pub fn validate(&self, prd: &Prd) -> ValidationResult {
        validate_prd(prd)
    }

    /// Create a new PRD session
    pub fn create_session(&self, prd: Prd) -> Result<PrdSession, String> {
        // Validate first
        let validation = validate_prd(&prd);
        if !validation.valid {
            return Err(validation.errors.join("; "));
        }

        let session_id = Uuid::new_v4().to_string();
        let mut session = PrdSession::new(session_id.clone(), prd);

        // Assign models from validation
        for story in &mut session.prd.stories {
            if story.model.is_none() {
                if let Some(&model) = validation.model_assignments.get(&story.id) {
                    story.model = Some(model);
                }
            }
        }

        let mut sessions = self.sessions.lock();
        sessions.insert(session_id, session.clone());

        Ok(session)
    }

    /// Get a session by ID
    pub fn get_session(&self, session_id: &str) -> Option<PrdSession> {
        self.sessions.lock().get(session_id).cloned()
    }

    /// Check if session exists
    pub fn session_exists(&self, session_id: &str) -> bool {
        self.sessions.lock().contains_key(session_id)
    }

    /// Update session in place
    pub fn update_session<F>(&self, session_id: &str, f: F) -> bool
    where
        F: FnOnce(&mut PrdSession),
    {
        let mut sessions = self.sessions.lock();
        if let Some(session) = sessions.get_mut(session_id) {
            f(session);
            true
        } else {
            false
        }
    }

    /// List all sessions
    pub fn list_sessions(&self) -> Vec<PrdSessionSummary> {
        self.sessions
            .lock()
            .values()
            .map(PrdSessionSummary::from)
            .collect()
    }

    /// Start session execution
    pub fn start_session(&self, session_id: &str) -> Result<(), String> {
        self.update_session(session_id, |session| {
            session.status = PrdSessionStatus::Running;
            session.started_at = Some(chrono_timestamp());
        });
        Ok(())
    }

    /// Pause a running session
    pub fn pause_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;

        if session.status != PrdSessionStatus::Running {
            return Err("Can only pause running sessions".to_string());
        }

        session.status = PrdSessionStatus::Paused;
        Ok(())
    }

    /// Resume a paused session
    pub fn resume_session(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;

        if session.status != PrdSessionStatus::Paused {
            return Err("Can only resume paused sessions".to_string());
        }

        session.status = PrdSessionStatus::Running;
        Ok(())
    }

    /// Cancel a session (stops all workers)
    pub fn cancel_session(&self, session_id: &str) -> Result<(), String> {
        // Cancel all workers
        let cancel_channels = self.cancel_channels.lock();
        for (key, tx) in cancel_channels.iter() {
            if key.starts_with(session_id) {
                let _ = tx.try_send(());
            }
        }
        drop(cancel_channels);

        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;

        session.status = PrdSessionStatus::Failed;
        session.completed_at = Some(chrono_timestamp());

        // Mark all running workers as error
        for worker in &mut session.workers {
            if worker.status == WorkerStatus::Working {
                worker.status = WorkerStatus::Error;
                worker.error = Some("Session cancelled".to_string());
            }
        }

        Ok(())
    }

    /// Retry a failed story
    pub fn retry_story(&self, session_id: &str, story_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock();
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;

        let progress = session
            .story_progress
            .get_mut(story_id)
            .ok_or_else(|| format!("Story {} not found", story_id))?;

        if progress.status != StoryStatus::Failed {
            return Err("Can only retry failed stories".to_string());
        }

        // Reset progress
        progress.status = StoryStatus::Pending;
        progress.iteration = 0;
        progress.error = None;
        progress.completed_at = None;

        // Reset criteria status
        for criterion in &mut progress.criteria_status {
            criterion.passed = false;
            criterion.error = None;
            criterion.last_checked = None;
        }

        // If session was failed, set back to running
        if session.status == PrdSessionStatus::Failed {
            session.status = PrdSessionStatus::Running;
        }

        Ok(())
    }

    /// Get story progress
    pub fn get_story_progress(
        &self,
        session_id: &str,
        story_id: &str,
    ) -> Result<StoryProgress, String> {
        let sessions = self.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;

        session
            .story_progress
            .get(story_id)
            .cloned()
            .ok_or_else(|| format!("Story {} not found", story_id))
    }

    /// Get workers for a session
    pub fn get_workers(&self, session_id: &str) -> Result<Vec<RalphWorker>, String> {
        let sessions = self.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;

        Ok(session.workers.clone())
    }

    /// Get cost breakdown
    pub fn get_cost_breakdown(&self, session_id: &str) -> Result<Vec<CostBreakdown>, String> {
        let sessions = self.sessions.lock();
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Session {} not found", session_id))?;

        let mut breakdown = Vec::new();

        for story in &session.prd.stories {
            let progress = session.story_progress.get(&story.id);
            let model = story.model.unwrap_or(ModelId::Sonnet);

            // Estimate tokens based on iterations (rough approximation)
            let iterations = progress.map(|p| p.iteration).unwrap_or(0);
            let estimated_input = iterations as u64 * 2000;
            let estimated_output = iterations as u64 * 1000;
            let cost = model.calculate_cost(estimated_input, estimated_output);

            breakdown.push(CostBreakdown {
                story_id: story.id.clone(),
                model,
                iterations,
                tokens: TokenUsage {
                    input: estimated_input,
                    output: estimated_output,
                },
                cost,
            });
        }

        Ok(breakdown)
    }

    /// Register a cancel channel for a worker
    pub fn register_cancel(&self, worker_key: String, tx: mpsc::Sender<()>) {
        self.cancel_channels.lock().insert(worker_key, tx);
    }

    /// Remove a cancel channel
    pub fn remove_cancel(&self, worker_key: &str) {
        self.cancel_channels.lock().remove(worker_key);
    }

    /// Assign next available story to an idle worker
    pub fn assign_next_story(&self, session_id: &str) -> Option<(String, String)> {
        let mut sessions = self.sessions.lock();
        let session = sessions.get_mut(session_id)?;

        // Find idle worker
        let worker_idx = session
            .workers
            .iter()
            .position(|w| w.status == WorkerStatus::Idle)?;

        // Find ready story
        let story_id = session
            .prd
            .stories
            .iter()
            .find(|story| {
                let progress = session.story_progress.get(&story.id);
                matches!(progress.map(|p| &p.status), Some(StoryStatus::Pending))
                    && story.dependencies.iter().all(|dep| {
                        session
                            .story_progress
                            .get(dep)
                            .map(|p| p.status == StoryStatus::Completed)
                            .unwrap_or(false)
                    })
            })
            .map(|s| s.id.clone())?;

        // Assign worker to story
        let worker = &mut session.workers[worker_idx];
        worker.start_story(story_id.clone());

        // Update story progress
        if let Some(progress) = session.story_progress.get_mut(&story_id) {
            progress.start(worker.id.clone());
        }

        Some((worker.id.clone(), story_id))
    }

    /// Complete a story
    pub fn complete_story(&self, session_id: &str, story_id: &str, worker_id: &str) {
        self.update_session(session_id, |session| {
            if let Some(progress) = session.story_progress.get_mut(story_id) {
                progress.complete();
            }

            if let Some(worker) = session.workers.iter_mut().find(|w| w.id == worker_id) {
                worker.complete();
                worker.reset();
            }

            // Check if all stories completed
            if session.all_stories_completed() {
                session.status = PrdSessionStatus::Completed;
                session.completed_at = Some(chrono_timestamp());
            }
        });
    }

    /// Fail a story
    pub fn fail_story(
        &self,
        session_id: &str,
        story_id: &str,
        worker_id: &str,
        error: String,
    ) {
        self.update_session(session_id, |session| {
            if let Some(progress) = session.story_progress.get_mut(story_id) {
                progress.fail(error.clone());
            }

            if let Some(worker) = session.workers.iter_mut().find(|w| w.id == worker_id) {
                worker.fail(error);
            }

            // Check if session should fail
            if session.any_story_failed() {
                session.status = PrdSessionStatus::Failed;
                session.completed_at = Some(chrono_timestamp());
            }
        });
    }

    /// Update criteria status after verification
    pub fn update_criteria_status(
        &self,
        session_id: &str,
        story_id: &str,
        statuses: Vec<super::types::CriterionStatus>,
    ) {
        self.update_session(session_id, |session| {
            if let Some(progress) = session.story_progress.get_mut(story_id) {
                progress.criteria_status = statuses;
            }
        });
    }

    /// Increment worker iteration
    pub fn increment_iteration(&self, session_id: &str, story_id: &str, worker_id: &str) {
        self.update_session(session_id, |session| {
            if let Some(progress) = session.story_progress.get_mut(story_id) {
                progress.iteration += 1;
            }

            if let Some(worker) = session.workers.iter_mut().find(|w| w.id == worker_id) {
                worker.next_iteration();
            }
        });
    }

    /// Get working directory
    pub fn get_working_dir(&self) -> Option<&PathBuf> {
        self.working_dir.as_ref()
    }
}

impl Default for PrdManager {
    fn default() -> Self {
        Self::new()
    }
}

fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

/// Execute the Ralph loop for a session
/// This is the main orchestration loop that:
/// 1. Assigns stories to idle workers
/// 2. Runs workers in parallel
/// 3. Verifies acceptance criteria
/// 4. Retries until max iterations or success
pub async fn run_ralph_loop(
    manager: Arc<PrdManager>,
    session_id: String,
    app_handle: AppHandle,
) {
    // Start session
    if manager.start_session(&session_id).is_err() {
        return;
    }

    loop {
        // Check if session is still running
        let session = match manager.get_session(&session_id) {
            Some(s) => s,
            None => break,
        };

        if session.status != PrdSessionStatus::Running {
            break;
        }

        // Try to assign work
        if let Some((worker_id, story_id)) = manager.assign_next_story(&session_id) {
            let manager_clone = manager.clone();
            let session_id_clone = session_id.clone();
            let app_handle_clone = app_handle.clone();

            // Spawn worker in separate thread with its own runtime (like fleet mode)
            thread::spawn(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .expect("Failed to create tokio runtime");

                let local_set = tokio::task::LocalSet::new();

                local_set.block_on(&rt, async move {
                    run_worker_loop(manager_clone, session_id_clone, worker_id, story_id, app_handle_clone).await;
                });
            });
        }

        // Check completion
        let session = match manager.get_session(&session_id) {
            Some(s) => s,
            None => break,
        };

        if session.all_stories_completed() {
            manager.update_session(&session_id, |s| {
                s.status = PrdSessionStatus::Completed;
                s.completed_at = Some(chrono_timestamp());
            });
            break;
        }

        if session.any_story_failed() {
            break;
        }

        // Small delay to prevent tight loop
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    // Emit completion event
    let _ = app_handle.emit(
        "prd-update",
        serde_json::json!({
            "session_id": session_id,
            "type": "completed"
        }),
    );
}

/// Build the prompt for a story iteration
fn build_story_prompt(story: &Story, iteration: u32, guardrails: &[String]) -> String {
    let mut prompt = format!(
        "## Story: {}\n\n{}\n\n",
        story.title,
        story.description
    );

    // Add hints if available
    if let Some(hints) = &story.hints {
        if !hints.is_empty() {
            prompt.push_str("### Hints\n");
            for hint in hints {
                prompt.push_str(&format!("- {}\n", hint));
            }
            prompt.push('\n');
        }
    }

    // Add acceptance criteria
    prompt.push_str("### Acceptance Criteria\n");
    for (i, criterion) in story.acceptance_criteria.iter().enumerate() {
        let desc = criterion.description.as_deref().unwrap_or("No description");
        prompt.push_str(&format!("{}. {}\n", i + 1, desc));
    }
    prompt.push('\n');

    // Add guardrails from previous iterations
    if !guardrails.is_empty() {
        prompt.push_str("### Previous Iteration Feedback\n");
        prompt.push_str("The following issues occurred in previous iterations. Please address them:\n\n");
        for guardrail in guardrails {
            prompt.push_str(&format!("- {}\n", guardrail));
        }
        prompt.push('\n');
    }

    prompt.push_str(&format!("\n**Iteration {}: Please implement the story and ensure all acceptance criteria pass.**\n", iteration));

    prompt
}

/// Run the iteration loop for a single worker
async fn run_worker_loop(
    manager: Arc<PrdManager>,
    session_id: String,
    worker_id: String,
    story_id: String,
    app_handle: AppHandle,
) {
    let max_iterations = manager
        .get_session(&session_id)
        .map(|s| s.prd.constraints.max_iterations_per_story)
        .unwrap_or(15);

    let working_dir = manager.get_working_dir().cloned();
    let cwd = working_dir
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "/".to_string()));

    // Get story for verification
    let story = manager
        .get_session(&session_id)
        .and_then(|s| s.prd.stories.iter().find(|st| st.id == story_id).cloned());

    let story = match story {
        Some(s) => s,
        None => {
            manager.fail_story(&session_id, &story_id, &worker_id, "Story not found".to_string());
            return;
        }
    };

    // Get model for this story
    let model_id = story.model.unwrap_or(ModelId::Sonnet);
    let model_str = match model_id {
        ModelId::Opus => "opus",
        ModelId::Sonnet => "sonnet",
        ModelId::Haiku => "haiku",
    };

    // Get agent config (default to Claude)
    let agent = get_agent("claude").unwrap_or_else(|| {
        crate::acp::registry::AgentConfig {
            id: "claude".to_string(),
            name: "Claude".to_string(),
            description: "Anthropic Claude via claude-code-acp".to_string(),
            command: "claude-code-acp".to_string(),
            args: vec![],
            available: true,
            env_vars: vec!["ANTHROPIC_API_KEY".to_string()],
            config_dir: ".claude".to_string(),
            models: vec![],
            default_model: "claude-sonnet-4-5-20250929".to_string(),
            model_env_var: Some("ANTHROPIC_MODEL".to_string()),
            model_cli_flag: Some("--model".to_string()),
        }
    });

    // Track guardrails (previous iteration failures)
    let mut guardrails: Vec<String> = Vec::new();

    // Create cancellation channel
    let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);
    let worker_key = format!("{}:{}", session_id, worker_id);
    manager.register_cancel(worker_key.clone(), cancel_tx);

    // Spawn ACP client (already running in LocalSet from caller)
    let args: Vec<&str> = agent.args.iter().map(|s| s.as_str()).collect();
    let mut client = match AcpClient::spawn(
            &agent.command,
            &args,
            &cwd,
            &agent.env_vars,
            Some(model_str.to_string()),
            agent.model_env_var.clone(),
            app_handle.clone(),
            worker_id.clone(),
            session_id.clone(),
            None, // No task manager for PRD workers
            None, // No inbox manager for PRD workers
        ).await {
            Ok(c) => c,
            Err(e) => {
                manager.fail_story(&session_id, &story_id, &worker_id, format!("Failed to spawn agent: {}", e));
                return;
            }
        };

        // Initialize
        if let Err(e) = client.initialize().await {
            manager.fail_story(&session_id, &story_id, &worker_id, format!("Failed to initialize agent: {}", e));
            let _ = client.kill().await;
            return;
        }

        // Create session
        if let Err(e) = client.create_acp_session(&cwd).await {
            manager.fail_story(&session_id, &story_id, &worker_id, format!("Failed to create session: {}", e));
            let _ = client.kill().await;
            return;
        }

        for iteration in 1..=max_iterations {
            // Update iteration
            manager.increment_iteration(&session_id, &story_id, &worker_id);

            // Emit progress event
            let _ = app_handle.emit(
                "prd-update",
                serde_json::json!({
                    "session_id": session_id,
                    "story_id": story_id,
                    "worker_id": worker_id,
                    "type": "iteration",
                    "iteration": iteration
                }),
            );

            // Build prompt with guardrails
            let prompt = build_story_prompt(&story, iteration, &guardrails);

            // Run agent iteration
            match client.prompt(&prompt, &mut cancel_rx).await {
                Ok(_) => {
                    // Agent completed, now verify criteria
                }
                Err(crate::acp::client::AcpError::Cancelled) => {
                    eprintln!("[PRD] Worker {} cancelled", worker_id);
                    let _ = client.kill().await;
                    return;
                }
                Err(e) => {
                    eprintln!("[PRD] Worker {} prompt failed: {}", worker_id, e);
                    guardrails.push(format!("Agent error: {}", e));
                    continue;
                }
            }

            // Verify acceptance criteria
            let statuses = verify_all_criteria(&story, working_dir.as_deref()).await;
            manager.update_criteria_status(&session_id, &story_id, statuses.clone());

            // Check if all criteria pass
            if all_criteria_pass(&statuses) {
                manager.complete_story(&session_id, &story_id, &worker_id);

                let _ = app_handle.emit(
                    "prd-update",
                    serde_json::json!({
                        "session_id": session_id,
                        "story_id": story_id,
                        "type": "completed"
                    }),
                );

                let _ = client.kill().await;
                return;
            }

            // Add failed criteria to guardrails
            for (i, status) in statuses.iter().enumerate() {
                if !status.passed {
                    let criterion_desc = story.acceptance_criteria
                        .get(i)
                        .and_then(|c| c.description.as_ref())
                        .map(|s| s.as_str())
                        .unwrap_or("Unknown criterion");
                    let error = status.error.as_deref().unwrap_or("Failed");
                    guardrails.push(format!("Criterion '{}': {}", criterion_desc, error));
                }
            }

            // Check if session is still running
            let session = match manager.get_session(&session_id) {
                Some(s) => s,
                None => {
                    let _ = client.kill().await;
                    return;
                }
            };

            if session.status != PrdSessionStatus::Running {
                let _ = client.kill().await;
                return;
            }
        }

        // Max iterations reached - fail story
        manager.fail_story(
            &session_id,
            &story_id,
            &worker_id,
            format!("Max iterations ({}) reached", max_iterations),
        );

        let _ = app_handle.emit(
            "prd-update",
            serde_json::json!({
                "session_id": session_id,
                "story_id": story_id,
                "type": "failed",
                "error": "Max iterations reached"
            }),
        );

        let _ = client.kill().await;

    // Cleanup
    manager.remove_cancel(&worker_key);
}
