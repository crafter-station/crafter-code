import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { PermissionOptionKind } from "@agentclientprotocol/sdk";

import type {
  AgentType,
  FileConflict,
  OrchestratorSession,
  ToolCall,
  ToolCallKind,
  ToolCallStatus,
  WorkerSession,
} from "@/stores/orchestrator-store";

// Raw types from backend (snake_case)
interface RawWorkerSession {
  id: string;
  session_id: string;
  task: string;
  status: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  output_buffer: string;
  files_touched: string[];
  error_message?: string;
  created_at: number;
  updated_at: number;
}

interface RawOrchestratorSession {
  id: string;
  prompt: string;
  status: string;
  model: string;
  workers: RawWorkerSession[];
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  created_at: number;
  updated_at: number;
  plan?: string;
}

interface SessionResponse {
  session: RawOrchestratorSession;
}

interface WorkerResponse {
  worker: RawWorkerSession;
}

interface WorkerStreamEvent {
  worker_id: string;
  event: WorkerEventType;
}

type WorkerEventType =
  | { type: "delta"; text: string }
  | { type: "thinking"; text: string }
  | {
      type: "complete";
      output: string;
      usage: { input_tokens: number; output_tokens: number };
    }
  | { type: "error"; message: string };

interface WorkerStatusChangeEvent {
  session_id: string;
  worker_id: string;
  status: string;
  cost?: number;
  error?: string;
}

interface RawFileConflict {
  file_path: string;
  worker_ids: string[];
}

// ACP Agent types
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  available: boolean;
  env_vars: string[];
}

interface WorkerToolCallEvent {
  worker_id: string;
  tool_call_id: string;
  title: string;
  kind: string;
  status: string;
  content?: Array<{
    type: string;
    text?: string;
    code?: string;
    language?: string;
    message?: string;
  }>;
}

// Permission request types (aligned with ACP SDK)
export interface PermissionOption {
  id: string;
  name: string;
  kind: PermissionOptionKind;
}

interface WorkerPermissionEvent {
  worker_id: string;
  title: string;
  tool_call_id: string;
  options: PermissionOption[];
}

// Create a new orchestrator session
export async function createOrchestratorSession(
  prompt: string,
  model?: string,
): Promise<OrchestratorSession> {
  const response = await invoke<SessionResponse>(
    "create_orchestrator_session",
    {
      prompt,
      model,
    },
  );
  return transformSession(response.session);
}

// Get a specific session
export async function getOrchestratorSession(
  sessionId: string,
): Promise<OrchestratorSession> {
  const response = await invoke<SessionResponse>("get_orchestrator_session", {
    sessionId,
  });
  return transformSession(response.session);
}

// List all sessions
export async function listOrchestratorSessions(): Promise<
  OrchestratorSession[]
> {
  const sessions = await invoke<RawOrchestratorSession[]>(
    "list_orchestrator_sessions",
  );
  return sessions.map((s) => transformSession(s));
}

// Cancel a specific worker
export async function cancelWorker(
  sessionId: string,
  workerId: string,
): Promise<void> {
  return invoke<void>("cancel_worker", { sessionId, workerId });
}

// Retry a failed worker
export async function retryWorker(
  sessionId: string,
  workerId: string,
): Promise<WorkerSession> {
  const response = await invoke<WorkerResponse>("retry_worker", {
    sessionId,
    workerId,
  });
  return transformWorker(response.worker);
}

// Get file conflicts for a session
export async function getSessionConflicts(
  sessionId: string,
): Promise<FileConflict[]> {
  const conflicts = await invoke<RawFileConflict[]>("get_session_conflicts", {
    sessionId,
  });
  return conflicts.map((c) => ({
    filePath: c.file_path,
    workerIds: c.worker_ids,
  }));
}

// Get total cost for a session
export async function getSessionCost(sessionId: string): Promise<number> {
  return invoke<number>("get_session_cost", { sessionId });
}

// ============================================================================
// ACP Commands
// ============================================================================

// List available CLI agents on the system
export async function listAvailableAgents(): Promise<AgentConfig[]> {
  return invoke<AgentConfig[]>("list_available_agents");
}

// Create a new ACP-based session (uses CLI agent instead of direct API)
export async function createAcpSession(
  prompt: string,
  agentId: string,
  cwd: string,
): Promise<OrchestratorSession> {
  const response = await invoke<SessionResponse>("create_acp_session", {
    prompt,
    agentId,
    cwd,
  });
  return transformSession(response.session, agentId as AgentType);
}

