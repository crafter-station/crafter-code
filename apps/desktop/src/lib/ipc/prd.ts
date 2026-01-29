import { invoke } from "@tauri-apps/api/core";
import type {
  Prd,
  PrdSession,
  PrdSessionStatus,
  ValidationResult,
  StoryProgress,
  RalphWorker,
  CostBreakdown,
} from "@/lib/types/prd";

// ============================================================================
// PRD Session Types (IPC-specific)
// ============================================================================

export interface PrdSessionSummary {
  id: string;
  title: string;
  status: PrdSessionStatus;
  storiesTotal: number;
  storiesCompleted: number;
  activeWorkers: number;
  totalCost: number;
  startedAt?: number;
}

// ============================================================================
// PRD Commands
// ============================================================================

/**
 * Validate a PRD before execution
 * Returns validation errors, warnings, estimated cost, and model assignments
 */
export async function validatePrd(prd: Prd): Promise<ValidationResult> {
  return invoke<ValidationResult>("validate_prd", { prd });
}

/**
 * Create a new PRD session and start execution
 */
export async function createPrdSession(prd: Prd): Promise<PrdSession> {
  return invoke<PrdSession>("create_prd_session", { prd });
}

/**
 * Get the current state of a PRD session
 */
export async function getPrdSession(sessionId: string): Promise<PrdSession> {
  return invoke<PrdSession>("get_prd_session", { sessionId });
}

/**
 * List all PRD sessions
 */
export async function listPrdSessions(): Promise<PrdSessionSummary[]> {
  return invoke<PrdSessionSummary[]>("list_prd_sessions");
}

/**
 * Pause a running PRD session
 */
export async function pausePrdSession(sessionId: string): Promise<void> {
  return invoke("pause_prd_session", { sessionId });
}

/**
 * Resume a paused PRD session
 */
export async function resumePrdSession(sessionId: string): Promise<void> {
  return invoke("resume_prd_session", { sessionId });
}

/**
 * Cancel a PRD session (stops all workers)
 */
export async function cancelPrdSession(sessionId: string): Promise<void> {
  return invoke("cancel_prd_session", { sessionId });
}

/**
 * Retry a failed story in a PRD session
 */
export async function retryStory(
  sessionId: string,
  storyId: string
): Promise<void> {
  return invoke("retry_prd_story", { sessionId, storyId });
}

/**
 * Get progress for a specific story
 */
export async function getStoryProgress(
  sessionId: string,
  storyId: string
): Promise<StoryProgress> {
  return invoke<StoryProgress>("get_story_progress", { sessionId, storyId });
}

/**
 * Get all workers in a PRD session
 */
export async function getPrdWorkers(sessionId: string): Promise<RalphWorker[]> {
  return invoke<RalphWorker[]>("get_prd_workers", { sessionId });
}

/**
 * Get cost breakdown for a PRD session
 */
export async function getCostBreakdown(
  sessionId: string
): Promise<CostBreakdown[]> {
  return invoke<CostBreakdown[]>("get_prd_cost_breakdown", { sessionId });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse PRD from JSON string
 */
export function parsePrd(json: string): Prd {
  return JSON.parse(json) as Prd;
}

/**
 * Serialize PRD to JSON string
 */
export function serializePrd(prd: Prd): string {
  return JSON.stringify(prd, null, 2);
}

/**
 * Check if a PRD session is in a terminal state
 */
export function isSessionTerminal(status: PrdSessionStatus): boolean {
  return status === "completed" || status === "failed";
}

/**
 * Check if a PRD session can be paused
 */
export function canPause(status: PrdSessionStatus): boolean {
  return status === "running";
}

/**
 * Check if a PRD session can be resumed
 */
export function canResume(status: PrdSessionStatus): boolean {
  return status === "paused";
}

/**
 * Format cost as USD string
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Format token count with K/M suffix
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}
