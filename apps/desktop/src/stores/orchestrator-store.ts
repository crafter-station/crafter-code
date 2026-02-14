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

// Session modes from claude-code-acp
export type SessionMode = "default" | "acceptEdits" | "plan" | "dontAsk" | "bypassPermissions";

// Session types: single agent, fleet of agents, or Ralph (PRD-driven)
export type SessionType = "single" | "fleet" | "ralph";

export type WorkerStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

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
  // Raw input for special tool calls (e.g., plan for ExitPlanMode)
  rawInput?: Record<string, unknown>;
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
  // Terminal-specific fields
  terminal_id?: string;
  output?: string;
  exit_code?: number;
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

/**
 * Available command/skill from ACP agent
 */
export interface AvailableCommand {
  name: string;
  description: string;
  source?: "user" | "project" | "builtin";
  /** Type: "command" uses /name, "skill" uses @name */
  type?: "command" | "skill";
  input?: {
    hint?: string;
  };
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
  thinkingBuffer: string;
  messages: Message[];
  toolCalls: ToolCall[];
  availableCommands: AvailableCommand[];
  plan?: AcpPlan;
  planTimestamp?: number;
  filesTouched: string[];
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  endedAt?: number;
  taskId?: string;
  worktreeId?: string;
}

export interface OrchestratorSession {
  id: string;
  prompt: string;
  status: SessionStatus;
  /** Session mode: default, acceptEdits, plan, dontAsk, or bypassPermissions */
  mode: SessionMode;
  /** Session type: single, fleet, or ralph (PRD-driven) */
  sessionType: SessionType;
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
  /** Working directory for this session */
  cwd?: string;
  /** ACP session ID for resuming (from the agent) */
  acpSessionId?: string;
  /** PRD session ID for Ralph mode */
  prdSessionId?: string;
  /** Worktree ID this session is bound to */
  worktreeId?: string;
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

export type ActiveView = "sessions" | "dashboard" | "workspace";

interface OrchestratorState {
  sessions: OrchestratorSession[];
  activeSessionId: string | null;
  activeView: ActiveView;
  permissionRequests: PermissionRequest[];
  pendingInput: { sessionId: string; text: string } | null;
  /** Workspace-wide commands and skills (loaded by sidebar, shared across inputs) */
  workspaceCommands: AvailableCommand[];

  // View actions
  setActiveView: (view: ActiveView) => void;
  toggleView: () => void;

  // Actions
  setPendingInput: (sessionId: string, text: string) => void;
  clearPendingInput: () => void;
  setWorkspaceCommands: (commands: AvailableCommand[]) => void;
  setSession: (session: OrchestratorSession) => void;
  updateSession: (id: string, updates: Partial<OrchestratorSession>) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  getActiveSession: () => OrchestratorSession | undefined;
  getSession: (id: string) => OrchestratorSession | undefined;

