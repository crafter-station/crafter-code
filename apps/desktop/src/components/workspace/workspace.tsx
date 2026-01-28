"use client";

import { OrchestratorLayout } from "@/components/orchestrator/orchestrator-layout";
import { useTerminalEvents } from "@/hooks/use-terminal-events";

export function Workspace() {
  // Hook to track ACP terminal events globally
  useTerminalEvents();

  return <OrchestratorLayout />;
}
