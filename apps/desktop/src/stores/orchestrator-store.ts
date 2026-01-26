import { create } from "zustand";
import { persist } from "zustand/middleware";

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

export interface WorkerSession {
  id: string;
  sessionId: string;
  task: string;
  status: WorkerStatus;
  model: Model;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  outputBuffer: string;
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
  workers: WorkerSession[];
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

interface OrchestratorState {
  sessions: OrchestratorSession[];
  activeSessionId: string | null;

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
    updates: Partial<WorkerSession>
  ) => void;
  appendWorkerOutput: (
    sessionId: string,
    workerId: string,
    data: string
  ) => void;
  getWorker: (
    sessionId: string,
    workerId: string
  ) => WorkerSession | undefined;

  // Computed
  getTotalCost: () => number;
  getCompletedWorkers: (sessionId: string) => number;
  getTotalWorkers: (sessionId: string) => number;
}

export const useOrchestratorStore = create<OrchestratorState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

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
            s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
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
                : worker
            );

            // Recalculate totals
            const totalInputTokens = updatedWorkers.reduce(
              (sum, w) => sum + w.inputTokens,
              0
            );
            const totalOutputTokens = updatedWorkers.reduce(
              (sum, w) => sum + w.outputTokens,
              0
            );
            const totalCost = updatedWorkers.reduce(
              (sum, w) => sum + w.costUsd,
              0
            );

            // Update session status based on worker statuses
            let status = session.status;
            const allCompleted = updatedWorkers.every(
              (w) => w.status === "completed"
            );
            const anyFailed = updatedWorkers.some((w) => w.status === "failed");
            const anyRunning = updatedWorkers.some(
              (w) => w.status === "running"
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
                  : worker
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
    }),
    {
      name: "crafter-code-orchestrator-store",
      partialize: (state) => ({
        sessions: state.sessions,
      }),
    }
  )
);
