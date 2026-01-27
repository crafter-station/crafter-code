import { create } from "zustand";
import { persist } from "zustand/middleware";

// Re-export ACP SDK types for protocol consistency
import type {
  ToolCall as AcpToolCall,
  ToolCallContent as AcpToolCallContent,
  ToolCallStatus as AcpToolCallStatus,
  ToolKind as AcpToolKind,
  PermissionOption as AcpPermissionOption,
  PermissionOptionKind as AcpPermissionOptionKind,
  Plan as AcpPlan,
  PlanEntry as AcpPlanEntry,
  PlanEntryPriority as AcpPlanEntryPriority,
  PlanEntryStatus as AcpPlanEntryStatus,
} from "@agentclientprotocol/sdk";

export type {
  AcpToolCall,
  AcpToolCallContent,
  AcpToolCallStatus,
  AcpToolKind,
  AcpPermissionOption,
  AcpPermissionOptionKind,
  AcpPlan,
  AcpPlanEntry,
  AcpPlanEntryPriority,
  AcpPlanEntryStatus,
};

// App-specific types (extend ACP where needed)
export type SessionStatus =
  | "planning"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkerStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type Model = "opus" | "sonnet" | "haiku";

export type AgentType = "claude" | "gemini" | "codex";

export type MessageType = "TOOL_USE" | "TEXT" | "ERROR" | "THINKING";

// Use SDK types directly
export type ToolCallKind = AcpToolKind;
export type ToolCallStatus = AcpToolCallStatus;

// Simplified ToolCall for UI display (subset of AcpToolCall)
export interface ToolCall {
  id: string;
  title: string;
  kind: ToolCallKind;
  status: ToolCallStatus;
  content?: ToolCallContent[];
  timestamp: number;
}

// Simplified content for UI display
export interface ToolCallContent {
  type: "text" | "code" | "error" | "content" | "diff" | "terminal" | "unknown";
  text?: string;
  code?: string;
  language?: string;
  message?: string;
  // Diff-specific fields
  path?: string;
  old_text?: string;
  new_text?: string;
}

export type MessageRole = "user" | "assistant";

export interface Message {
  id: string;
  type: MessageType;
  role: MessageRole;
  content: string;
  timestamp: number;
  toolName?: string;
  rendered?: boolean;
}

