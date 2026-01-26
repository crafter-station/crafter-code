import { create } from "zustand";

interface TerminalBuffer {
  id: string;
  lines: string[];
  maxLines: number;
}

interface TerminalState {
  buffers: Map<string, TerminalBuffer>;
  activeTerminalId: string | null;

  // Actions
  createBuffer: (id: string, maxLines?: number) => void;
  appendToBuffer: (id: string, data: string) => void;
  clearBuffer: (id: string) => void;
  removeBuffer: (id: string) => void;
  setActiveTerminal: (id: string | null) => void;
  getBuffer: (id: string) => TerminalBuffer | undefined;
}

const DEFAULT_MAX_LINES = 10000;

export const useTerminalStore = create<TerminalState>((set, get) => ({
  buffers: new Map(),
  activeTerminalId: null,

  createBuffer: (id, maxLines = DEFAULT_MAX_LINES) => {
    set((state) => {
      const newBuffers = new Map(state.buffers);
      newBuffers.set(id, { id, lines: [], maxLines });
      return { buffers: newBuffers };
    });
  },

  appendToBuffer: (id, data) => {
    set((state) => {
      const buffer = state.buffers.get(id);
      if (!buffer) return state;

      const newLines = [...buffer.lines, data];

      // Trim if exceeds max lines
      if (newLines.length > buffer.maxLines) {
        newLines.splice(0, newLines.length - buffer.maxLines);
      }

      const newBuffers = new Map(state.buffers);
      newBuffers.set(id, { ...buffer, lines: newLines });
      return { buffers: newBuffers };
    });
  },

  clearBuffer: (id) => {
    set((state) => {
      const buffer = state.buffers.get(id);
      if (!buffer) return state;

      const newBuffers = new Map(state.buffers);
      newBuffers.set(id, { ...buffer, lines: [] });
      return { buffers: newBuffers };
    });
  },

  removeBuffer: (id) => {
    set((state) => {
      const newBuffers = new Map(state.buffers);
      newBuffers.delete(id);
      return { buffers: newBuffers };
    });
  },

  setActiveTerminal: (id) => {
    set({ activeTerminalId: id });
  },

  getBuffer: (id) => {
    return get().buffers.get(id);
  },
}));
