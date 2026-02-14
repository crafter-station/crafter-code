import { create } from "zustand";

export interface BrowserTab {
  id: string;
  url: string;
  title?: string;
}

interface BrowserState {
  tabs: BrowserTab[];
  activeTabId: string | null;
  browserVisible: boolean;
  splitRatio: number;

  addTab: (tab: BrowserTab) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<BrowserTab>) => void;
  setBrowserVisible: (visible: boolean) => void;
  setSplitRatio: (ratio: number) => void;
}

export const useBrowserStore = create<BrowserState>((set) => ({
  tabs: [],
  activeTabId: null,
  browserVisible: false,
  splitRatio: 0.5,

  addTab: (tab) =>
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    })),

  removeTab: (id) =>
    set((state) => ({
      tabs: state.tabs.filter((t) => t.id !== id),
      activeTabId: state.activeTabId === id ? null : state.activeTabId,
    })),

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, updates) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  setBrowserVisible: (visible) => set({ browserVisible: visible }),

  setSplitRatio: (ratio) => set({ splitRatio: Math.max(0.2, Math.min(0.8, ratio)) }),
}));
