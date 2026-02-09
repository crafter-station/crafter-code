import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings-store";

export function useGlobalShortcuts() {
  const toggleSettings = useSettingsStore((state) => state.toggleSettings);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        toggleSettings();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSettings]);
}
