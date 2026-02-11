import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { useOrchestratorStore } from "@/stores/orchestrator-store";

export function useGlobalShortcuts() {
  const toggleSettings = useSettingsStore((state) => state.toggleSettings);
  const toggleView = useOrchestratorStore((state) => state.toggleView);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        toggleSettings();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        toggleView();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSettings, toggleView]);
}
