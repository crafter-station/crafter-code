import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SessionStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentSession {
  id: string;
  prompt: string;
  status: SessionStatus;
  iteration: number;
  maxIterations: number;
  tokensUsed: number;
  costUsd: number;
  createdAt: number;
  updatedAt: number;
  terminalId?: string;
}

interface AgentState {
  sessions: AgentSession[];
  activeSessionId: string | null;
  projectPath: string | null;

  // Actions
  createSession: (prompt: string, maxIterations?: number) => AgentSession;
  updateSession: (id: string, updates: Partial<AgentSession>) => void;
  setActiveSession: (id: string | null) => void;
  setProjectPath: (path: string) => void;
  getActiveSession: () => AgentSession | undefined;
  getTotalCost: () => number;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      projectPath: null,

      createSession: (prompt, maxIterations = 10) => {
        const now = Date.now();
        const session: AgentSession = {
          id: crypto.randomUUID(),
          prompt,
          status: "pending",
          iteration: 0,
          maxIterations,
          tokensUsed: 0,
          costUsd: 0,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          sessions: [session, ...state.sessions],
          activeSessionId: session.id,
        }));

        return session;
      },

      updateSession: (id, updates) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s,
          ),
        }));
      },

      setActiveSession: (id) => {
        set({ activeSessionId: id });
      },

      setProjectPath: (path) => {
        set({ projectPath: path });
      },

      getActiveSession: () => {
        const { sessions, activeSessionId } = get();
        return sessions.find((s) => s.id === activeSessionId);
      },

      getTotalCost: () => {
        return get().sessions.reduce((sum, s) => sum + s.costUsd, 0);
      },
    }),
    {
      name: "crafter-code-agent-store",
      partialize: (state) => ({
        sessions: state.sessions,
        projectPath: state.projectPath,
      }),
    },
  ),
);
