use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use super::store::TraceStore;
use super::types::*;

pub struct TraceCapture {
    store: TraceStore,
    project_root: PathBuf,
    git_revision: OnceLock<Option<String>>,
}

impl TraceCapture {
    pub fn new(project_root: PathBuf) -> Self {
        Self {
            store: TraceStore::new(project_root.clone()),
            project_root,
            git_revision: OnceLock::new(),
        }
    }

    fn get_git_revision(&self) -> Option<String> {
        self.git_revision
            .get_or_init(|| {
                Command::new("git")
                    .args(["rev-parse", "HEAD"])
                    .current_dir(&self.project_root)
                    .output()
                    .ok()
                    .and_then(|output| {
                        if output.status.success() {
                            String::from_utf8(output.stdout)
                                .ok()
                                .map(|s| s.trim().to_string())
                        } else {
                            None
                        }
                    })
            })
            .clone()
    }

    fn content_hash(content: &str) -> String {
        let hash = murmur3::murmur3_32(&mut content.as_bytes(), 0).unwrap_or(0);
        format!("murmur3:{:08x}", hash)
    }

    fn make_relative(&self, path: &str) -> String {
        Path::new(path)
            .strip_prefix(&self.project_root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string())
    }

    fn normalize_model_id(model: &str) -> String {
        if model.contains('/') {
            return model.to_string();
        }
        if model.starts_with("claude-") || model.starts_with("claude_") {
            return format!("anthropic/{}", model);
        }
        if model.starts_with("gpt-") || model.starts_with("o1") || model.starts_with("o3") {
            return format!("openai/{}", model);
        }
        if model.starts_with("gemini") {
            return format!("google/{}", model);
        }
        model.to_string()
    }

    fn build_trace(
        &self,
        file_path: &str,
        ranges: Vec<LineRange>,
        worker_id: &str,
        session_id: &str,
        model: &str,
        task_id: Option<&str>,
        cost: Option<CostAttribution>,
    ) -> AgentTrace {
        let relative_path = self.make_relative(file_path);
        let revision = self.get_git_revision();
        let model_id = Self::normalize_model_id(model);

        AgentTrace {
            version: "0.1.0".to_string(),
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            vcs: revision.map(|r| VcsInfo {
                vcs_type: "git".to_string(),
                revision: r,
            }),
            tool: ToolInfo {
                name: "crafter-code".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            },
            files: vec![TracedFile {
                path: relative_path,
                conversations: vec![Conversation {
                    url: Some(format!("crafter-code://session/{}", session_id)),
                    contributor: Contributor {
                        contributor_type: "ai".to_string(),
                        model_id: Some(model_id),
                    },
                    ranges,
                    related: Some(vec![
                        RelatedResource {
                            resource_type: "session".to_string(),
                            url: format!("crafter-code://session/{}", session_id),
                        },
                        RelatedResource {
                            resource_type: "worker".to_string(),
                            url: format!("crafter-code://worker/{}", worker_id),
                        },
                    ]),
                }],
            }],
            metadata: Some(TraceMetadata {
                crafter_code: CrafterCodeMetadata {
                    orchestrator_session_id: session_id.to_string(),
                    worker_id: worker_id.to_string(),
                    task_id: task_id.map(|t| t.to_string()),
                    cost,
                },
            }),
        }
    }

    pub fn record_file_write(
        &self,
        file_path: &str,
        content: &str,
        worker_id: &str,
        session_id: &str,
        model: &str,
    ) {
        let line_count = content.lines().count().max(1) as u32;
        let ranges = vec![LineRange {
            start_line: 1,
            end_line: line_count,
            content_hash: Some(Self::content_hash(content)),
        }];

        let trace = self.build_trace(file_path, ranges, worker_id, session_id, model, None, None);

        if let Err(e) = self.store.append_trace(&trace) {
            eprintln!("[AgentTrace] Failed to record file write: {}", e);
        }
    }

    pub fn record_file_diff(
        &self,
        file_path: &str,
        new_text: &str,
        worker_id: &str,
        session_id: &str,
        model: &str,
    ) {
        let full_content = std::fs::read_to_string(file_path).unwrap_or_default();
        if full_content.is_empty() {
            return;
        }

        if let Some(pos) = full_content.find(new_text) {
            let prefix = &full_content[..pos];
            let start_line = (prefix.matches('\n').count() + 1) as u32;
            let new_line_count = new_text.matches('\n').count() as u32 + 1;
            let end_line = start_line + new_line_count - 1;

            let ranges = vec![LineRange {
                start_line,
                end_line,
                content_hash: Some(Self::content_hash(new_text)),
            }];

            let trace =
                self.build_trace(file_path, ranges, worker_id, session_id, model, None, None);

            if let Err(e) = self.store.append_trace(&trace) {
                eprintln!("[AgentTrace] Failed to record file diff: {}", e);
            }
        }
    }

    pub fn record_worker_summary(
        &self,
        session_id: &str,
        worker_id: &str,
        model: &str,
        files_touched: &[String],
        cost: CostAttribution,
    ) {
        for file_path in files_touched {
            let relative_path = self.make_relative(file_path);
            let trace = self.build_trace(
                &relative_path,
                Vec::new(),
                worker_id,
                session_id,
                model,
                None,
                Some(cost.clone()),
            );

            if let Err(e) = self.store.append_trace(&trace) {
                eprintln!("[AgentTrace] Failed to record worker summary: {}", e);
            }
        }
    }
}
