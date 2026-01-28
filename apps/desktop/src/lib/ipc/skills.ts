import { invoke } from "@tauri-apps/api/core";

// ==================== SKILLS ====================

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  triggerKeywords: string[];
  active: boolean;
}

/**
 * List all available skills for a session
 */
export async function listSkills(sessionId: string): Promise<SkillInfo[]> {
  return invoke<SkillInfo[]>("list_skills", { sessionId });
}

/**
 * Get a specific skill by ID
 */
export async function getSkill(
  sessionId: string,
  skillId: string,
): Promise<SkillInfo | null> {
  return invoke<SkillInfo | null>("get_skill", { sessionId, skillId });
}

/**
 * Activate a skill and get its prompt to inject
 */
export async function activateSkill(
  sessionId: string,
  skillId: string,
): Promise<string> {
  return invoke<string>("activate_skill", { sessionId, skillId });
}

/**
 * Deactivate a skill
 */
export async function deactivateSkill(
  sessionId: string,
  skillId: string,
): Promise<void> {
  return invoke<void>("deactivate_skill", { sessionId, skillId });
}

/**
 * Get combined prompts from all active skills
 */
export async function getActiveSkillPrompts(
  sessionId: string,
): Promise<string> {
  return invoke<string>("get_active_skill_prompts", { sessionId });
}

/**
 * Get skill suggestions based on user prompt
 */
export async function suggestSkills(
  sessionId: string,
  userPrompt: string,
): Promise<SkillInfo[]> {
  return invoke<SkillInfo[]>("suggest_skills", { sessionId, userPrompt });
}

// ==================== WORKSPACE SKILLS (NO SESSION REQUIRED) ====================

/**
 * Skill info for workspace display (no session required)
 */
export interface WorkspaceSkillInfo {
  name: string;
  description: string;
  source: "user" | "project";
  path: string;
}

/**
 * Result of workspace skills query
 */
export interface WorkspaceSkills {
  globalSkills: WorkspaceSkillInfo[];
  projectSkills: WorkspaceSkillInfo[];
  directoriesSearched: string[];
}

/**
 * List skills for workspace display (no session required)
 *
 * Loads skills from provider-specific directories:
 * 1. ~/.{config_dir}/skills/ (user global)
 * 2. {project}/.{config_dir}/skills/ (project local)
 *
 * The config_dir is determined by the agentId parameter:
 * - claude → .claude
 * - gemini → .gemini
 * - copilot → .copilot
 * - etc.
 */
export async function listWorkspaceSkills(
  projectDir?: string,
  agentId?: string,
): Promise<WorkspaceSkills> {
  return invoke<WorkspaceSkills>("list_workspace_skills", {
    projectDir,
    agentId,
  });
}

/**
 * Command info for workspace display
 */
export interface WorkspaceCommandInfo {
  name: string;
  description: string;
  category: string;
  inputHint: string | null;
  source: "builtin" | "user" | "project";
}

/**
 * Result of workspace commands query
 */
export interface WorkspaceCommands {
  builtinCommands: WorkspaceCommandInfo[];
  globalCommands: WorkspaceCommandInfo[];
  projectCommands: WorkspaceCommandInfo[];
}

/**
 * List workspace commands (builtin + global + project)
 *
 * Loads commands from provider-specific directories:
 * 1. Built-in commands (always available)
 * 2. ~/.{config_dir}/commands/ (global)
 * 3. {project}/.{config_dir}/commands/ (project)
 *
 * The config_dir is determined by the agentId parameter
 */
export async function listWorkspaceCommands(
  projectDir?: string,
  agentId?: string,
): Promise<WorkspaceCommands> {
  return invoke<WorkspaceCommands>("list_workspace_commands", {
    projectDir,
    agentId,
  });
}

// ==================== FILE-BASED SKILLS (Agent Skills Spec) ====================

/**
 * Result of skill loading operations
 */
