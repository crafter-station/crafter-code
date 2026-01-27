import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Inbox System Types
// ============================================================================

export type MessageType =
  | { type: "text"; content: string }
  | { type: "shutdown_request"; requestId: string; reason: string }
  | { type: "shutdown_approved"; requestId: string }
  | { type: "shutdown_rejected"; requestId: string; reason: string }
  | { type: "idle_notification"; completedTaskId?: string }
  | { type: "task_completed"; taskId: string; taskSubject: string }
  | { type: "plan_approval_request"; requestId: string; planContent: string }
  | { type: "plan_approved"; requestId: string }
  | { type: "plan_rejected"; requestId: string; feedback: string }
  | { type: "custom"; action: string; data: unknown };

export interface Message {
  id: string;
  from: string;
  to: string;
  message: MessageType;
  read: boolean;
  timestamp: number;
}

// ============================================================================
// Inbox Commands
// ============================================================================

/**
 * Register a worker in the inbox system
 */
export async function inboxRegister(
  sessionId: string,
  workerId: string,
): Promise<void> {
  return invoke<void>("inbox_register", { sessionId, workerId });
}

/**
 * Send a text message to another worker
 */
export async function inboxWrite(
  sessionId: string,
  from: string,
  to: string,
  content: string,
): Promise<Message> {
  return invoke<Message>("inbox_write", { sessionId, from, to, content });
}

/**
 * Broadcast a text message to all workers
 */
export async function inboxBroadcast(
  sessionId: string,
  from: string,
  content: string,
): Promise<Message[]> {
  return invoke<Message[]>("inbox_broadcast", { sessionId, from, content });
}

/**
 * Broadcast a text message to specific workers
 */
export async function inboxBroadcastTo(
  sessionId: string,
  from: string,
  content: string,
  targets: string[],
): Promise<Message[]> {
  return invoke<Message[]>("inbox_broadcast_to", {
    sessionId,
    from,
    content,
    targets,
  });
}

/**
 * Read messages for a worker
 */
export async function inboxRead(
  sessionId: string,
  workerId: string,
  unreadOnly?: boolean,
): Promise<Message[]> {
  return invoke<Message[]>("inbox_read", { sessionId, workerId, unreadOnly });
}

/**
 * Mark specific messages as read
 */
export async function inboxMarkRead(
  sessionId: string,
  workerId: string,
  messageIds: string[],
): Promise<void> {
  return invoke<void>("inbox_mark_read", { sessionId, workerId, messageIds });
}

/**
 * Mark all messages as read
 */
export async function inboxMarkAllRead(
  sessionId: string,
  workerId: string,
): Promise<void> {
  return invoke<void>("inbox_mark_all_read", { sessionId, workerId });
}

/**
 * Send a structured message (shutdown, task_completed, etc.)
 */
export async function inboxSendStructured(
  sessionId: string,
  from: string,
  to: string,
  message: MessageType,
): Promise<Message> {
  return invoke<Message>("inbox_send_structured", {
    sessionId,
    from,
    to,
    message,
  });
}

/**
 * Get unread message count for a worker
 */
export async function inboxCount(
  sessionId: string,
  workerId: string,
  unreadOnly?: boolean,
): Promise<number> {
  return invoke<number>("inbox_count", { sessionId, workerId, unreadOnly });
}

/**
 * Get all registered workers in the session
 */
export async function inboxGetWorkers(sessionId: string): Promise<string[]> {
  return invoke<string[]>("inbox_get_workers", { sessionId });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Request shutdown from team leader
 */
export async function requestShutdown(
  sessionId: string,
  workerId: string,
  leaderId: string,
  reason: string,
): Promise<Message> {
  const requestId = `shutdown-${Date.now()}`;
  return inboxSendStructured(sessionId, workerId, leaderId, {
    type: "shutdown_request",
    requestId,
    reason,
  });
}

/**
 * Approve a shutdown request
 */
export async function approveShutdown(
  sessionId: string,
  leaderId: string,
  workerId: string,
  requestId: string,
): Promise<Message> {
  return inboxSendStructured(sessionId, leaderId, workerId, {
    type: "shutdown_approved",
    requestId,
  });
}

/**
 * Reject a shutdown request
 */
export async function rejectShutdown(
  sessionId: string,
  leaderId: string,
  workerId: string,
  requestId: string,
  reason: string,
): Promise<Message> {
  return inboxSendStructured(sessionId, leaderId, workerId, {
    type: "shutdown_rejected",
    requestId,
    reason,
  });
}

/**
 * Notify that a task was completed
 */
export async function notifyTaskCompleted(
  sessionId: string,
  workerId: string,
  targetId: string,
  taskId: string,
  taskSubject: string,
): Promise<Message> {
  return inboxSendStructured(sessionId, workerId, targetId, {
    type: "task_completed",
    taskId,
    taskSubject,
  });
}

/**
 * Broadcast idle status to team
 */
export async function broadcastIdle(
  sessionId: string,
  workerId: string,
  completedTaskId?: string,
): Promise<Message[]> {
  const workers = await inboxGetWorkers(sessionId);
  const targets = workers.filter((w) => w !== workerId);

  const messages: Message[] = [];
  for (const target of targets) {
    const msg = await inboxSendStructured(sessionId, workerId, target, {
      type: "idle_notification",
      completedTaskId,
    });
    messages.push(msg);
  }

  return messages;
}

/**
 * Request plan approval
 */
export async function requestPlanApproval(
  sessionId: string,
  workerId: string,
  leaderId: string,
  planContent: string,
): Promise<Message> {
  const requestId = `plan-${Date.now()}`;
  return inboxSendStructured(sessionId, workerId, leaderId, {
    type: "plan_approval_request",
    requestId,
    planContent,
  });
}

/**
 * Poll for new messages (useful for agents checking inbox)
 */
export async function pollInbox(
  sessionId: string,
  workerId: string,
): Promise<Message[]> {
  const messages = await inboxRead(sessionId, workerId, true);
  if (messages.length > 0) {
    await inboxMarkRead(
      sessionId,
      workerId,
      messages.map((m) => m.id),
    );
  }
  return messages;
}
