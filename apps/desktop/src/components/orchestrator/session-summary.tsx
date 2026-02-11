"use client";

import {
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Cpu,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { OrchestratorSession } from "@/stores/orchestrator-store";

interface SessionSummaryProps {
  session: OrchestratorSession;
  className?: string;
}

export function SessionSummary({ session, className }: SessionSummaryProps) {
  const workers = session.workers || [];
  const completedWorkers = workers.filter(
    (w) => w.status === "completed",
  ).length;
  const failedWorkers = workers.filter(
    (w) => w.status === "failed",
  ).length;

  const allFiles = new Set(workers.flatMap((w) => w.filesTouched || []));

  const duration = session.updatedAt - session.createdAt;
  const durationStr = formatDuration(duration);

  const modelBreakdown = workers.reduce(
    (acc, w) => {
      acc[w.model] = (acc[w.model] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 space-y-3",
        session.status === "completed" && "border-green-500/30",
        session.status === "failed" && "border-destructive/30",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <CheckCircle2
          className={cn(
            "size-4",
            session.status === "completed" ? "text-green-500" : "text-destructive",
          )}
        />
        <span className="text-sm font-medium">Session Summary</span>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2">
        {session.prompt}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 text-xs">
          <Cpu className="size-3 text-muted-foreground" />
          <span>
            {completedWorkers}/{workers.length} workers
            {failedWorkers > 0 && (
              <span className="text-destructive ml-1">
                ({failedWorkers} failed)
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Clock className="size-3 text-muted-foreground" />
          <span>{durationStr}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <DollarSign className="size-3 text-green-500" />
          <span className="text-green-500">${formatCost(session.totalCost)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <FileText className="size-3 text-muted-foreground" />
          <span>{allFiles.size} files touched</span>
        </div>
      </div>

      {Object.keys(modelBreakdown).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(modelBreakdown).map(([model, count]) => (
            <span
              key={model}
              className="px-2 py-0.5 rounded-full bg-muted text-xs font-mono"
            >
              {model} x{count}
            </span>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {formatTokens(session.totalInputTokens)} input /{" "}
        {formatTokens(session.totalOutputTokens)} output tokens
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
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
