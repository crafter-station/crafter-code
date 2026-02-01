import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings-store";

export function useGlobalShortcuts() {
  const toggleSettings = useSettingsStore((state) => state.toggleSettings);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log("Key pressed:", e.key, "Meta:", e.metaKey);
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        console.log("Settings shortcut triggered");
        toggleSettings();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSettings]);
}
