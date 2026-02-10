use std::fs;
use std::io::{BufRead, Write};
use std::path::PathBuf;

use parking_lot::Mutex;

use super::types::AgentTrace;

pub struct TraceStore {
    project_root: PathBuf,
    write_lock: Mutex<()>,
}

impl TraceStore {
    pub fn new(project_root: PathBuf) -> Self {
        Self {
            project_root,
            write_lock: Mutex::new(()),
        }
    }

    fn trace_dir(&self) -> PathBuf {
        self.project_root.join(".agent-trace")
    }

    fn trace_file(&self) -> PathBuf {
        self.trace_dir().join("traces.jsonl")
    }

    pub fn append_trace(&self, trace: &AgentTrace) -> Result<(), String> {
        let _guard = self.write_lock.lock();

        let dir = self.trace_dir();
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create .agent-trace dir: {}", e))?;

        let line =
            serde_json::to_string(trace).map_err(|e| format!("Failed to serialize trace: {}", e))?;

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.trace_file())
            .map_err(|e| format!("Failed to open traces.jsonl: {}", e))?;

        writeln!(file, "{}", line).map_err(|e| format!("Failed to write trace: {}", e))?;

        Ok(())
    }

    pub fn read_traces(&self) -> Result<Vec<AgentTrace>, String> {
        let path = self.trace_file();
        if !path.exists() {
            return Ok(Vec::new());
        }

        let file =
            fs::File::open(&path).map_err(|e| format!("Failed to open traces.jsonl: {}", e))?;
        let reader = std::io::BufReader::new(file);
        let mut traces = Vec::new();

        for line in reader.lines() {
            let line = line.map_err(|e| format!("Failed to read line: {}", e))?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            match serde_json::from_str::<AgentTrace>(trimmed) {
                Ok(trace) => traces.push(trace),
                Err(e) => eprintln!("[AgentTrace] Skipping malformed trace line: {}", e),
            }
        }

        Ok(traces)
    }

    pub fn get_file_traces(&self, file_path: &str) -> Result<Vec<AgentTrace>, String> {
        let all = self.read_traces()?;
        Ok(all
            .into_iter()
            .filter(|t| t.files.iter().any(|f| f.path == file_path))
            .collect())
    }

    pub fn get_session_traces(&self, session_id: &str) -> Result<Vec<AgentTrace>, String> {
        let all = self.read_traces()?;
        Ok(all
            .into_iter()
            .filter(|t| {
                t.metadata
                    .as_ref()
                    .map(|m| m.crafter_code.orchestrator_session_id == session_id)
                    .unwrap_or(false)
            })
            .collect())
    }

    pub fn get_worker_traces(&self, worker_id: &str) -> Result<Vec<AgentTrace>, String> {
        let all = self.read_traces()?;
        Ok(all
            .into_iter()
            .filter(|t| {
                t.metadata
                    .as_ref()
                    .map(|m| m.crafter_code.worker_id == worker_id)
                    .unwrap_or(false)
            })
            .collect())
    }
}
