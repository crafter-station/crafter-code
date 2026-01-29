//! PRD parsing and validation

use super::types::{
    AcceptanceCriterion, Complexity, CriterionType, ModelId, Prd, Story, ValidationResult,
};
use std::collections::{HashMap, HashSet};

/// Validate a PRD and return model assignments + dependency order
pub fn validate_prd(prd: &Prd) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // 1. Check for empty stories
    if prd.stories.is_empty() {
        errors.push("PRD must have at least one story".to_string());
        return ValidationResult::invalid(errors);
    }

    // 2. Check for unique story IDs
    let mut seen_ids = HashSet::new();
    for story in &prd.stories {
        if !seen_ids.insert(&story.id) {
            errors.push(format!("Duplicate story ID: {}", story.id));
        }
    }

    // 3. Check dependencies reference existing stories
    let all_ids: HashSet<_> = prd.stories.iter().map(|s| &s.id).collect();
    for story in &prd.stories {
        for dep in &story.dependencies {
            if !all_ids.contains(dep) {
                errors.push(format!(
                    "Story '{}' depends on non-existent story '{}'",
                    story.id, dep
                ));
            }
        }
    }

    // 4. Check for circular dependencies
    if let Some(cycle) = detect_cycle(&prd.stories) {
        errors.push(format!("Circular dependency detected: {}", cycle.join(" -> ")));
    }

    // 5. Check each story has at least one acceptance criterion
    for story in &prd.stories {
        if story.acceptance_criteria.is_empty() {
            errors.push(format!(
                "Story '{}' must have at least one acceptance criterion",
                story.id
            ));
        }
    }

    // 6. Validate acceptance criteria
    for story in &prd.stories {
        for (i, criterion) in story.acceptance_criteria.iter().enumerate() {
            if let Some(error) = validate_criterion(criterion) {
                errors.push(format!(
                    "Story '{}' criterion {}: {}",
                    story.id,
                    i + 1,
                    error
                ));
            }
        }
    }

    // 7. Validate constraints
    if prd.constraints.max_workers == 0 {
        errors.push("max_workers must be at least 1".to_string());
    }
    if prd.constraints.max_iterations_per_story == 0 {
        errors.push("max_iterations_per_story must be at least 1".to_string());
    }

    if !errors.is_empty() {
        return ValidationResult::invalid(errors);
    }

    // Calculate model assignments
    let model_assignments = assign_models(prd);

    // Calculate dependency order (topological sort)
    let dependency_order = topological_sort(&prd.stories);

    // Estimate cost
    let estimated_cost = estimate_cost(prd, &model_assignments);

    // Add warnings
    if prd.constraints.max_workers > prd.stories.len() as u32 {
        warnings.push(format!(
            "max_workers ({}) exceeds story count ({})",
            prd.constraints.max_workers,
            prd.stories.len()
        ));
    }

    let mut result = ValidationResult::valid(estimated_cost, model_assignments, dependency_order);
    result.warnings = warnings;
    result
}

/// Validate a single acceptance criterion
fn validate_criterion(criterion: &AcceptanceCriterion) -> Option<String> {
    match criterion.criterion_type {
        CriterionType::Test => {
            if criterion.command.is_none() || criterion.command.as_ref().map(|c| c.is_empty()).unwrap_or(true) {
                return Some("'test' criterion requires a non-empty 'command'".to_string());
            }
        }
        CriterionType::FileExists => {
            if criterion.path.is_none() || criterion.path.as_ref().map(|p| p.is_empty()).unwrap_or(true) {
                return Some("'file_exists' criterion requires a non-empty 'path'".to_string());
            }
        }
        CriterionType::Pattern => {
            if criterion.file.is_none() || criterion.file.as_ref().map(|f| f.is_empty()).unwrap_or(true) {
                return Some("'pattern' criterion requires a non-empty 'file'".to_string());
            }
            if criterion.pattern.is_none() || criterion.pattern.as_ref().map(|p| p.is_empty()).unwrap_or(true) {
                return Some("'pattern' criterion requires a non-empty 'pattern'".to_string());
            }
            // Validate regex
            if let Some(pattern) = &criterion.pattern {
                if regex::Regex::new(pattern).is_err() {
                    return Some(format!("Invalid regex pattern: {}", pattern));
                }
            }
        }
        CriterionType::Custom => {
            if criterion.script.is_none() || criterion.script.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
                return Some("'custom' criterion requires a non-empty 'script'".to_string());
            }
        }
    }
    None
}

/// Detect circular dependencies using DFS
fn detect_cycle(stories: &[Story]) -> Option<Vec<String>> {
    let dep_map: HashMap<String, Vec<String>> = stories
        .iter()
        .map(|s| (s.id.clone(), s.dependencies.clone()))
        .collect();

    let mut visited = HashSet::new();
    let mut rec_stack = HashSet::new();
    let mut path = Vec::new();

    for story in stories {
        if !visited.contains(&story.id) {
            if let Some(cycle) = dfs_cycle(&story.id, &dep_map, &mut visited, &mut rec_stack, &mut path) {
                return Some(cycle);
            }
        }
    }

    None
}

