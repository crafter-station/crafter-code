"use client";

import {
  Activity,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  AlertCircle,
  Cpu,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useOrchestratorStore, type WorkerSession, type Model } from "@/stores/orchestrator-store";
import { AgentIcon } from "./agent-icons";
import { WorkerTimeline } from "./worker-timeline";

export function DashboardView() {
  const sessions = useOrchestratorStore((s) => s.sessions);

  const allWorkers = sessions.flatMap((s) =>
    (s.workers || []).map((w) => ({ ...w, sessionPrompt: s.prompt })),
  );

  const running = allWorkers.filter((w) => w.status === "running");
  const completed = allWorkers.filter((w) => w.status === "completed");
  const failed = allWorkers.filter((w) => w.status === "failed");
  const pending = allWorkers.filter((w) => w.status === "pending");

  const totalCost = sessions.reduce((sum, s) => sum + (s.totalCost || 0), 0);
  const totalInputTokens = sessions.reduce((sum, s) => sum + (s.totalInputTokens || 0), 0);
  const totalOutputTokens = sessions.reduce((sum, s) => sum + (s.totalOutputTokens || 0), 0);

  const costByModel = allWorkers.reduce(
    (acc, w) => {
      const model = w.model;
      acc[model] = (acc[model] || 0) + (w.costUsd || 0);
      return acc;
    },
    {} as Record<Model, number>,
  );

  const allFiles = new Set(allWorkers.flatMap((w) => w.filesTouched || []));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Running"
          value={running.length}
          icon={<Loader2 className="size-4 animate-spin" />}
          color="text-accent-orange"
        />
        <StatCard
          label="Completed"
          value={completed.length}
          icon={<CheckCircle2 className="size-4" />}
          color="text-green-500"
        />
        <StatCard
          label="Failed"
          value={failed.length}
          icon={<AlertCircle className="size-4" />}
          color="text-destructive"
        />
        <StatCard
          label="Total Cost"
          value={`$${formatCost(totalCost)}`}
          icon={<DollarSign className="size-4" />}
          color="text-green-500"
        />
      </div>

      {allWorkers.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">Timeline</h3>
          <WorkerTimeline
            workers={allWorkers}
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Activity className="size-4" />
            Active Agents
          </h3>
          {running.length === 0 && pending.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No agents running. Start a session to see activity here.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {[...running, ...pending].map((worker) => (
                <AgentStatusCard key={worker.id} worker={worker} />
              ))}
            </div>
          )}

          {completed.length > 0 && (
            <>
              <h3 className="text-sm font-medium flex items-center gap-2 mt-6">
                <CheckCircle2 className="size-4 text-green-500" />
                Recently Completed
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {completed.slice(0, 4).map((worker) => (
                  <AgentStatusCard key={worker.id} worker={worker} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Cpu className="size-4" />
            Cost by Model
          </h3>
          <div className="rounded-lg border p-4 space-y-3">
            {Object.entries(costByModel).map(([model, cost]) => (
              <div key={model} className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-muted-foreground">
                  {model}
                </span>
                <span className="text-xs font-mono text-green-500">
                  ${formatCost(cost)}
                </span>
              </div>
            ))}
            {Object.keys(costByModel).length === 0 && (
              <p className="text-xs text-muted-foreground">No data yet</p>
            )}
            <div className="border-t pt-2 flex items-center justify-between">
              <span className="text-xs font-medium">Total</span>
              <span className="text-xs font-mono font-medium text-green-500">
                ${formatCost(totalCost)}
              </span>
            </div>
          </div>

          <h3 className="text-sm font-medium flex items-center gap-2">
            <Clock className="size-4" />
            Token Usage
          </h3>
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Input</span>
              <span className="font-mono">{formatTokens(totalInputTokens)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Output</span>
              <span className="font-mono">{formatTokens(totalOutputTokens)}</span>
            </div>
          </div>

          <h3 className="text-sm font-medium flex items-center gap-2">
            <FileText className="size-4" />
            Active Files ({allFiles.size})
          </h3>
          <div className="rounded-lg border p-4 max-h-48 overflow-y-auto">
            {allFiles.size === 0 ? (
              <p className="text-xs text-muted-foreground">No files touched yet</p>
            ) : (
              <ul className="space-y-1">
                {[...allFiles].slice(0, 20).map((file) => (
                  <li
                    key={file}
                    className="text-xs font-mono truncate text-muted-foreground"
                  >
                    {file}
                  </li>
                ))}
                {allFiles.size > 20 && (
                  <li className="text-xs text-muted-foreground">
                    ...and {allFiles.size - 20} more
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function AgentStatusCard({
  worker,
}: {
  worker: WorkerSession & { sessionPrompt: string };
}) {
  const isRunning = worker.status === "running";
  const isPending = worker.status === "pending";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        isRunning && "border-accent-orange/50",
        worker.status === "completed" && "border-green-500/30",
        worker.status === "failed" && "border-destructive/30",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-orange opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-accent-orange" />
            </span>
          )}
          {isPending && <span className="size-2 rounded-full bg-muted-foreground" />}
          {worker.status === "completed" && (
            <span className="size-2 rounded-full bg-green-500" />
          )}
          {worker.status === "failed" && (
            <span className="size-2 rounded-full bg-destructive" />
          )}
          <span className="text-xs font-mono uppercase text-muted-foreground">
            {worker.model}
          </span>
          <AgentIcon agentId={worker.agentType} className="size-3.5" />
        </div>
        <span className="text-xs font-mono text-green-500">
          ${formatCost(worker.costUsd)}
        </span>
      </div>
      <p className="text-xs line-clamp-2">{worker.task}</p>
      {(worker.filesTouched || []).length > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <FileText className="size-3" />
          <span>{worker.filesTouched.length} files</span>
        </div>
      )}
    </div>
  );
}

function formatCost(cost: number): string {
  if (cost < 0.01) return cost.toFixed(4);
  return cost.toFixed(2);
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}
