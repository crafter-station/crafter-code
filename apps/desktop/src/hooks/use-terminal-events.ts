"use client";

import { useEffect } from "react";
import {
  onTerminalCreated,
  onTerminalOutput,
  onTerminalExited,
  onTerminalKilled,
  onTerminalReleased,
} from "@/lib/ipc/terminals";
import {
  useWorkspaceStore,
  detectServerCommand,
  extractPort,
} from "@/stores/workspace-store";

/**
 * Hook to listen for ACP terminal events and update the workspace store
 * Should be called once in the root layout/component
 */
export function useTerminalEvents() {
  const {
    addTerminal,
    updateTerminal,
    removeTerminal,
  } = useWorkspaceStore();

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    // Listen for terminal created
    onTerminalCreated((event) => {
      console.log("[Terminal] Created:", event);

      // Detect if this looks like a server command
      const isServer = detectServerCommand(event.command, event.args);

      addTerminal({
        id: event.terminal_id,
        sessionId: event.session_id,
        command: event.command,
        args: event.args,
        cwd: event.cwd,
        running: event.running,
        port: undefined, // Will be detected from output
      });

      if (isServer) {
        console.log("[Terminal] Detected server command");
      }
    }).then((unlisten) => unlisteners.push(unlisten));

    // Listen for terminal output
    onTerminalOutput((event) => {
      // Try to detect port from output
      const port = extractPort(event.output);

      updateTerminal(event.terminal_id, {
        running: event.running,
        exitCode: event.exit_code,
        outputPreview: event.output.slice(-200), // Keep last 200 chars
        ...(port && { port }),
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    // Listen for terminal exited
    onTerminalExited((event) => {
      console.log("[Terminal] Exited:", event);
      updateTerminal(event.terminal_id, {
        running: false,
        exitCode: event.exit_code,
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    // Listen for terminal killed
    onTerminalKilled((event) => {
      console.log("[Terminal] Killed:", event);
      updateTerminal(event.terminal_id, {
        running: false,
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    // Listen for terminal released
    onTerminalReleased((event) => {
      console.log("[Terminal] Released:", event);
      // Remove from tracking when released
      removeTerminal(event.terminal_id);
    }).then((unlisten) => unlisteners.push(unlisten));

    // Cleanup
    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [addTerminal, updateTerminal, removeTerminal]);
}