  // Worker actions
  addWorkerToSession: (sessionId: string, worker: WorkerSession) => void;
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
  appendWorkerThinking: (
    sessionId: string,
    workerId: string,
    text: string,
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

  // Available commands actions
  updateWorkerCommands: (
    sessionId: string,
    workerId: string,
    commands: AvailableCommand[],
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
      activeView: "sessions" as ActiveView,
      permissionRequests: [],
      pendingInput: null,
      workspaceCommands: [],

      setActiveView: (view) => set({ activeView: view }),
      toggleView: () =>
        set((state) => ({
          activeView:
            state.activeView === "sessions"
              ? "workspace"
              : state.activeView === "workspace"
                ? "dashboard"
                : "sessions",
        })),

      setPendingInput: (sessionId, text) => set({ pendingInput: { sessionId, text } }),
      clearPendingInput: () => set({ pendingInput: null }),
      setWorkspaceCommands: (commands) => set({ workspaceCommands: commands }),

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

      addWorkerToSession: (sessionId, worker) => {
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id !== sessionId) return session;
            // Don't add if worker already exists
            if (session.workers.some((w) => w.id === worker.id)) return session;
            return {
              ...session,
              workers: [...session.workers, worker],
              updatedAt: Date.now(),
            };
          }),
        }));
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

      appendWorkerThinking: (sessionId, workerId, text) => {
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id !== sessionId) return session;
            return {
              ...session,
              workers: session.workers.map((worker) => {
                if (worker.id !== workerId) return worker;
                const messages = worker.messages || [];
                const lastMessage = messages[messages.length - 1];
                // Only append if the LAST message is THINKING AND no delta streaming has started
                // (delta goes to outputBuffer, so if outputBuffer has content, thinking round is over)
                if (lastMessage?.type === "THINKING" && !worker.outputBuffer) {
                  // Append to existing thinking message
                  const updatedMessages = [...messages];
                  updatedMessages[messages.length - 1] = {
                    ...lastMessage,
                    content: lastMessage.content + text,
                  };
                  return {
                    ...worker,
                    messages: updatedMessages,
                    updatedAt: Date.now(),
                  };
                }
                // Create new thinking message
                const newMessage: Message = {
                  id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                  type: "THINKING",
                  role: "assistant",
                  content: text,
                  timestamp: Date.now(),
                };
                return {
                  ...worker,
                  messages: [...messages, newMessage],
                  updatedAt: Date.now(),
                };
              }),
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
                    ? worker.toolCalls.map((tc, i) => {
                        if (i !== existingIndex) return tc;
                        // MERGE updates instead of replacing - preserve existing values
                        return {
                          ...tc, // Keep existing values
                          // Only update fields that are provided and non-empty
                          ...(toolCall.title && { title: toolCall.title }),
                          ...(toolCall.kind && { kind: toolCall.kind }),
                          ...(toolCall.status && { status: toolCall.status }),
                          // Only update content if new content is provided and non-empty
                          ...(toolCall.content && toolCall.content.length > 0 && { content: toolCall.content }),
                          // Update rawInput if provided (for plan mode, etc.)
                          ...(toolCall.rawInput && { rawInput: toolCall.rawInput }),
                        };
                      })
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

      updateWorkerCommands: (sessionId, workerId, commands) => {
        set((state) => ({
          sessions: state.sessions.map((session) => {
            if (session.id !== sessionId) return session;
            return {
              ...session,
              workers: session.workers.map((worker) => {
                if (worker.id !== workerId) return worker;
                return {
                  ...worker,
                  availableCommands: commands,
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
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<OrchestratorState> | undefined;
        if (!persistedState?.sessions) return current;
        const safeSessions = persistedState.sessions.map((s) => ({
          ...s,
          workers: (s.workers || []).map((w) => ({
            ...w,
            messages: w.messages || [],
            toolCalls: w.toolCalls || [],
            availableCommands: w.availableCommands || [],
            filesTouched: w.filesTouched || [],
            outputBuffer: w.outputBuffer || "",
            thinkingBuffer: w.thinkingBuffer || "",
            inputTokens: w.inputTokens || 0,
            outputTokens: w.outputTokens || 0,
            costUsd: w.costUsd || 0,
          })),
          messages: s.messages || [],
          totalInputTokens: s.totalInputTokens || 0,
          totalOutputTokens: s.totalOutputTokens || 0,
          totalCost: s.totalCost || 0,
        }));
        return { ...current, sessions: safeSessions };
      },
    },
  ),
);

// Debounced disk persistence (saves to ~/.crafter-code/orchestrator-state.json)
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSaveToDisk() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const { saveOrchestratorState } = await import("@/lib/ipc/orchestrator");
      await saveOrchestratorState();
    } catch (e) {
      console.error("[OrchestratorStore] Failed to save to disk:", e);
    }
  }, 2000);
}

let prevSessionsRef = useOrchestratorStore.getState().sessions;

useOrchestratorStore.subscribe((state) => {
  if (state.sessions !== prevSessionsRef) {
    prevSessionsRef = state.sessions;
    debouncedSaveToDisk();
  }
});

export async function initOrchestratorFromDisk() {
  try {
    const { loadOrchestratorState } = await import("@/lib/ipc/orchestrator");
    const sessions = await loadOrchestratorState();
    if (sessions.length > 0) {
      const store = useOrchestratorStore.getState();
      if (store.sessions.length === 0) {
        for (const session of sessions) {
          store.setSession(session);
        }
        console.log(
          `[OrchestratorStore] Restored ${sessions.length} sessions from disk`,
        );
      }
    }
  } catch (e) {
    console.error("[OrchestratorStore] Failed to load from disk:", e);
  }
}