export interface SkillLoadResult {
  /** Total number of skills available */
  totalSkills: number;
  /** Number of file-based skills loaded */
  fileSkills: number;
  /** Directories that were searched */
  directoriesSearched: string[];
}

/**
 * Initialize skills with project context
 *
 * Loads skills from provider-specific directories:
 * 1. ~/.{config_dir}/skills/ (user global)
 * 2. {project}/.{config_dir}/skills/ (project local)
 *
 * File-based skills override built-in skills with the same ID.
 */
export async function initSkills(
  sessionId: string,
  projectDir?: string,
  agentId?: string,
): Promise<SkillLoadResult> {
  return invoke<SkillLoadResult>("init_skills", {
    sessionId,
    projectDir,
    agentId,
  });
}

/**
 * Reload skills from disk
 *
 * Clears all file-based skills and reloads from directories.
 * Built-in skills are preserved.
 */
export async function reloadSkills(
  sessionId: string,
  projectDir?: string,
  agentId?: string,
): Promise<SkillLoadResult> {
  return invoke<SkillLoadResult>("reload_skills", {
    sessionId,
    projectDir,
    agentId,
  });
}

// ==================== SLASH COMMANDS ====================

export interface CommandInfo {
  name: string;
  description: string;
  inputHint: string | null;
  category: "swarm" | "code" | "git" | "analysis" | "utility";
}

/**
 * List all available slash commands
 */
export async function listSlashCommands(
  sessionId: string,
): Promise<CommandInfo[]> {
  return invoke<CommandInfo[]>("list_slash_commands", { sessionId });
}

/**
 * List commands by category
 */
export async function listCommandsByCategory(
  sessionId: string,
  category: CommandInfo["category"],
): Promise<CommandInfo[]> {
  return invoke<CommandInfo[]>("list_commands_by_category", {
    sessionId,
    category,
  });
}

/**
 * Process a slash command and get the expanded prompt
 */
export async function processSlashCommand(
  sessionId: string,
  input: string,
): Promise<string | null> {
  return invoke<string | null>("process_slash_command", { sessionId, input });
}

/**
 * Check if input is a slash command
 */
export async function isSlashCommand(input: string): Promise<boolean> {
  return invoke<boolean>("is_slash_command", { input });
}

// ==================== COMBINED ====================

export interface ProcessedInput {
  /** The final prompt to send (may be expanded from slash command) */
  prompt: string;
  /** Whether this was a slash command */
  wasCommand: boolean;
  /** Suggested skills based on the prompt */
  skillSuggestions: SkillInfo[];
  /** Active skill prompts to prepend */
  skillContext: string;
}

/**
 * Process user input, handling skills and slash commands
 * This is the main function to call when user submits input
 */
export async function processUserInput(
  sessionId: string,
  input: string,
): Promise<ProcessedInput> {
  return invoke<ProcessedInput>("process_user_input", { sessionId, input });
}

/**
 * Cleanup session-specific skill and command data
 */
export async function cleanupSessionFeatures(sessionId: string): Promise<void> {
  return invoke<void>("cleanup_session_features", { sessionId });
}

// ==================== UTILITY TYPES ====================

export type SkillCategory =
  | "code-review"
  | "debugging"
  | "architecture"
  | "testing"
  | "swarm-advanced";

export type CommandCategory = "swarm" | "code" | "git" | "analysis" | "utility";

/**
 * Get commands grouped by category
 */
export async function getCommandsByCategory(
  sessionId: string,
): Promise<Record<CommandCategory, CommandInfo[]>> {
  const allCommands = await listSlashCommands(sessionId);

  const grouped: Record<CommandCategory, CommandInfo[]> = {
    swarm: [],
    code: [],
    git: [],
    analysis: [],
    utility: [],
  };

  for (const cmd of allCommands) {
    grouped[cmd.category].push(cmd);
  }

  return grouped;
}
