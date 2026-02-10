use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTrace {
    pub version: String,
    pub id: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vcs: Option<VcsInfo>,
    pub tool: ToolInfo,
    pub files: Vec<TracedFile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<TraceMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VcsInfo {
    #[serde(rename = "type")]
    pub vcs_type: String,
    pub revision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInfo {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TracedFile {
    pub path: String,
    pub conversations: Vec<Conversation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    pub contributor: Contributor,
    pub ranges: Vec<LineRange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related: Option<Vec<RelatedResource>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contributor {
    #[serde(rename = "type")]
    pub contributor_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineRange {
    pub start_line: u32,
    pub end_line: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelatedResource {
    #[serde(rename = "type")]
    pub resource_type: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TraceMetadata {
    #[serde(rename = "dev.crafter-code")]
    pub crafter_code: CrafterCodeMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrafterCodeMetadata {
    pub orchestrator_session_id: String,
    pub worker_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost: Option<CostAttribution>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostAttribution {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cost_usd: f64,
}