fn dfs_cycle(
    node: &str,
    dep_map: &HashMap<String, Vec<String>>,
    visited: &mut HashSet<String>,
    rec_stack: &mut HashSet<String>,
    path: &mut Vec<String>,
) -> Option<Vec<String>> {
    visited.insert(node.to_string());
    rec_stack.insert(node.to_string());
    path.push(node.to_string());

    if let Some(deps) = dep_map.get(node) {
        for dep in deps {
            if !visited.contains(dep) {
                if let Some(cycle) = dfs_cycle(dep, dep_map, visited, rec_stack, path) {
                    return Some(cycle);
                }
            } else if rec_stack.contains(dep) {
                // Found cycle
                path.push(dep.clone());
                return Some(path.clone());
            }
        }
    }

    rec_stack.remove(node);
    path.pop();
    None
}

/// Topological sort for dependency order
fn topological_sort(stories: &[Story]) -> Vec<String> {
    let mut in_degree: HashMap<&str, usize> = HashMap::new();
    let mut graph: HashMap<&str, Vec<&str>> = HashMap::new();

    // Initialize
    for story in stories {
        in_degree.entry(&story.id).or_insert(0);
        graph.entry(&story.id).or_default();
    }

    // Build graph
    for story in stories {
        for dep in &story.dependencies {
            if let Some(deg) = in_degree.get_mut(story.id.as_str()) {
                *deg += 1;
            }
            graph.entry(dep.as_str()).or_default().push(&story.id);
        }
    }

    // Kahn's algorithm
    let mut queue: Vec<&str> = in_degree
        .iter()
        .filter(|(_, &deg)| deg == 0)
        .map(|(&id, _)| id)
        .collect();

    let mut result = Vec::new();

    while let Some(node) = queue.pop() {
        result.push(node.to_string());

        if let Some(neighbors) = graph.get(node) {
            for neighbor in neighbors {
                if let Some(deg) = in_degree.get_mut(*neighbor) {
                    *deg -= 1;
                    if *deg == 0 {
                        queue.push(*neighbor);
                    }
                }
            }
        }
    }

    result
}

/// Assign models to stories based on complexity
fn assign_models(prd: &Prd) -> HashMap<String, ModelId> {
    let default_model = prd
        .constraints
        .models
        .as_ref()
        .and_then(|m| m.default)
        .unwrap_or(ModelId::Sonnet);

    prd.stories
        .iter()
        .map(|story| {
            let model = story.model.unwrap_or_else(|| {
                story
                    .complexity
                    .map(|c| c.recommended_model())
                    .unwrap_or(default_model)
            });
            (story.id.clone(), model)
        })
        .collect()
}

/// Estimate total cost based on model assignments
fn estimate_cost(prd: &Prd, assignments: &HashMap<String, ModelId>) -> f64 {
    // Estimate tokens per iteration (rough approximation)
    const ESTIMATED_INPUT_TOKENS: u64 = 2000;
    const ESTIMATED_OUTPUT_TOKENS: u64 = 1000;

    // Assume average of half max iterations
    let avg_iterations = prd.constraints.max_iterations_per_story as f64 / 2.0;

    let mut total = 0.0;
    for story in &prd.stories {
        let model = assignments.get(&story.id).unwrap_or(&ModelId::Sonnet);
        let story_cost = model.calculate_cost(ESTIMATED_INPUT_TOKENS, ESTIMATED_OUTPUT_TOKENS)
            * avg_iterations;
        total += story_cost;
    }

    total
}

/// Estimate complexity of a story based on heuristics
pub fn estimate_complexity(story: &Story) -> Complexity {
    let mut score = 0;

    // Description length
    if story.description.len() > 500 {
        score += 2;
    } else if story.description.len() > 200 {
        score += 1;
    }

    // Number of acceptance criteria
    if story.acceptance_criteria.len() > 5 {
        score += 2;
    } else if story.acceptance_criteria.len() > 2 {
        score += 1;
    }

    // Number of dependencies
    if story.dependencies.len() > 3 {
        score += 2;
    } else if story.dependencies.len() > 1 {
        score += 1;
    }

    // Hints suggest complexity
    if let Some(hints) = &story.hints {
        if hints.len() > 3 {
            score += 1;
        }
    }

    // Check for complex patterns in criteria
    for criterion in &story.acceptance_criteria {
        if matches!(criterion.criterion_type, CriterionType::Custom) {
            score += 1;
        }
    }

    match score {
        0..=2 => Complexity::Low,
        3..=5 => Complexity::Medium,
        _ => Complexity::High,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn simple_prd() -> Prd {
        Prd {
            title: "Test PRD".to_string(),
            description: None,
            stories: vec![Story {
                id: "s1".to_string(),
                title: "Story 1".to_string(),
                description: "Do something".to_string(),
                acceptance_criteria: vec![AcceptanceCriterion {
                    criterion_type: CriterionType::FileExists,
                    command: None,
                    path: Some("/tmp/test".to_string()),
                    file: None,
                    pattern: None,
                    script: None,
                    description: Some("File exists".to_string()),
                }],
                dependencies: vec![],
                hints: None,
                complexity: None,
                model: None,
            }],
            constraints: super::super::types::PrdConstraints::default(),
        }
    }

    #[test]
    fn test_valid_prd() {
        let prd = simple_prd();
        let result = validate_prd(&prd);
        assert!(result.valid);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn test_empty_stories() {
        let mut prd = simple_prd();
        prd.stories.clear();
        let result = validate_prd(&prd);
        assert!(!result.valid);
        assert!(result.errors.iter().any(|e| e.contains("at least one story")));
    }

    #[test]
    fn test_duplicate_ids() {
        let mut prd = simple_prd();
        prd.stories.push(prd.stories[0].clone());
        let result = validate_prd(&prd);
        assert!(!result.valid);
        assert!(result.errors.iter().any(|e| e.contains("Duplicate story ID")));
    }
}
