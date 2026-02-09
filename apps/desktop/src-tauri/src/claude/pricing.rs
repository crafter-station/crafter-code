use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Model {
    #[serde(rename = "claude-opus-4-5-20251101")]
    Opus,
    #[serde(rename = "claude-sonnet-4-5-20250929")]
    Sonnet,
    #[serde(rename = "claude-haiku-4-5-20251001")]
    Haiku,
}

impl Model {
    pub fn model_id(&self) -> &'static str {
        match self {
            Model::Opus => "claude-opus-4-5-20251101",
            Model::Sonnet => "claude-sonnet-4-5-20250929",
            Model::Haiku => "claude-haiku-4-5-20251001",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            Model::Opus => "Opus 4.5",
            Model::Sonnet => "Sonnet 4.5",
            Model::Haiku => "Haiku 4.5",
        }
    }

    pub fn from_string(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "opus" | "claude-opus-4-5-20251101" => Some(Model::Opus),
            "sonnet" | "claude-sonnet-4-5-20250929" => Some(Model::Sonnet),
            "haiku" | "claude-haiku-4-5-20251001" => Some(Model::Haiku),
            _ => None,
        }
    }
}

impl Default for Model {
    fn default() -> Self {
        Model::Sonnet
    }
}

struct Pricing {
    input_per_million: f64,
    output_per_million: f64,
}

fn get_pricing(model: &Model) -> Pricing {
    match model {
        Model::Opus => Pricing {
            input_per_million: 15.0,
            output_per_million: 75.0,
        },
        Model::Sonnet => Pricing {
            input_per_million: 3.0,
            output_per_million: 15.0,
        },
        Model::Haiku => Pricing {
            input_per_million: 0.80,
            output_per_million: 4.0,
        },
    }
}

pub fn calculate_cost(model: &Model, input_tokens: u64, output_tokens: u64) -> f64 {
    let pricing = get_pricing(model);
    let input_cost = (input_tokens as f64 / 1_000_000.0) * pricing.input_per_million;
    let output_cost = (output_tokens as f64 / 1_000_000.0) * pricing.output_per_million;
    input_cost + output_cost
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opus_cost() {
        let cost = calculate_cost(&Model::Opus, 1000, 500);
        assert!((cost - 0.0525).abs() < 0.0001);
    }

    #[test]
    fn test_sonnet_cost() {
        let cost = calculate_cost(&Model::Sonnet, 1000, 500);
        assert!((cost - 0.0105).abs() < 0.0001);
    }

    #[test]
    fn test_haiku_cost() {
        let cost = calculate_cost(&Model::Haiku, 1000, 500);
        assert!((cost - 0.0028).abs() < 0.0001);
    }
}
