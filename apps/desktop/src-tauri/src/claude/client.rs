use crate::claude::pricing::{calculate_cost, Model};
use crate::claude::types::{
    Message, MessageRequest, StreamEvent, Usage, WorkerEventType, WorkerStreamEvent,
};
use futures_util::StreamExt;
use reqwest::Client;
use tauri::{AppHandle, Emitter};
use thiserror::Error;

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

#[derive(Error, Debug)]
#[allow(dead_code)]
pub enum ClaudeError {
    #[error("HTTP request failed: {0}")]
    RequestError(#[from] reqwest::Error),

    #[error("API error: {0}")]
    ApiError(String),

    #[error("Stream parsing error: {0}")]
    StreamError(String),

    #[error("Missing API key")]
    MissingApiKey,
}

pub struct ClaudeClient {
    client: Client,
    api_key: String,
}

impl ClaudeClient {
    pub fn new(api_key: String) -> Result<Self, ClaudeError> {
        if api_key.is_empty() {
            return Err(ClaudeError::MissingApiKey);
        }

        Ok(Self {
            client: Client::new(),
            api_key,
        })
    }

    pub fn from_env() -> Result<Self, ClaudeError> {
        let api_key = std::env::var("ANTHROPIC_API_KEY")
            .map_err(|_| ClaudeError::MissingApiKey)?;
        Self::new(api_key)
    }

    pub async fn stream_message(
        &self,
        model: &Model,
        messages: Vec<Message>,
        system: Option<String>,
        max_tokens: u32,
        app_handle: AppHandle,
        worker_id: String,
    ) -> Result<(String, Usage, f64), ClaudeError> {
        let request = MessageRequest {
            model: model.model_id().to_string(),
            max_tokens,
            messages,
            system,
            stream: true,
        };

        let response = self
            .client
            .post(ANTHROPIC_API_URL)
            .header("Content-Type", "application/json")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(ClaudeError::ApiError(error_text));
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut output = String::new();
        let mut final_usage = Usage::default();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            let chunk_str = String::from_utf8_lossy(&chunk);
            buffer.push_str(&chunk_str);

            while let Some(line_end) = buffer.find('\n') {
                let line = buffer[..line_end].to_string();
                buffer = buffer[line_end + 1..].to_string();

                if line.starts_with("data: ") {
                    let data = &line[6..];
                    if let Ok(event) = serde_json::from_str::<StreamEvent>(data) {
                        match event {
                            StreamEvent::ContentBlockDelta { delta, .. } => {
                                let crate::claude::types::ContentDelta::TextDelta { text } = delta;
                                output.push_str(&text);
                                let _ = app_handle.emit(
                                    &format!("worker-stream-{}", worker_id),
                                    WorkerStreamEvent {
                                        worker_id: worker_id.clone(),
                                        event: WorkerEventType::Delta { text },
                                    },
                                );
                            }
                            StreamEvent::MessageDelta { usage, .. } => {
                                final_usage = usage;
                            }
                            StreamEvent::MessageStart { message } => {
                                final_usage = message.usage;
                            }
                            StreamEvent::Error { error } => {
                                let _ = app_handle.emit(
                                    &format!("worker-stream-{}", worker_id),
                                    WorkerStreamEvent {
                                        worker_id: worker_id.clone(),
                                        event: WorkerEventType::Error {
                                            message: error.message,
                                        },
                                    },
                                );
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        let cost = calculate_cost(model, final_usage.input_tokens, final_usage.output_tokens);

        let _ = app_handle.emit(
            &format!("worker-stream-{}", worker_id),
            WorkerStreamEvent {
                worker_id: worker_id.clone(),
                event: WorkerEventType::Complete {
                    output: output.clone(),
                    usage: final_usage.clone(),
                },
            },
        );

        Ok((output, final_usage, cost))
    }

    pub async fn send_message(
        &self,
        model: &Model,
        messages: Vec<Message>,
        system: Option<String>,
        max_tokens: u32,
    ) -> Result<(String, Usage, f64), ClaudeError> {
        let request = MessageRequest {
            model: model.model_id().to_string(),
            max_tokens,
            messages,
            system,
            stream: false,
        };

        let response = self
            .client
            .post(ANTHROPIC_API_URL)
            .header("Content-Type", "application/json")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(ClaudeError::ApiError(error_text));
        }

        let msg_response: crate::claude::types::MessageResponse = response.json().await?;
        let output = msg_response
            .content
            .iter()
            .filter_map(|c| {
                if c.content_type == "text" {
                    Some(c.text.clone())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("");

        let cost = calculate_cost(
            model,
            msg_response.usage.input_tokens,
            msg_response.usage.output_tokens,
        );

        Ok((output, msg_response.usage, cost))
    }
}
