import { create } from "zustand";
import type { AgentTrace, TraceSummary } from "@/lib/ipc/traces";
import {
  getFileTraces,
  getSessionTraces,
  getWorkerTraces,
  getTraceSummary,
} from "@/lib/ipc/traces";

interface TraceState {
  fileTraces: Record<string, AgentTrace[]>;
  sessionTraces: Record<string, AgentTrace[]>;
  summary: TraceSummary | null;
  loading: boolean;

  fetchFileTraces: (cwd: string, filePath: string) => Promise<void>;
  fetchSessionTraces: (cwd: string, sessionId: string) => Promise<void>;
  fetchWorkerTraces: (cwd: string, workerId: string) => Promise<AgentTrace[]>;
  fetchSummary: (cwd: string) => Promise<void>;
  clearTraces: () => void;
}

export const useTraceStore = create<TraceState>((set, get) => ({
  fileTraces: {},
  sessionTraces: {},
  summary: null,
  loading: false,

  fetchFileTraces: async (cwd: string, filePath: string) => {
    set({ loading: true });
    try {
      const traces = await getFileTraces(cwd, filePath);
      set((state) => ({
        fileTraces: { ...state.fileTraces, [filePath]: traces },
        loading: false,
      }));
    } catch {
      set({ loading: false });
    }
  },

  fetchSessionTraces: async (cwd: string, sessionId: string) => {
    set({ loading: true });
    try {
      const traces = await getSessionTraces(cwd, sessionId);
      set((state) => ({
        sessionTraces: { ...state.sessionTraces, [sessionId]: traces },
        loading: false,
      }));
    } catch {
      set({ loading: false });
    }
  },

  fetchWorkerTraces: async (cwd: string, workerId: string) => {
    const traces = await getWorkerTraces(cwd, workerId);
    return traces;
  },

  fetchSummary: async (cwd: string) => {
    try {
      const summary = await getTraceSummary(cwd);
      set({ summary });
    } catch {
      // ignore
    }
  },

  clearTraces: () => {
    set({ fileTraces: {}, sessionTraces: {}, summary: null });
  },
}));
