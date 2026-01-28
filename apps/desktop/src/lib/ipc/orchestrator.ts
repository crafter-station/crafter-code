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
  | { type: "error"; message: string }
  | {
      type: "plan";
      entries: Array<{
        content: string;
        priority: "high" | "medium" | "low";
        status: "pending" | "in_progress" | "completed";
      }>;
    };

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
    // Diff-specific fields
    path?: string;
    old_text?: string;
    new_text?: string;
    // Terminal-specific fields
    terminal_id?: string;
    output?: string;
    exit_code?: number;
  }>;
  // Raw input for special tool calls (e.g., plan for ExitPlanMode)
  raw_input?: Record<string, unknown>;
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
  return transformSession(response.session, agentId as AgentType, cwd);
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
    const { tool_call_id, title, kind, status, content, raw_input } = event.payload;
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
        // Diff-specific fields
        path: c.path,
        old_text: c.old_text,
        new_text: c.new_text,
        // Terminal-specific fields
        terminal_id: c.terminal_id,
        output: c.output,
        exit_code: c.exit_code,
      })),
      rawInput: raw_input,
      timestamp: Date.now(),
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

// Set the session mode (e.g., "plan", "normal")
// Uses the official ACP session/set_mode protocol method
export async function setAcpSessionMode(
  sessionId: string,
  modeId: string,
): Promise<void> {
  return invoke<void>("set_acp_session_mode", {
    sessionId,
    modeId,
  });
}

// Authenticate an ACP session with the specified method
export async function authenticateAcpSession(
  sessionId: string,
  methodId: string,
): Promise<void> {
  return invoke<void>("authenticate_acp_session", {
    sessionId,
    methodId,
  });
}

// ============================================================================
// Authentication Types and Events
// ============================================================================

export interface AuthMethod {
  method_id: string;
  name?: string;
  description?: string;
}

interface WorkerAuthenticatedEvent {
  worker_id: string;
  session_id: string;
  method_id: string;
}

// Listen for worker authenticated events
export function onWorkerAuthenticated(
  workerId: string,
  callback: (methodId: string) => void,
): Promise<UnlistenFn> {
  return listen<WorkerAuthenticatedEvent>(
    `worker-authenticated`,
    (event) => {
      if (event.payload.worker_id === workerId) {
        callback(event.payload.method_id);
      }
    },
  );
}

// ============================================================================
// Session Persistence Types and Commands
// ============================================================================

export interface PersistedMessage {
  role: string;
  content: string;
  timestamp: number;
}

export interface PersistedSession {
  id: string;
  acp_session_id: string;
  cwd: string;
  agent_id: string;
  created_at: number;
  updated_at: number;
  messages: PersistedMessage[];
  mode: string;
  initial_prompt: string;
}

export interface PersistedSessionSummary {
  id: string;
  acp_session_id: string;
  cwd: string;
  agent_id: string;
  created_at: number;
  updated_at: number;
  message_count: number;
  initial_prompt: string;
}

// List all persisted sessions
export async function listPersistedSessions(): Promise<PersistedSessionSummary[]> {
  return invoke<PersistedSessionSummary[]>("list_persisted_sessions");
}

// Get a specific persisted session
export async function getPersistedSession(
  sessionId: string,
): Promise<PersistedSession> {
  return invoke<PersistedSession>("get_persisted_session", { sessionId });
}

// Delete a persisted session
export async function deletePersistedSession(
  sessionId: string,
): Promise<void> {
  return invoke<void>("delete_persisted_session", { sessionId });
}

// Resume a persisted ACP session
export async function resumeAcpSession(
  persistedSessionId: string,
): Promise<OrchestratorSession> {
  const response = await invoke<SessionResponse>("resume_acp_session", {
    persistedSessionId,
  });
  return transformSession(response.session);
}

// Save session to persistence
export async function saveSessionToPersistence(
  sessionId: string,
  acpSessionId: string,
  cwd: string,
  agentId: string,
  initialPrompt: string,
  messages: PersistedMessage[],
  mode: string,
): Promise<void> {
  return invoke<void>("save_session_to_persistence", {
    sessionId,
    acpSessionId,
    cwd,
    agentId,
    initialPrompt,
    messages,
    mode,
  });
}

// Reconnect a dead worker (when send_acp_prompt fails with "No active worker")
export async function reconnectWorker(
  sessionId: string,
  agentId: string,
  cwd: string,
): Promise<void> {
  return invoke<void>("reconnect_worker", {
    sessionId,
    agentId,
    cwd,
  });
}

// Mode change event
interface WorkerModeChangeEvent {
  worker_id: string;
  mode_id: string;
}

// Listen for mode change events
export function onWorkerModeChange(
  workerId: string,
  callback: (modeId: string) => void,
): Promise<UnlistenFn> {
  return listen<WorkerModeChangeEvent>(`worker-mode-${workerId}`, (event) => {
    callback(event.payload.mode_id);
  });
}

// Available command from ACP agent
export interface AvailableCommand {
  name: string;
  description: string;
  input?: {
    Unstructured?: {
      hint?: string;
    };
  };
  meta?: Record<string, unknown>;
}

interface WorkerCommandsEvent {
  worker_id: string;
  commands: AvailableCommand[];
}

// Listen for available commands/skills from agent
export function onWorkerCommands(
  workerId: string,
  callback: (commands: AvailableCommand[]) => void,
): Promise<UnlistenFn> {
  return listen<WorkerCommandsEvent>(`worker-commands-${workerId}`, (event) => {
    callback(event.payload.commands);
  });
}

// ============================================================================
// Swarm Coordination Events
// ============================================================================

export interface SwarmActivityEvent {
  worker_id: string;
  session_id: string;
  command: string;
  result: {
    success: boolean;
    output: string;
    data?: unknown;
  };
  timestamp: number;
}

// Listen for swarm coordination activity (task/inbox commands from agents)
export function onSwarmActivity(
  callback: (event: SwarmActivityEvent) => void,
): Promise<UnlistenFn> {
  return listen<SwarmActivityEvent>("swarm-activity", (event) => {
    callback(event.payload);
  });
}

// Listen for swarm activity on a specific session
export function onSessionSwarmActivity(
  sessionId: string,
  callback: (event: SwarmActivityEvent) => void,
): Promise<UnlistenFn> {
  return listen<SwarmActivityEvent>("swarm-activity", (event) => {
    if (event.payload.session_id === sessionId) {
      callback(event.payload);
    }
  });
}

// Transform snake_case from backend to camelCase for frontend
function transformSession(
  session: RawOrchestratorSession,
  agentType: AgentType = "claude",
  cwd?: string,
): OrchestratorSession {
  return {
    id: session.id,
    prompt: session.prompt,
    status: session.status as OrchestratorSession["status"],
    mode: "normal", // Default to normal, can be changed via setAcpSessionMode
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
    cwd,
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
    availableCommands: [],
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
