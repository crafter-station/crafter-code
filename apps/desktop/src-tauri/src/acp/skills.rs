//! Skills System - On-demand prompt injection
//!
//! Skills are domain-specific knowledge/instructions that get loaded
//! into context only when relevant, reducing context bloat.
//!
//! Inspired by Claude Code's skills system where prompts are loaded
//! "like Neo in The Matrix" - on demand when the model needs them.
//!
//! Now compatible with the Agent Skills open standard (agentskills.io)
//! for file-based SKILL.md loading from:
//! - ~/.crafter/skills/ (user global)
//! - .crafter/skills/ (project local)
//! - .claude/skills/ (Claude Code compatibility)

use crate::acp::skill_loader::{load_skill_body, SkillMetadata};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Source of a skill (built-in or file-based)
#[derive(Debug, Clone, Default)]
pub enum SkillSource {
    /// Built-in hardcoded skill
    #[default]
    Builtin,
    /// Loaded from a SKILL.md file
    File(PathBuf),
}

/// A skill that can be loaded on-demand
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    /// Unique identifier for the skill
    pub id: String,
    /// Human-readable name
    pub name: String,
    /// Brief description shown in skill list
    pub description: String,
    /// Keywords that trigger this skill to be suggested
    pub trigger_keywords: Vec<String>,
    /// The full prompt/instructions to inject when skill is loaded
    /// None for file-based skills until activated (lazy loading)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    /// Whether this skill is currently active in the session
    #[serde(default)]
    pub active: bool,
    /// Source of the skill (not serialized)
    #[serde(skip)]
    pub source: SkillSource,
}

