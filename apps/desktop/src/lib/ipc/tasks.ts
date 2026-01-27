import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Task System Types
// ============================================================================

export type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";

export interface Task {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: TaskStatus;
  owner?: string;
  blockedBy: string[];
  blocks: string[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface TaskUpdate {
  status?: TaskStatus;
  owner?: string;
  subject?: string;
  description?: string;
  activeForm?: string;
  addBlockedBy?: string[];
  addBlocks?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Task Commands
// ============================================================================

/**
 * Create a new task in the session
 */
export async function taskCreate(
  sessionId: string,
  subject: string,
  description: string,
  activeForm?: string,
): Promise<Task> {
  return invoke<Task>("task_create", {
    sessionId,
    subject,
    description,
    activeForm,
  });
}

/**
 * List all tasks in the session (excludes deleted)
 */
export async function taskList(sessionId: string): Promise<Task[]> {
  return invoke<Task[]>("task_list", { sessionId });
}

/**
 * Get a specific task by ID
 */
export async function taskGet(sessionId: string, taskId: string): Promise<Task> {
  return invoke<Task>("task_get", { sessionId, taskId });
}

/**
 * Update a task (status, owner, dependencies, etc.)
 */
export async function taskUpdate(
  sessionId: string,
  taskId: string,
  updates: TaskUpdate,
): Promise<Task> {
  return invoke<Task>("task_update", { sessionId, taskId, updates });
}

/**
 * Claim the next available task for a worker
 * Returns the claimed task or null if no tasks available
 */
export async function taskClaim(
  sessionId: string,
  workerId: string,
): Promise<Task | null> {
  return invoke<Task | null>("task_claim", { sessionId, workerId });
}

/**
 * Delete a task (soft delete - marks as deleted)
 */
export async function taskDelete(sessionId: string, taskId: string): Promise<Task> {
  return invoke<Task>("task_delete", { sessionId, taskId });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a task with dependencies
 */
export async function createTaskWithDependencies(
  sessionId: string,
  subject: string,
  description: string,
  blockedBy: string[],
  activeForm?: string,
): Promise<Task> {
  const task = await taskCreate(sessionId, subject, description, activeForm);

  if (blockedBy.length > 0) {
    return taskUpdate(sessionId, task.id, { addBlockedBy: blockedBy });
  }

  return task;
}

/**
 * Complete a task (marks as completed, auto-unblocks dependents)
 */
export async function completeTask(
  sessionId: string,
  taskId: string,
): Promise<Task> {
  return taskUpdate(sessionId, taskId, { status: "completed" });
}

/**
 * Start working on a task (marks as in_progress)
 */
export async function startTask(
  sessionId: string,
  taskId: string,
  workerId: string,
): Promise<Task> {
  return taskUpdate(sessionId, taskId, {
    status: "in_progress",
    owner: workerId
  });
}

/**
 * Get all available tasks (pending, unblocked, unassigned)
 */
export async function getAvailableTasks(sessionId: string): Promise<Task[]> {
  const tasks = await taskList(sessionId);
  return tasks.filter(
    (t) => t.status === "pending" && !t.owner && t.blockedBy.length === 0
  );
}

/**
 * Get tasks assigned to a specific worker
 */
export async function getWorkerTasks(
  sessionId: string,
  workerId: string,
): Promise<Task[]> {
  const tasks = await taskList(sessionId);
  return tasks.filter((t) => t.owner === workerId);
}