// Send a follow-up prompt to an existing ACP session
export async function sendAcpPrompt(
  sessionId: string,
  prompt: string,
): Promise<void> {
  return invoke<void>("send_acp_prompt", {
    sessionId,
    prompt,
  });
}

// Listen for worker stream events (deltas, complete, error)
export function onWorkerStream(
  workerId: string,
  callback: (event: WorkerEventType) => void,
): Promise<UnlistenFn> {
  return listen<WorkerStreamEvent>(`worker-stream-${workerId}`, (event) => {
    callback(event.payload.event);
  });
}

// Listen for worker status changes
export function onWorkerStatusChange(
  callback: (event: WorkerStatusChangeEvent) => void,
): Promise<UnlistenFn> {
  return listen<WorkerStatusChangeEvent>("worker-status-change", (event) => {
    callback(event.payload);
  });
}

// Listen for session creation events
export function onSessionCreated(
  callback: (event: {
    session_id: string;
    status: string;
    agent?: string;
  }) => void,
): Promise<UnlistenFn> {
  return listen<{ session_id: string; status: string; agent?: string }>(
    "orchestrator-session-created",
    (event) => {
      callback(event.payload);
    },
  );
}

// Listen for worker tool call events (ACP-specific)
export function onWorkerToolCall(
  workerId: string,
  callback: (toolCall: ToolCall) => void,
): Promise<UnlistenFn> {
  return listen<WorkerToolCallEvent>(`worker-tool-${workerId}`, (event) => {
    const { tool_call_id, title, kind, status, content } = event.payload;
    callback({
      id: tool_call_id,
      title,
      kind: kind as ToolCallKind,
      status: status as ToolCallStatus,
      content: content?.map((c) => ({
        type: c.type as "text" | "code" | "error" | "content" | "diff" | "terminal",
        text: c.text,
        code: c.code,
        language: c.language,
        message: c.message,
      })),
    });
  });
}

// Listen for permission request events
export function onWorkerPermission(
  workerId: string,
  callback: (event: {
    title: string;
    toolCallId: string;
    options: PermissionOption[];
  }) => void,
): Promise<UnlistenFn> {
  return listen<WorkerPermissionEvent>(`worker-permission-${workerId}`, (event) => {
    callback({
      title: event.payload.title,
      toolCallId: event.payload.tool_call_id,
      options: event.payload.options,
    });
  });
}

// Respond to a permission request
export async function respondToPermission(
  workerId: string,
  optionId: string,
): Promise<void> {
  return invoke<void>("respond_to_permission", {
    workerId,
    optionId,
  });
}

// Transform snake_case from backend to camelCase for frontend
function transformSession(
  session: RawOrchestratorSession,
  agentType: AgentType = "claude",
): OrchestratorSession {
  return {
    id: session.id,
    prompt: session.prompt,
    status: session.status as OrchestratorSession["status"],
    model: transformModel(session.model),
    agentType,
    workers: session.workers?.map((w) => transformWorker(w, agentType)) ?? [],
    messages: [],
    totalInputTokens: session.total_input_tokens ?? 0,
    totalOutputTokens: session.total_output_tokens ?? 0,
    totalCost: session.total_cost ?? 0,
    createdAt: session.created_at ?? Date.now(),
    updatedAt: session.updated_at ?? Date.now(),
    plan: session.plan,
  };
}

function transformWorker(
  worker: RawWorkerSession,
  agentType: AgentType = "claude",
): WorkerSession {
  return {
    id: worker.id,
    sessionId: worker.session_id,
    task: worker.task,
    status: worker.status as WorkerSession["status"],
    model: transformModel(worker.model),
    agentType,
    inputTokens: worker.input_tokens ?? 0,
    outputTokens: worker.output_tokens ?? 0,
    costUsd: worker.cost_usd ?? 0,
    outputBuffer: worker.output_buffer ?? "",
    messages: [],
    toolCalls: [],
    filesTouched: worker.files_touched ?? [],
    errorMessage: worker.error_message,
    createdAt: worker.created_at ?? Date.now(),
    updatedAt: worker.updated_at ?? Date.now(),
  };
}

function transformModel(model: string): "opus" | "sonnet" | "haiku" {
  if (typeof model === "string") {
    const lower = model.toLowerCase();
    if (lower.includes("opus")) return "opus";
    if (lower.includes("haiku")) return "haiku";
  }
  return "sonnet";
}
