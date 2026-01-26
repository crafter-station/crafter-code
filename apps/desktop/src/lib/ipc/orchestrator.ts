import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  OrchestratorSession,
  WorkerSession,
  FileConflict,
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
  | { type: "complete"; output: string; usage: { input_tokens: number; output_tokens: number } }
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

// Create a new orchestrator session
export async function createOrchestratorSession(
  prompt: string,
  model?: string
): Promise<OrchestratorSession> {
  const response = await invoke<SessionResponse>("create_orchestrator_session", {
    prompt,
    model,
  });
  return transformSession(response.session);
}

// Get a specific session
export async function getOrchestratorSession(
  sessionId: string
): Promise<OrchestratorSession> {
  const response = await invoke<SessionResponse>("get_orchestrator_session", {
    sessionId,
  });
  return transformSession(response.session);
}

// List all sessions
export async function listOrchestratorSessions(): Promise<OrchestratorSession[]> {
  const sessions = await invoke<RawOrchestratorSession[]>("list_orchestrator_sessions");
  return sessions.map(transformSession);
}

// Cancel a specific worker
export async function cancelWorker(
  sessionId: string,
  workerId: string
): Promise<void> {
  return invoke<void>("cancel_worker", { sessionId, workerId });
}

// Retry a failed worker
export async function retryWorker(
  sessionId: string,
  workerId: string
): Promise<WorkerSession> {
  const response = await invoke<WorkerResponse>("retry_worker", {
    sessionId,
    workerId,
  });
  return transformWorker(response.worker);
}

// Get file conflicts for a session
export async function getSessionConflicts(
  sessionId: string
): Promise<FileConflict[]> {
  const conflicts = await invoke<RawFileConflict[]>("get_session_conflicts", { sessionId });
  return conflicts.map((c) => ({
    filePath: c.file_path,
    workerIds: c.worker_ids,
  }));
}

// Get total cost for a session
export async function getSessionCost(sessionId: string): Promise<number> {
  return invoke<number>("get_session_cost", { sessionId });
}

// Listen for worker stream events (deltas, complete, error)
export function onWorkerStream(
  workerId: string,
  callback: (event: WorkerEventType) => void
): Promise<UnlistenFn> {
  return listen<WorkerStreamEvent>(`worker-stream-${workerId}`, (event) => {
    callback(event.payload.event);
  });
}

// Listen for worker status changes
export function onWorkerStatusChange(
  callback: (event: WorkerStatusChangeEvent) => void
): Promise<UnlistenFn> {
  return listen<WorkerStatusChangeEvent>("worker-status-change", (event) => {
    callback(event.payload);
  });
}

// Listen for session creation events
export function onSessionCreated(
  callback: (event: { session_id: string; status: string }) => void
): Promise<UnlistenFn> {
  return listen<{ session_id: string; status: string }>(
    "orchestrator-session-created",
    (event) => {
      callback(event.payload);
    }
  );
}

// Transform snake_case from backend to camelCase for frontend
function transformSession(session: RawOrchestratorSession): OrchestratorSession {
  return {
    id: session.id,
    prompt: session.prompt,
    status: session.status as OrchestratorSession["status"],
    model: transformModel(session.model),
    workers: session.workers?.map(transformWorker) ?? [],
    totalInputTokens: session.total_input_tokens ?? 0,
    totalOutputTokens: session.total_output_tokens ?? 0,
    totalCost: session.total_cost ?? 0,
    createdAt: session.created_at ?? Date.now(),
    updatedAt: session.updated_at ?? Date.now(),
    plan: session.plan,
  };
}

function transformWorker(worker: RawWorkerSession): WorkerSession {
  return {
    id: worker.id,
    sessionId: worker.session_id,
    task: worker.task,
    status: worker.status as WorkerSession["status"],
    model: transformModel(worker.model),
    inputTokens: worker.input_tokens ?? 0,
    outputTokens: worker.output_tokens ?? 0,
    costUsd: worker.cost_usd ?? 0,
    outputBuffer: worker.output_buffer ?? "",
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
