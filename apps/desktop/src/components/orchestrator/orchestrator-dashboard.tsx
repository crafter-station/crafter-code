"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, ScrollArea } from "@crafter-code/ui";
import {
  useOrchestratorStore,
  type FileConflict,
} from "@/stores/orchestrator-store";
import {
  onWorkerStream,
  onWorkerStatusChange,
  cancelWorker,
  retryWorker,
  getSessionConflicts,
} from "@/lib/ipc/orchestrator";
import { AgentCard } from "./agent-card";
import { CostTracker } from "./cost-tracker";
import { ConflictAlert } from "./conflict-alert";
import { NewOrchestrationDialog } from "./new-orchestration-dialog";

interface OrchestratorDashboardProps {
  className?: string;
}

export function OrchestratorDashboard({
  className,
}: OrchestratorDashboardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [conflicts, setConflicts] = useState<FileConflict[]>([]);
  const [conflictsDismissed, setConflictsDismissed] = useState(false);

  const {
    sessions,
    activeSessionId,
    getActiveSession,
    setActiveSession,
    updateWorker,
    appendWorkerOutput,
    getCompletedWorkers,
    getTotalWorkers,
  } = useOrchestratorStore();

  const activeSession = getActiveSession();

  // Listen for worker status changes
  useEffect(() => {
    const unsubscribe = onWorkerStatusChange((event) => {
      updateWorker(event.session_id, event.worker_id, {
        status: event.status as "pending" | "running" | "completed" | "failed" | "cancelled",
        costUsd: event.cost,
        errorMessage: event.error,
      });
    });

    return () => {
      unsubscribe.then((fn) => fn());
    };
  }, [updateWorker]);

  // Listen for worker output streams
  useEffect(() => {
    if (!activeSession) return;

    const unsubscribes: Promise<() => void>[] = [];

    for (const worker of activeSession.workers) {
      const unsub = onWorkerStream(worker.id, (event) => {
        if (event.type === "delta") {
          appendWorkerOutput(activeSession.id, worker.id, event.text);
        } else if (event.type === "complete") {
          updateWorker(activeSession.id, worker.id, {
            status: "completed",
            inputTokens: event.usage.input_tokens,
            outputTokens: event.usage.output_tokens,
          });
        } else if (event.type === "error") {
          updateWorker(activeSession.id, worker.id, {
            status: "failed",
            errorMessage: event.message,
          });
        }
      });
      unsubscribes.push(unsub);
    }

    return () => {
      for (const unsub of unsubscribes) {
        unsub.then((fn) => fn());
      }
    };
  }, [activeSession?.id, activeSession?.workers, appendWorkerOutput, updateWorker]);

  // Check for conflicts periodically
  useEffect(() => {
    if (!activeSession || activeSession.status !== "running") return;

    const checkConflicts = async () => {
      try {
        const detected = await getSessionConflicts(activeSession.id);
        setConflicts(detected);
        setConflictsDismissed(false);
      } catch {
        // Ignore errors
      }
    };

    checkConflicts();
    const interval = setInterval(checkConflicts, 5000);
    return () => clearInterval(interval);
  }, [activeSession?.id, activeSession?.status]);

  const handleCancelWorker = async (workerId: string) => {
    if (!activeSession) return;
    try {
      await cancelWorker(activeSession.id, workerId);
    } catch (err) {
      console.error("Failed to cancel worker:", err);
    }
  };

  const handleRetryWorker = async (workerId: string) => {
    if (!activeSession) return;
    try {
      await retryWorker(activeSession.id, workerId);
    } catch (err) {
      console.error("Failed to retry worker:", err);
    }
  };

  const completedCount = activeSession
    ? getCompletedWorkers(activeSession.id)
    : 0;
  const totalCount = activeSession ? getTotalWorkers(activeSession.id) : 0;

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header with cost tracker */}
      {activeSession && (
        <CostTracker
          totalCost={activeSession.totalCost}
          completedWorkers={completedCount}
          totalWorkers={totalCount}
        />
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden p-4">
        {!activeSession ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4">
            <p className="text-muted-foreground">
              No active agent fleet.
              <br />
              Launch a fleet to get started.
            </p>
            <button
              type="button"
              onClick={() => {
                console.log("Launch clicked, opening dialog");
                setDialogOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-orange text-white rounded-md hover:bg-accent-orange/90 transition-colors"
            >
              <Plus className="size-4" />
              Launch Agent Fleet
            </button>
          </div>
        ) : (
          <div className="h-full flex flex-col gap-4">
            {/* Session info */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium truncate max-w-md">
                  {activeSession.prompt}
                </p>
                <p className="text-xs text-muted-foreground">
                  Status:{" "}
                  <span
                    className={cn(
                      "font-mono uppercase",
                      activeSession.status === "running" && "text-accent-orange",
                      activeSession.status === "completed" && "text-green-500",
                      activeSession.status === "failed" && "text-destructive"
                    )}
                  >
                    {activeSession.status}
                  </span>
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="size-4 mr-2" />
                New Fleet
              </Button>
            </div>

            {/* Conflict alert */}
            {conflicts.length > 0 && !conflictsDismissed && (
              <ConflictAlert
                conflicts={conflicts}
                onDismiss={() => setConflictsDismissed(true)}
              />
            )}

            {/* Agent grid */}
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                {activeSession.workers.map((worker) => (
                  <AgentCard
                    key={worker.id}
                    worker={worker}
                    onCancel={() => handleCancelWorker(worker.id)}
                    onRetry={() => handleRetryWorker(worker.id)}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Session selector (if multiple sessions) */}
      {sessions.length > 1 && (
        <div className="border-t border-border px-4 py-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-muted-foreground shrink-0">
              Sessions:
            </span>
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setActiveSession(session.id)}
                className={cn(
                  "px-2 py-1 text-xs rounded transition-colors shrink-0",
                  session.id === activeSessionId
                    ? "bg-accent-orange/20 text-accent-orange"
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                {session.prompt.slice(0, 20)}...
              </button>
            ))}
          </div>
        </div>
      )}

      <NewOrchestrationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSessionCreated={(id) => setActiveSession(id)}
      />
    </div>
  );
}
