import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "system";

interface SettingsState {
  theme: Theme;
  settingsOpen: boolean;

  setTheme: (theme: Theme) => void;
  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      settingsOpen: false,

      setTheme: (theme) => set({ theme }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
    }),
    {
      name: "crafter-code-settings",
      partialize: (state) => ({
        theme: state.theme,
      }),
    }
  )
);
