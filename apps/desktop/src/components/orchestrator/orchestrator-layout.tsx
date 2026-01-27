"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronRight, Wifi, X } from "lucide-react";

import { onWorkerStatusChange, onWorkerStream, onWorkerToolCall, onWorkerPermission } from "@/lib/ipc/orchestrator";
import { cn } from "@/lib/utils";

import { useOrchestratorStore } from "@/stores/orchestrator-store";
import { AgentIcon } from "./agent-icons";
import { CoordinationPanel } from "./coordination-panel";
import { OrchestratorSidebar } from "./orchestrator-sidebar";
import { SessionColumns } from "./session-columns";

interface OrchestratorLayoutProps {
  className?: string;
}

export function OrchestratorLayout({ className }: OrchestratorLayoutProps) {
  const [showCoordinationPanel, setShowCoordinationPanel] = useState(true);

  const {
    sessions,
    activeSessionId,
    setActiveSession,
    removeSession,
    updateWorker,
    appendWorkerOutput,
    addWorkerMessage,
    updateWorkerToolCall,
    updateWorkerPlan,
    addPermissionRequest,
    getActiveSession,
  } = useOrchestratorStore();

  const activeSession = getActiveSession();

  // Listen for worker status changes globally
  useEffect(() => {
    const unsubscribe = onWorkerStatusChange((event) => {
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
  }, [updateWorker, addWorkerMessage]);

  // Track subscribed workers to avoid unsubscribe/resubscribe on session updates
  const subscribedWorkersRef = useRef<Map<string, () => void>>(new Map());
  const toolCallSubscribedRef = useRef<Map<string, () => void>>(new Map());
  const permissionSubscribedRef = useRef<Map<string, () => void>>(new Map());
  const storeActionsRef = useRef({ appendWorkerOutput, updateWorker, addWorkerMessage, updateWorkerToolCall, updateWorkerPlan, addPermissionRequest });

  // Keep store actions ref up to date
  useEffect(() => {
    storeActionsRef.current = { appendWorkerOutput, updateWorker, addWorkerMessage, updateWorkerToolCall, updateWorkerPlan, addPermissionRequest };
  }, [appendWorkerOutput, updateWorker, addWorkerMessage, updateWorkerToolCall, updateWorkerPlan, addPermissionRequest]);

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
        console.log("[Frontend] Subscribing to worker:", workerId);
        const unsub = onWorkerStream(workerId, (event) => {
          console.log("[Frontend] Received event for worker:", workerId, event);
          const actions = storeActionsRef.current;

          if (event.type === "thinking") {
            // Add thinking as a proper message so it persists
            actions.addWorkerMessage(sessionId, workerId, {
              type: "THINKING",
              role: "assistant",
              content: event.text,
              timestamp: Date.now(),
            });
          } else if (event.type === "delta") {
            console.log("[Frontend] Delta text:", event.text);
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
            console.log("[Frontend] Received plan:", event.entries);
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
        console.log("[Frontend] Subscribing to tool calls for worker:", workerId);
        const unsub = onWorkerToolCall(workerId, (toolCall) => {
          console.log("[Frontend] Received tool call:", toolCall);
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
        console.log("[Frontend] Subscribing to permissions for worker:", workerId);
        const unsub = onWorkerPermission(workerId, (event) => {
          console.log("[Frontend] Received permission request:", event);
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
    };
  }, []);

  return (
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
            <button
              key={session.id}
              type="button"
              onClick={() => setActiveSession(session.id)}
              className={cn(
                "group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] shrink-0 max-w-[160px] transition-colors",
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
            </button>
          ))}
        </div>

        {/* Right side info */}
        <div
          className="flex items-center gap-2 text-[11px] px-3 shrink-0"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">
            <Wifi className="size-3" />
            <span>Connected</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar */}
        <OrchestratorSidebar />

        {/* Session Columns */}
        <main className="flex-1 min-w-0 overflow-hidden bg-background">
          <SessionColumns />
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
  );
}
