use std::path::PathBuf;

use super::store::TraceStore;
use super::types::AgentTrace;

#[tauri::command]
pub fn get_file_traces(cwd: String, file_path: String) -> Result<Vec<AgentTrace>, String> {
    let store = TraceStore::new(PathBuf::from(&cwd));
    store.get_file_traces(&file_path)
}

#[tauri::command]
pub fn get_session_traces(cwd: String, session_id: String) -> Result<Vec<AgentTrace>, String> {
    let store = TraceStore::new(PathBuf::from(&cwd));
    store.get_session_traces(&session_id)
}

#[tauri::command]
pub fn get_worker_traces(cwd: String, worker_id: String) -> Result<Vec<AgentTrace>, String> {
    let store = TraceStore::new(PathBuf::from(&cwd));
    store.get_worker_traces(&worker_id)
}

#[derive(serde::Serialize)]
pub struct TraceSummary {
    pub total_traces: usize,
    pub total_files: usize,
    pub models_used: Vec<String>,
    pub sessions: Vec<String>,
}

#[tauri::command]
pub fn get_trace_summary(cwd: String) -> Result<TraceSummary, String> {
    let store = TraceStore::new(PathBuf::from(&cwd));
    let traces = store.read_traces()?;

    let mut files = std::collections::HashSet::new();
    let mut models = std::collections::HashSet::new();
    let mut sessions = std::collections::HashSet::new();

    for trace in &traces {
        for file in &trace.files {
            files.insert(file.path.clone());
            for conv in &file.conversations {
                if let Some(ref model_id) = conv.contributor.model_id {
                    models.insert(model_id.clone());
                }
            }
        }
        if let Some(ref meta) = trace.metadata {
            sessions.insert(meta.crafter_code.orchestrator_session_id.clone());
        }
    }

    Ok(TraceSummary {
        total_traces: traces.len(),
        total_files: files.len(),
        models_used: models.into_iter().collect(),
        sessions: sessions.into_iter().collect(),
    })
}