export interface WorkerSession {
  id: string;
  sessionId: string;
  task: string;
  status: WorkerStatus;
  model: Model;
  agentType: AgentType;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  outputBuffer: string;
  messages: Message[];
  toolCalls: ToolCall[];
  plan?: AcpPlan;
  planTimestamp?: number;
  filesTouched: string[];
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OrchestratorSession {
  id: string;
  prompt: string;
  status: SessionStatus;
  model: Model;
  agentType: AgentType;
  workers: WorkerSession[];
  messages: Message[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  createdAt: number;
  updatedAt: number;
  plan?: string;
}

export interface FileConflict {
  filePath: string;
  workerIds: string[];
}

export interface PermissionRequest {
  workerId: string;
  sessionId: string;
  title: string;
  toolCallId: string;
  options: Array<{
    id: string;
    name: string;
    kind: AcpPermissionOptionKind;
  }>;
  timestamp: number;
}

interface OrchestratorState {
  sessions: OrchestratorSession[];
  activeSessionId: string | null;
  permissionRequests: PermissionRequest[];

  // Actions
  setSession: (session: OrchestratorSession) => void;
  updateSession: (id: string, updates: Partial<OrchestratorSession>) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  getActiveSession: () => OrchestratorSession | undefined;
  getSession: (id: string) => OrchestratorSession | undefined;

  // Worker actions
  updateWorker: (
    sessionId: string,
    workerId: string,
    updates: Partial<WorkerSession>,
  ) => void;
  appendWorkerOutput: (
    sessionId: string,
    workerId: string,
    data: string,
  ) => void;
  getWorker: (sessionId: string, workerId: string) => WorkerSession | undefined;

  // Message actions
  addSessionMessage: (sessionId: string, message: Omit<Message, "id">) => void;
  addWorkerMessage: (
    sessionId: string,
    workerId: string,
    message: Omit<Message, "id">,
  ) => void;

  // Tool call actions
  updateWorkerToolCall: (
    sessionId: string,
    workerId: string,
    toolCall: ToolCall,
  ) => void;

  // Plan actions
  updateWorkerPlan: (
    sessionId: string,
    workerId: string,
    plan: AcpPlan,
  ) => void;

  // Permission actions
  addPermissionRequest: (request: PermissionRequest) => void;
  removePermissionRequest: (workerId: string, toolCallId: string) => void;
  getPermissionRequest: (workerId: string) => PermissionRequest | undefined;

  // Computed
  getTotalCost: () => number;
  getCompletedWorkers: (sessionId: string) => number;
  getTotalWorkers: (sessionId: string) => number;
  getAllWorkers: () => Array<WorkerSession & { sessionPrompt: string }>;
}

export const useOrchestratorStore = create<OrchestratorState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      permissionRequests: [],

      setSession: (session) => {
        set((state) => {
          const existing = state.sessions.findIndex((s) => s.id === session.id);
          if (existing >= 0) {
            const newSessions = [...state.sessions];
            newSessions[existing] = session;
            return { sessions: newSessions };
          }
          return {
            sessions: [session, ...state.sessions],
            activeSessionId: session.id,
          };
        });
      },

      updateSession: (id, updates) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s,
          ),
        }));
      },

      removeSession: (id) => {
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          activeSessionId:
            state.activeSessionId === id ? null : state.activeSessionId,
        }));
      },

      setActiveSession: (id) => {
        set({ activeSessionId: id });
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find((s) => s.id === activeSessionId);
      },

      getSession: (id) => {
        return get().sessions.find((s) => s.id === id);
      },

      updateWorker: (sessionId, workerId, updates) => {
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id !== sessionId) return session;

            const updatedWorkers = session.workers.map((worker) =>
              worker.id === workerId
                ? { ...worker, ...updates, updatedAt: Date.now() }
                : worker,
            );

            // Recalculate totals
            const totalInputTokens = updatedWorkers.reduce(
              (sum, w) => sum + w.inputTokens,
              0,
            );
            const totalOutputTokens = updatedWorkers.reduce(
              (sum, w) => sum + w.outputTokens,
              0,
            );
            const totalCost = updatedWorkers.reduce(
              (sum, w) => sum + w.costUsd,
              0,
            );

            // Update session status based on worker statuses
            let status = session.status;
            const allCompleted = updatedWorkers.every(
              (w) => w.status === "completed",
            );
            const anyFailed = updatedWorkers.some((w) => w.status === "failed");
            const anyRunning = updatedWorkers.some(
              (w) => w.status === "running",
            );

            if (anyFailed) {
              status = "failed";
            } else if (allCompleted && updatedWorkers.length > 0) {
              status = "completed";
            } else if (anyRunning) {
              status = "running";
            }

            return {
              ...session,
              workers: updatedWorkers,
              totalInputTokens,
              totalOutputTokens,
              totalCost,
              status,
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      appendWorkerOutput: (sessionId, workerId, data) => {
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id !== sessionId) return session;

            return {
              ...session,
              workers: session.workers.map((worker) =>
                worker.id === workerId
                  ? {
                      ...worker,
                      outputBuffer: worker.outputBuffer + data,
                      updatedAt: Date.now(),
                    }
                  : worker,
              ),
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      getWorker: (sessionId, workerId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        return session?.workers.find((w) => w.id === workerId);
      },

      addSessionMessage: (sessionId, message) => {
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id !== sessionId) return session;
            const newMessage: Message = {
              ...message,
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            };
            return {
              ...session,
              messages: [...(session.messages || []), newMessage],
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      addWorkerMessage: (sessionId, workerId, message) => {
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id !== sessionId) return session;
            const newMessage: Message = {
              ...message,
              id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            };
            return {
              ...session,
              workers: session.workers.map((worker) =>
                worker.id === workerId
                  ? {
                      ...worker,
                      messages: [...(worker.messages || []), newMessage],
                      updatedAt: Date.now(),
                    }
                  : worker,
              ),
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      updateWorkerToolCall: (sessionId, workerId, toolCall) => {
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id !== sessionId) return session;
            return {
              ...session,
              workers: session.workers.map((worker) => {
                if (worker.id !== workerId) return worker;
                const existingIndex = worker.toolCalls.findIndex(
                  (tc) => tc.id === toolCall.id,
                );
                const updatedToolCalls =
                  existingIndex >= 0
                    ? worker.toolCalls.map((tc, i) =>
                        i === existingIndex
                          ? { ...toolCall, timestamp: tc.timestamp } // Preserve original timestamp
                          : tc,
                      )
                    : [...(worker.toolCalls || []), toolCall];
                return {
                  ...worker,
                  toolCalls: updatedToolCalls,
                  updatedAt: Date.now(),
                };
              }),
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      updateWorkerPlan: (sessionId, workerId, plan) => {
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id !== sessionId) return session;
            return {
              ...session,
              workers: session.workers.map((worker) => {
                if (worker.id !== workerId) return worker;
                return {
                  ...worker,
                  plan,
                  planTimestamp: worker.planTimestamp ?? Date.now(), // Preserve original timestamp
                  updatedAt: Date.now(),
                };
              }),
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      addPermissionRequest: (request) => {
        set((state) => ({
          permissionRequests: [...state.permissionRequests, request],
        }));
      },

      removePermissionRequest: (workerId, toolCallId) => {
        set((state) => ({
          permissionRequests: state.permissionRequests.filter(
            (r) => !(r.workerId === workerId && r.toolCallId === toolCallId),
          ),
        }));
      },

      getPermissionRequest: (workerId) => {
        return get().permissionRequests.find((r) => r.workerId === workerId);
      },

      getTotalCost: () => {
        return get().sessions.reduce((sum, s) => sum + s.totalCost, 0);
      },

      getCompletedWorkers: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        if (!session) return 0;
        return session.workers.filter((w) => w.status === "completed").length;
      },

      getTotalWorkers: (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId);
        return session?.workers.length ?? 0;
      },

      getAllWorkers: () => {
        const { sessions } = get();
        return sessions.flatMap((session) =>
          session.workers.map((worker) => ({
            ...worker,
            sessionPrompt: session.prompt,
          })),
        );
      },
    }),
    {
      name: "crafter-code-orchestrator-store",
      partialize: (state) => ({
        sessions: state.sessions,
      }),
    },
  ),
);
