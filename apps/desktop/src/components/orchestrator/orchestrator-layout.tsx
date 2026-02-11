"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronRight, Settings, Wifi, X } from "lucide-react";

import { onWorkerStatusChange, onWorkerStream, onWorkerToolCall, onWorkerPermission, onWorkerCommands, onWorkerModeChange } from "@/lib/ipc/orchestrator";
import { cn } from "@/lib/utils";

import { useOrchestratorStore } from "@/stores/orchestrator-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import { AgentIcon } from "./agent-icons";
import { CoordinationPanel } from "./coordination-panel";
import { DashboardView } from "./dashboard-view";
import { GlobalSearch } from "./global-search";
import { OrchestratorSidebar } from "./orchestrator-sidebar";
import { SessionColumns } from "./session-columns";
import { ViewToggle } from "./view-toggle";
import { AuthProvider } from "@/components/auth/auth-provider";
import { LoginButton } from "@/components/auth/login-button";
import { SettingsDialog } from "@/components/settings/settings-dialog";

interface OrchestratorLayoutProps {
  className?: string;
}

export function OrchestratorLayout({ className }: OrchestratorLayoutProps) {
  const [showCoordinationPanel, setShowCoordinationPanel] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const toggleSettings = useSettingsStore((s) => s.toggleSettings);

  useGlobalShortcuts();

  useEffect(() => {
    import("@/stores/orchestrator-store").then(({ initOrchestratorFromDisk }) => {
      initOrchestratorFromDisk();
    });
  }, []);

  const sessions = useOrchestratorStore((s) => s.sessions);
  const activeSessionId = useOrchestratorStore((s) => s.activeSessionId);
  const activeView = useOrchestratorStore((s) => s.activeView);
  const setActiveSession = useOrchestratorStore((s) => s.setActiveSession);
  const removeSession = useOrchestratorStore((s) => s.removeSession);
  const updateSession = useOrchestratorStore((s) => s.updateSession);
  const updateWorker = useOrchestratorStore((s) => s.updateWorker);
  const addWorkerToSession = useOrchestratorStore((s) => s.addWorkerToSession);
  const appendWorkerOutput = useOrchestratorStore((s) => s.appendWorkerOutput);
  const addWorkerMessage = useOrchestratorStore((s) => s.addWorkerMessage);
  const appendWorkerThinking = useOrchestratorStore((s) => s.appendWorkerThinking);
  const updateWorkerToolCall = useOrchestratorStore((s) => s.updateWorkerToolCall);
  const updateWorkerPlan = useOrchestratorStore((s) => s.updateWorkerPlan);
  const updateWorkerCommands = useOrchestratorStore((s) => s.updateWorkerCommands);
  const addPermissionRequest = useOrchestratorStore((s) => s.addPermissionRequest);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Listen for worker status changes globally
  useEffect(() => {
    const unsubscribe = onWorkerStatusChange((event) => {
      // If reconnecting, add a new worker to the session first
      if (event.reconnecting) {
        addWorkerToSession(event.session_id, {
          id: event.worker_id,
          sessionId: event.session_id,
          task: "(reconnected)",
          status: "running",
          model: "opus",
          agentType: "claude",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          outputBuffer: "",
          thinkingBuffer: "",
          messages: [],
          toolCalls: [],
          availableCommands: [],
          filesTouched: [],
        });
      }

      updateWorker(event.session_id, event.worker_id, {
        status: event.status as
          | "pending"
          | "running"
          | "completed"
          | "failed"
          | "cancelled",
        costUsd: event.cost ?? 0,
        errorMessage: event.error,
      });

      // Only add error messages - completion is shown via status indicator
      if (event.status === "failed" && event.error) {
        addWorkerMessage(event.session_id, event.worker_id, {
          type: "ERROR",
          role: "assistant",
          content: event.error,
          timestamp: Date.now(),
        });
      }
    });

    return () => {
      unsubscribe.then((fn) => fn());
    };
  }, [updateWorker, addWorkerMessage, addWorkerToSession]);

  // Track subscribed workers to avoid unsubscribe/resubscribe on session updates
  const subscribedWorkersRef = useRef<Map<string, () => void>>(new Map());
  const toolCallSubscribedRef = useRef<Map<string, () => void>>(new Map());
  const permissionSubscribedRef = useRef<Map<string, () => void>>(new Map());
  const commandsSubscribedRef = useRef<Map<string, () => void>>(new Map());
  const modeSubscribedRef = useRef<Map<string, () => void>>(new Map());
  const storeActionsRef = useRef({ appendWorkerOutput, updateWorker, updateSession, addWorkerMessage, appendWorkerThinking, updateWorkerToolCall, updateWorkerPlan, updateWorkerCommands, addPermissionRequest });

  // Keep store actions ref up to date
  useEffect(() => {
    storeActionsRef.current = { appendWorkerOutput, updateWorker, updateSession, addWorkerMessage, appendWorkerThinking, updateWorkerToolCall, updateWorkerPlan, updateWorkerCommands, addPermissionRequest };
  }, [appendWorkerOutput, updateWorker, updateSession, addWorkerMessage, appendWorkerThinking, updateWorkerToolCall, updateWorkerPlan, updateWorkerCommands, addPermissionRequest]);

  // Listen for worker output streams - subscribe only to new workers
  useEffect(() => {
    const subscribedWorkers = subscribedWorkersRef.current;

    // Build set of current worker IDs and their session IDs
    const currentWorkers = new Map<string, string>();
    for (const session of sessions) {
      for (const worker of session.workers) {
        currentWorkers.set(worker.id, session.id);
      }
    }

    // Subscribe to new workers
    for (const [workerId, sessionId] of currentWorkers) {
      if (!subscribedWorkers.has(workerId)) {
        const unsub = onWorkerStream(workerId, (event) => {
          const actions = storeActionsRef.current;

          if (event.type === "thinking") {
            // Accumulate thinking chunks into a single message
            actions.appendWorkerThinking(sessionId, workerId, event.text);
          } else if (event.type === "delta") {
            actions.appendWorkerOutput(sessionId, workerId, event.text);

            // Parse tool usage from stream
            if (event.text.includes("Using tool:")) {
              const toolMatch = event.text.match(/Using tool:\s*(\w+)/);
              if (toolMatch) {
                actions.addWorkerMessage(sessionId, workerId, {
                  type: "TOOL_USE",
                  role: "assistant",
                  content: event.text.slice(0, 200),
                  timestamp: Date.now(),
                  toolName: toolMatch[1],
                });
              }
            }
          } else if (event.type === "complete") {
            // Clear outputBuffer and add final content as message to avoid duplication
            actions.updateWorker(sessionId, workerId, {
              status: "completed",
              inputTokens: event.usage.input_tokens,
              outputTokens: event.usage.output_tokens,
              outputBuffer: "", // Clear buffer since we're adding it as a message
            });
            // Only add message if there's actual content
            if (event.output && event.output.trim()) {
              actions.addWorkerMessage(sessionId, workerId, {
                type: "TEXT",
                role: "assistant",
                content: event.output,
                timestamp: Date.now(),
                rendered: true,
              });
            }
          } else if (event.type === "error") {
            actions.updateWorker(sessionId, workerId, {
              status: "failed",
              errorMessage: event.message,
            });
            actions.addWorkerMessage(sessionId, workerId, {
              type: "ERROR",
              role: "assistant",
              content: event.message,
              timestamp: Date.now(),
            });
          } else if (event.type === "plan") {
            actions.updateWorkerPlan(sessionId, workerId, { entries: event.entries });
          }
        });

        // Store cleanup function when subscription resolves
        unsub.then((cleanup) => {
          // Only store if still subscribed (worker not removed during async)
          if (currentWorkers.has(workerId)) {
            subscribedWorkers.set(workerId, cleanup);
          } else {
            cleanup();
          }
        });

        // Mark as subscribing (will be replaced with actual cleanup)
        subscribedWorkers.set(workerId, () => {});
      }
    }

    // Unsubscribe from removed workers
    for (const [workerId, cleanup] of subscribedWorkers) {
      if (!currentWorkers.has(workerId)) {
        cleanup();
        subscribedWorkers.delete(workerId);
      }
    }

    // Subscribe to tool call events for new workers
    const toolCallSubscribed = toolCallSubscribedRef.current;
    for (const [workerId, sessionId] of currentWorkers) {
      if (!toolCallSubscribed.has(workerId)) {
        const unsub = onWorkerToolCall(workerId, (toolCall) => {
          const actions = storeActionsRef.current;
          actions.updateWorkerToolCall(sessionId, workerId, toolCall);
        });

        unsub.then((cleanup) => {
          if (currentWorkers.has(workerId)) {
            toolCallSubscribed.set(workerId, cleanup);
          } else {
            cleanup();
          }
        });
        toolCallSubscribed.set(workerId, () => {});
      }
    }

    // Unsubscribe tool calls from removed workers
    for (const [workerId, cleanup] of toolCallSubscribed) {
      if (!currentWorkers.has(workerId)) {
        cleanup();
        toolCallSubscribed.delete(workerId);
      }
    }

    // Subscribe to permission events for new workers
    const permissionSubscribed = permissionSubscribedRef.current;
    for (const [workerId, sessionId] of currentWorkers) {
      if (!permissionSubscribed.has(workerId)) {
        const unsub = onWorkerPermission(workerId, (event) => {
          const actions = storeActionsRef.current;
          actions.addPermissionRequest({
            workerId,
            sessionId,
            title: event.title,
            toolCallId: event.toolCallId,
            options: event.options.map((opt) => ({
              id: opt.id,
              name: opt.name,
              kind: opt.kind,
            })),
            timestamp: Date.now(),
          });
        });

        unsub.then((cleanup) => {
          if (currentWorkers.has(workerId)) {
            permissionSubscribed.set(workerId, cleanup);
          } else {
            cleanup();
          }
        });
        permissionSubscribed.set(workerId, () => {});
      }
    }

    // Unsubscribe permissions from removed workers
    for (const [workerId, cleanup] of permissionSubscribed) {
      if (!currentWorkers.has(workerId)) {
        cleanup();
        permissionSubscribed.delete(workerId);
      }
    }

    // Subscribe to commands/skills events for new workers
    const commandsSubscribed = commandsSubscribedRef.current;
    for (const [workerId, sessionId] of currentWorkers) {
      if (!commandsSubscribed.has(workerId)) {
        const unsub = onWorkerCommands(workerId, (commands) => {
          const actions = storeActionsRef.current;
          // Parse source from description (e.g., "(user)", "(project)")
          const parsed = commands.map((cmd) => {
            const sourceMatch = cmd.description.match(/\((user|project)\)$/);
            return {
              name: cmd.name,
              description: cmd.description.replace(/\s*\((user|project)\)$/, ""),
              source: sourceMatch?.[1] as "user" | "project" | undefined,
              input: cmd.input?.Unstructured ? { hint: cmd.input.Unstructured.hint } : undefined,
            };
          });
          actions.updateWorkerCommands(sessionId, workerId, parsed);
        });

        unsub.then((cleanup) => {
          if (currentWorkers.has(workerId)) {
            commandsSubscribed.set(workerId, cleanup);
          } else {
            cleanup();
          }
        });
        commandsSubscribed.set(workerId, () => {});
      }
    }

    // Unsubscribe commands from removed workers
    for (const [workerId, cleanup] of commandsSubscribed) {
      if (!currentWorkers.has(workerId)) {
        cleanup();
        commandsSubscribed.delete(workerId);
      }
    }

    // Subscribe to mode change events for new workers
    const modeSubscribed = modeSubscribedRef.current;
    for (const [workerId, sessionId] of currentWorkers) {
      if (!modeSubscribed.has(workerId)) {
        const unsub = onWorkerModeChange(workerId, (modeId) => {
          const actions = storeActionsRef.current;
          actions.updateSession(sessionId, { mode: modeId as "default" | "plan" });
        });

        unsub.then((cleanup) => {
          if (currentWorkers.has(workerId)) {
            modeSubscribed.set(workerId, cleanup);
          } else {
            cleanup();
          }
        });
        modeSubscribed.set(workerId, () => {});
      }
    }

    // Unsubscribe mode from removed workers
    for (const [workerId, cleanup] of modeSubscribed) {
      if (!currentWorkers.has(workerId)) {
        cleanup();
        modeSubscribed.delete(workerId);
      }
    }
  }, [sessions]);

  // Cleanup all subscriptions on unmount
  useEffect(() => {
    return () => {
      for (const cleanup of subscribedWorkersRef.current.values()) {
        cleanup();
      }
      subscribedWorkersRef.current.clear();
      for (const cleanup of toolCallSubscribedRef.current.values()) {
        cleanup();
      }
      toolCallSubscribedRef.current.clear();
      for (const cleanup of permissionSubscribedRef.current.values()) {
        cleanup();
      }
      permissionSubscribedRef.current.clear();
      for (const cleanup of commandsSubscribedRef.current.values()) {
        cleanup();
      }
      commandsSubscribedRef.current.clear();
      for (const cleanup of modeSubscribedRef.current.values()) {
        cleanup();
      }
      modeSubscribedRef.current.clear();
    };
  }, []);

  return (
    <AuthProvider>
    <div
      className={cn(
        "h-screen w-screen flex flex-col overflow-hidden bg-background",
        className,
      )}
    >
      {/* Titlebar with tabs */}
      <header
        className="h-9 flex items-center border-b border-border/50 bg-card shrink-0"
        data-tauri-drag-region
      >
        {/* Logo area - fixed width for traffic lights */}
        <div
          className="flex items-center gap-2 px-3 shrink-0"
          style={{ paddingLeft: "80px" }}
          data-tauri-drag-region
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="size-3.5 text-accent-orange"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span className="font-mono text-[11px] font-medium text-muted-foreground/80">
            crafter/code
          </span>
        </div>

        {/* Tabs area - scrollable */}
        <div className="flex-1 flex items-center gap-0.5 px-1 overflow-x-auto scrollbar-none min-w-0">
          {sessions.map((session) => (
            <div
              key={session.id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveSession(session.id)}
              onKeyDown={(e) => { if (e.key === "Enter") setActiveSession(session.id); }}
              className={cn(
                "group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] shrink-0 max-w-[160px] transition-colors cursor-pointer",
                session.id === activeSessionId
                  ? "bg-background border border-border text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <AgentIcon agentId={session.agentType} className="size-3 shrink-0" />
              <span className="truncate">{session.prompt}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeSession(session.id);
                }}
                className={cn(
                  "ml-auto p-0.5 rounded hover:bg-muted-foreground/20 transition-opacity",
                  session.id === activeSessionId ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
                )}
              >
                <X className="size-2.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Right side info */}
        <div className="flex items-center gap-3 text-[11px] px-3 shrink-0">
          <ViewToggle />
          <LoginButton />
          <button
            type="button"
            onClick={() => {
              toggleSettings();
            }}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Settings (⌘,)"
          >
            <Settings className="size-3.5 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">
            <Wifi className="size-3" />
            <span>Connected</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar */}
        {showSidebar && <OrchestratorSidebar />}

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 overflow-hidden bg-background">
          {activeView === "dashboard" ? (
            <DashboardView />
          ) : (
            <SessionColumns
              showSidebar={showSidebar}
              onToggleSidebar={() => setShowSidebar(!showSidebar)}
            />
          )}
        </main>

        {/* Coordination Panel (Tasks + Inbox) */}
        {showCoordinationPanel ? (
          <aside className="w-64 border-l border-border shrink-0">
            <CoordinationPanel
              sessionId={activeSessionId}
              onCollapse={() => setShowCoordinationPanel(false)}
            />
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setShowCoordinationPanel(true)}
            className="flex items-center justify-center w-8 border-l border-border bg-card hover:bg-muted transition-colors shrink-0"
            title="Show coordination panel"
          >
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Status Bar */}
      <footer className="h-5 flex items-center justify-between px-3 border-t border-border bg-card text-[10px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-green-500" />
            Ready
          </span>
          {activeSession && (
            <span className="text-accent-orange">
              {
                activeSession.workers.filter((w) => w.status === "running")
                  .length
              }{" "}
              workers running
            </span>
          )}
        </div>
        <span className="font-mono">v0.2.0</span>
      </footer>
    </div>
    <SettingsDialog />
    <GlobalSearch />
    </AuthProvider>
  );
}