impl Skill {
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        description: impl Into<String>,
        prompt: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            description: description.into(),
            trigger_keywords: Vec::new(),
            prompt: Some(prompt.into()),
            active: false,
            source: SkillSource::Builtin,
        }
    }

    pub fn with_triggers(mut self, keywords: Vec<&str>) -> Self {
        self.trigger_keywords = keywords.into_iter().map(String::from).collect();
        self
    }

    /// Create a skill from file-based metadata (lazy loading)
    pub fn from_metadata(metadata: SkillMetadata) -> Self {
        // Generate trigger keywords from name and description
        let mut keywords: Vec<String> = metadata
            .name
            .split('-')
            .map(|s| s.to_string())
            .collect();

        // Add first few words of description as keywords
        for word in metadata.description.split_whitespace().take(3) {
            let word_lower = word.to_lowercase();
            if word_lower.len() > 3 && !keywords.contains(&word_lower) {
                keywords.push(word_lower);
            }
        }

        Self {
            id: metadata.name.clone(),
            name: metadata
                .name
                .split('-')
                .map(|s| {
                    let mut c = s.chars();
                    match c.next() {
                        None => String::new(),
                        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" "),
            description: metadata.description,
            trigger_keywords: keywords,
            prompt: None, // Lazy load on activation
            active: false,
            source: SkillSource::File(metadata.path),
        }
    }
}

/// Built-in skills for swarm coordination
pub fn get_builtin_skills() -> Vec<Skill> {
    vec![
        // Code Review Skill
        Skill::new(
            "code-review",
            "Code Review",
            "Best practices for reviewing code changes",
            r#"## Code Review Guidelines

When reviewing code, follow these principles:

### What to Look For
1. **Correctness** - Does the code do what it's supposed to?
2. **Security** - Are there any vulnerabilities (injection, XSS, etc.)?
3. **Performance** - Are there any obvious inefficiencies?
4. **Readability** - Is the code clear and well-documented?
5. **Testing** - Are there adequate tests?

### Review Process
1. Understand the context and requirements first
2. Review the overall approach before details
3. Check for edge cases and error handling
4. Verify consistency with existing codebase patterns

### Feedback Style
- Be constructive and specific
- Explain the "why" behind suggestions
- Distinguish between blockers and nice-to-haves
- Acknowledge good practices you notice
"#,
        )
        .with_triggers(vec!["review", "pr", "pull request", "code review"]),

        // Debugging Skill
        Skill::new(
            "debugging",
            "Debugging",
            "Systematic approach to finding and fixing bugs",
            r#"## Debugging Approach

### Investigation Steps
1. **Reproduce** - Can you reliably reproduce the issue?
2. **Isolate** - What's the minimal case that shows the bug?
3. **Understand** - What is the expected vs actual behavior?
4. **Hypothesize** - What could cause this difference?
5. **Test** - Verify your hypothesis with targeted tests

### Debugging Tools
- Add strategic logging/print statements
- Use debugger breakpoints
- Check recent changes (git diff, git blame)
- Review error messages and stack traces carefully

### Common Bug Categories
- Off-by-one errors
- Null/undefined handling
- Race conditions
- State management issues
- API contract mismatches
"#,
        )
        .with_triggers(vec!["debug", "bug", "fix", "error", "issue"]),

        // Architecture Skill
        Skill::new(
            "architecture",
            "Software Architecture",
            "Guidance for architectural decisions",
            r#"## Architecture Decision Making

### Key Principles
1. **Simplicity** - The simplest solution that works
2. **Separation of Concerns** - Clear boundaries between components
3. **Dependency Direction** - High-level modules shouldn't depend on low-level
4. **Testability** - Can components be tested in isolation?

### Before Making Changes
- Understand the current architecture
- Consider the tradeoffs of each approach
- Think about future extensibility
- Document decisions and rationale

### Common Patterns
- Repository pattern for data access
- Service layer for business logic
- Event-driven for loose coupling
- CQRS for complex read/write scenarios
"#,
        )
        .with_triggers(vec![
            "architecture",
            "design",
            "refactor",
            "structure",
            "pattern",
        ]),

        // Testing Skill
        Skill::new(
            "testing",
            "Testing Best Practices",
            "Guidelines for writing effective tests",
            r#"## Testing Guidelines

### Test Types
- **Unit Tests** - Test individual functions/components in isolation
- **Integration Tests** - Test interactions between components
- **E2E Tests** - Test full user flows

### Writing Good Tests
1. **Arrange-Act-Assert** pattern
2. Test behavior, not implementation
3. One assertion per test (ideally)
4. Use descriptive test names
5. Keep tests independent

### What to Test
- Happy path scenarios
- Edge cases (empty, null, boundaries)
- Error conditions
- State transitions

### Test Maintenance
- Tests should be as maintainable as production code
- Avoid test interdependencies
- Don't over-mock
"#,
        )
        .with_triggers(vec!["test", "testing", "unit test", "e2e", "coverage"]),

        // Swarm Coordination Skill (meta-skill for multi-agent)
        Skill::new(
            "swarm-advanced",
            "Advanced Swarm Coordination",
            "Advanced patterns for multi-agent collaboration",
            r#"## Advanced Swarm Coordination

### Communication Patterns

**Request-Response**
```bash
# Worker asks leader for clarification
swarm inbox write leader "Need clarification on task 3 scope"
# Check for response
swarm inbox read --unread
```

**Pipeline Pattern**
Create tasks with dependencies for sequential execution:
- Task 1: Research (no dependencies)
- Task 2: Plan (blocked by Task 1)
- Task 3: Implement (blocked by Task 2)
- Task 4: Test (blocked by Task 3)

**Fan-out/Fan-in**
Leader creates multiple independent tasks, workers claim and complete them,
results are aggregated by leader.

### Handling Conflicts
When multiple workers might touch the same files:
1. Communicate intent via inbox before starting
2. Claim tasks atomically
3. Complete smaller tasks to reduce conflict window
4. Use specific file ownership when possible

### Status Reporting
Regularly update task status and notify team:
```bash
swarm task update <id> in_progress
# ... do work ...
swarm task update <id> completed
swarm inbox broadcast "Completed: <task subject>"
```
"#,
        )
        .with_triggers(vec![
            "swarm",
            "coordinate",
            "multi-agent",
            "team",
            "parallel",
        ]),
    ]
}

/// Skill manager for a session
pub struct SkillManager {
    skills: HashMap<String, Skill>,
    active_skills: Vec<String>,
}

impl SkillManager {
    pub fn new() -> Self {
        let mut manager = Self {
            skills: HashMap::new(),
            active_skills: Vec::new(),
        };

        // Load built-in skills
        for skill in get_builtin_skills() {
            manager.skills.insert(skill.id.clone(), skill);
        }

        manager
    }

    /// Load skills from directories (file-based override hardcoded)
    ///
    /// Skills from later directories override earlier ones with the same ID.
    /// This allows project-local skills to override user-global skills.
    pub fn load_from_directories(&mut self, dirs: &[PathBuf]) {
        use crate::acp::skill_loader::discover_skills;

        for dir in dirs {
            if dir.exists() {
                for metadata in discover_skills(dir) {
                    let skill = Skill::from_metadata(metadata);
                    // File-based skills override hardcoded by ID
                    self.skills.insert(skill.id.clone(), skill);
                }
            }
        }
    }

    /// Clear all file-based skills, keeping only built-in ones
    pub fn clear_file_skills(&mut self) {
        self.skills
            .retain(|_, skill| matches!(skill.source, SkillSource::Builtin));

        // Also clear active skills that were file-based
        self.active_skills.retain(|id| {
            self.skills
                .get(id)
                .map(|s| matches!(s.source, SkillSource::Builtin))
                .unwrap_or(false)
        });
    }

    /// Get all available skills
    pub fn list_skills(&self) -> Vec<&Skill> {
        self.skills.values().collect()
    }

    /// Get a specific skill by ID
    pub fn get_skill(&self, id: &str) -> Option<&Skill> {
        self.skills.get(id)
    }

    /// Activate a skill for the current session
    ///
    /// For file-based skills, this lazily loads the prompt body on first activation.
    pub fn activate_skill(&mut self, id: &str) -> Option<String> {
        if let Some(skill) = self.skills.get_mut(id) {
            // Lazy load prompt from file if needed
            if skill.prompt.is_none() {
                if let SkillSource::File(ref path) = skill.source {
                    match load_skill_body(path) {
                        Ok(body) => {
                            skill.prompt = Some(body);
                        }
                        Err(e) => {
                            eprintln!("Failed to load skill body from {:?}: {}", path, e);
                            return None;
                        }
                    }
                }
            }

            if !self.active_skills.contains(&id.to_string()) {
                skill.active = true;
                self.active_skills.push(id.to_string());
                return skill.prompt.clone();
            }
        }
        None
    }

    /// Deactivate a skill
    pub fn deactivate_skill(&mut self, id: &str) {
        if let Some(skill) = self.skills.get_mut(id) {
            skill.active = false;
        }
        self.active_skills.retain(|s| s != id);
    }

    /// Get prompts from all active skills
    pub fn get_active_prompts(&self) -> String {
        self.active_skills
            .iter()
            .filter_map(|id| self.skills.get(id))
            .filter_map(|s| s.prompt.as_ref())
            .map(|p| p.as_str())
            .collect::<Vec<_>>()
            .join("\n\n---\n\n")
    }

    /// Suggest skills based on user prompt
    pub fn suggest_skills(&self, user_prompt: &str) -> Vec<&Skill> {
        let prompt_lower = user_prompt.to_lowercase();
        self.skills
            .values()
            .filter(|skill| {
                !skill.active
                    && skill
                        .trigger_keywords
                        .iter()
                        .any(|kw| prompt_lower.contains(kw))
            })
            .collect()
    }

    /// Add a custom skill
    #[allow(dead_code)]
    pub fn add_skill(&mut self, skill: Skill) {
        self.skills.insert(skill.id.clone(), skill);
    }

    /// Get the number of skills loaded
    pub fn skill_count(&self) -> usize {
        self.skills.len()
    }

    /// Get the number of file-based skills
    pub fn file_skill_count(&self) -> usize {
        self.skills
            .values()
            .filter(|s| matches!(s.source, SkillSource::File(_)))
            .count()
    }
}

impl Default for SkillManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn test_skill_suggestions() {
        let manager = SkillManager::new();

        let suggestions = manager.suggest_skills("Can you review this PR?");
        assert!(suggestions.iter().any(|s| s.id == "code-review"));

        let suggestions = manager.suggest_skills("I need to debug this error");
        assert!(suggestions.iter().any(|s| s.id == "debugging"));
    }

    #[test]
    fn test_skill_activation() {
        let mut manager = SkillManager::new();

        let prompt = manager.activate_skill("code-review");
        assert!(prompt.is_some());
        assert!(prompt.unwrap().contains("Code Review"));

        // Activating again should return None
        assert!(manager.activate_skill("code-review").is_none());
    }

    #[test]
    fn test_builtin_skills_have_prompts() {
        let manager = SkillManager::new();

        for skill in manager.list_skills() {
            assert!(
                skill.prompt.is_some(),
                "Built-in skill {} should have a prompt",
                skill.id
            );
        }
    }

    #[test]
    fn test_file_skill_lazy_loading() {
        let tmp = TempDir::new().unwrap();
        let skill_dir = tmp.path().join("test-skill");
        fs::create_dir_all(&skill_dir).unwrap();

        let content = r#"---
name: test-skill
description: A test skill for lazy loading verification.
---

# Test Instructions

This is the test skill body.
"#;
        fs::write(skill_dir.join("SKILL.md"), content).unwrap();

        let mut manager = SkillManager::new();
        manager.load_from_directories(&[tmp.path().to_path_buf()]);

        // Skill should be discovered
        let skill = manager.get_skill("test-skill");
        assert!(skill.is_some());

        // Prompt should be None before activation (lazy loading)
        assert!(skill.unwrap().prompt.is_none());

        // After activation, prompt should be loaded
        let prompt = manager.activate_skill("test-skill");
        assert!(prompt.is_some());
        assert!(prompt.unwrap().contains("Test Instructions"));

        // After activation, the skill should have its prompt populated
        let skill = manager.get_skill("test-skill");
        assert!(skill.unwrap().prompt.is_some());
    }

    #[test]
    fn test_file_skill_overrides_builtin() {
        let tmp = TempDir::new().unwrap();
        let skill_dir = tmp.path().join("code-review");
        fs::create_dir_all(&skill_dir).unwrap();

        let content = r#"---
name: code-review
description: Custom code review for this project.
---

# My Custom Review Process

This overrides the built-in code review skill.
"#;
        fs::write(skill_dir.join("SKILL.md"), content).unwrap();

        let mut manager = SkillManager::new();
        manager.load_from_directories(&[tmp.path().to_path_buf()]);

        // File-based skill should override the built-in
        let skill = manager.get_skill("code-review");
        assert!(skill.is_some());
        assert!(matches!(skill.unwrap().source, SkillSource::File(_)));

        // When activated, should return custom content
        let prompt = manager.activate_skill("code-review");
        assert!(prompt.is_some());
        assert!(prompt.unwrap().contains("My Custom Review Process"));
    }

    #[test]
    fn test_clear_file_skills() {
        let tmp = TempDir::new().unwrap();
        let skill_dir = tmp.path().join("custom-skill");
        fs::create_dir_all(&skill_dir).unwrap();

        let content = r#"---
name: custom-skill
description: A custom skill to be cleared.
---

# Custom Body
"#;
        fs::write(skill_dir.join("SKILL.md"), content).unwrap();

        let mut manager = SkillManager::new();
        let initial_count = manager.skill_count();

        manager.load_from_directories(&[tmp.path().to_path_buf()]);
        assert_eq!(manager.skill_count(), initial_count + 1);
        assert_eq!(manager.file_skill_count(), 1);

        manager.clear_file_skills();
        assert_eq!(manager.skill_count(), initial_count);
        assert_eq!(manager.file_skill_count(), 0);
    }

    #[test]
    fn test_get_active_prompts_with_lazy_loaded() {
        let tmp = TempDir::new().unwrap();
        let skill_dir = tmp.path().join("active-test");
        fs::create_dir_all(&skill_dir).unwrap();

        let content = r#"---
name: active-test
description: Test active prompts with lazy loading.
---

# Active Test Content
"#;
        fs::write(skill_dir.join("SKILL.md"), content).unwrap();

        let mut manager = SkillManager::new();
        manager.load_from_directories(&[tmp.path().to_path_buf()]);

        // Activate both built-in and file-based skills
        manager.activate_skill("debugging");
        manager.activate_skill("active-test");

        let prompts = manager.get_active_prompts();
        assert!(prompts.contains("Debugging")); // From built-in
        assert!(prompts.contains("Active Test Content")); // From file
    }
}
