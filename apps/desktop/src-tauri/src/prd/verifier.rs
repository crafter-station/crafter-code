//! Acceptance criteria verification

use super::types::{AcceptanceCriterion, CriterionStatus, CriterionType, Story};
use std::path::Path;
use std::process::Command;

/// Verify a single acceptance criterion
pub async fn verify_criterion(
    criterion: &AcceptanceCriterion,
    working_dir: Option<&Path>,
) -> CriterionStatus {
    match criterion.criterion_type {
        CriterionType::Test => verify_test(criterion, working_dir).await,
        CriterionType::FileExists => verify_file_exists(criterion, working_dir),
        CriterionType::Pattern => verify_pattern(criterion, working_dir),
        CriterionType::Custom => verify_custom(criterion, working_dir).await,
    }
}

/// Verify all acceptance criteria for a story
pub async fn verify_all_criteria(
    story: &Story,
    working_dir: Option<&Path>,
) -> Vec<CriterionStatus> {
    let mut results = Vec::new();

    for criterion in &story.acceptance_criteria {
        let status = verify_criterion(criterion, working_dir).await;
        results.push(status);
    }

    results
}

/// Check if all criteria pass
pub fn all_criteria_pass(statuses: &[CriterionStatus]) -> bool {
    statuses.iter().all(|s| s.passed)
}

/// Verify a test criterion (run command, check exit code)
async fn verify_test(
    criterion: &AcceptanceCriterion,
    working_dir: Option<&Path>,
) -> CriterionStatus {
    let command = match &criterion.command {
        Some(cmd) => cmd,
        None => return CriterionStatus::failed("No command specified".to_string()),
    };

    // Parse command - handle shell commands
    let output = if cfg!(target_os = "windows") {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", command]);
        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }
        cmd.output()
    } else {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", command]);
        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }
        cmd.output()
    };

    match output {
        Ok(out) => {
            if out.status.success() {
                CriterionStatus::passed()
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr);
                let stdout = String::from_utf8_lossy(&out.stdout);
                let error = if !stderr.is_empty() {
                    stderr.to_string()
                } else if !stdout.is_empty() {
                    stdout.to_string()
                } else {
                    format!("Command exited with code: {:?}", out.status.code())
                };
                CriterionStatus::failed(error)
            }
        }
        Err(e) => CriterionStatus::failed(format!("Failed to execute command: {}", e)),
    }
}

/// Verify a file_exists criterion
fn verify_file_exists(
    criterion: &AcceptanceCriterion,
    working_dir: Option<&Path>,
) -> CriterionStatus {
    let path_str = match &criterion.path {
        Some(p) => p,
        None => return CriterionStatus::failed("No path specified".to_string()),
    };

    let path = if Path::new(path_str).is_absolute() {
        Path::new(path_str).to_path_buf()
    } else if let Some(dir) = working_dir {
        dir.join(path_str)
    } else {
        Path::new(path_str).to_path_buf()
    };

    if path.exists() {
        CriterionStatus::passed()
    } else {
        CriterionStatus::failed(format!("File not found: {}", path.display()))
    }
}

/// Verify a pattern criterion (regex match in file)
fn verify_pattern(
    criterion: &AcceptanceCriterion,
    working_dir: Option<&Path>,
) -> CriterionStatus {
    let file_path = match &criterion.file {
        Some(f) => f,
        None => return CriterionStatus::failed("No file specified".to_string()),
    };

    let pattern = match &criterion.pattern {
        Some(p) => p,
        None => return CriterionStatus::failed("No pattern specified".to_string()),
    };

    let path = if Path::new(file_path).is_absolute() {
        Path::new(file_path).to_path_buf()
    } else if let Some(dir) = working_dir {
        dir.join(file_path)
    } else {
        Path::new(file_path).to_path_buf()
    };

    // Read file content
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => return CriterionStatus::failed(format!("Failed to read file: {}", e)),
    };

    // Compile regex
    let regex = match regex::Regex::new(pattern) {
        Ok(r) => r,
        Err(e) => return CriterionStatus::failed(format!("Invalid regex: {}", e)),
    };

    // Check for match
    if regex.is_match(&content) {
        CriterionStatus::passed()
    } else {
        CriterionStatus::failed(format!(
            "Pattern '{}' not found in {}",
            pattern,
            path.display()
        ))
    }
}

/// Verify a custom criterion (execute script)
async fn verify_custom(
    criterion: &AcceptanceCriterion,
    working_dir: Option<&Path>,
) -> CriterionStatus {
    let script = match &criterion.script {
        Some(s) => s,
        None => return CriterionStatus::failed("No script specified".to_string()),
    };

    // Execute script through shell
    let output = if cfg!(target_os = "windows") {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", script]);
        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }
        cmd.output()
    } else {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", script]);
        if let Some(dir) = working_dir {
            cmd.current_dir(dir);
        }
        cmd.output()
    };

    match output {
        Ok(out) => {
            if out.status.success() {
                CriterionStatus::passed()
            } else {
                let stderr = String::from_utf8_lossy(&out.stderr);
                CriterionStatus::failed(if stderr.is_empty() {
                    format!("Script exited with code: {:?}", out.status.code())
                } else {
                    stderr.to_string()
                })
            }
        }
        Err(e) => CriterionStatus::failed(format!("Failed to execute script: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_verify_file_exists_pass() {
        let criterion = AcceptanceCriterion {
            criterion_type: CriterionType::FileExists,
            command: None,
            path: Some("/tmp".to_string()),
            file: None,
            pattern: None,
            script: None,
            description: None,
        };

        let result = verify_criterion(&criterion, None).await;
        assert!(result.passed);
    }

    #[tokio::test]
    async fn test_verify_file_exists_fail() {
        let criterion = AcceptanceCriterion {
            criterion_type: CriterionType::FileExists,
            command: None,
            path: Some("/nonexistent/path/12345".to_string()),
            file: None,
            pattern: None,
            script: None,
            description: None,
        };

        let result = verify_criterion(&criterion, None).await;
        assert!(!result.passed);
        assert!(result.error.is_some());
    }

    #[tokio::test]
    async fn test_verify_test_pass() {
        let criterion = AcceptanceCriterion {
            criterion_type: CriterionType::Test,
            command: Some("true".to_string()),
            path: None,
            file: None,
            pattern: None,
            script: None,
            description: None,
        };

        let result = verify_criterion(&criterion, None).await;
        assert!(result.passed);
    }

    #[tokio::test]
    async fn test_verify_test_fail() {
        let criterion = AcceptanceCriterion {
            criterion_type: CriterionType::Test,
            command: Some("false".to_string()),
            path: None,
            file: None,
            pattern: None,
            script: None,
            description: None,
        };

        let result = verify_criterion(&criterion, None).await;
        assert!(!result.passed);
    }
}
