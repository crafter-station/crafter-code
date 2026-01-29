"use client";

import { useState } from "react";
import {
  Bot,
  Circle,
  Loader2,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  RefreshCw,
  Cpu,
  Clock,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { RalphWorker, WorkerStatus, ModelId } from "@/lib/types/prd";

interface WorkerPoolProps {
  workers: RalphWorker[];
  maxWorkers: number;
  className?: string;
  onPauseWorker?: (workerId: string) => void;
  onResumeWorker?: (workerId: string) => void;
  onRestartWorker?: (workerId: string) => void;
}

const workerStatusConfig: Record<
  WorkerStatus,
  { icon: typeof Circle; color: string; bgColor: string; label: string }
> = {
  idle: {
    icon: Circle,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    label: "Idle",
  },
  working: {
    icon: Loader2,
    color: "text-accent-orange",
    bgColor: "bg-accent-orange/10",
    label: "Working",
  },
  completed: {
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    label: "Done",
  },
  error: {
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    label: "Error",
  },
};

const modelColors: Record<ModelId, string> = {
  opus: "text-purple-400 border-purple-400/30",
  sonnet: "text-blue-400 border-blue-400/30",
  haiku: "text-emerald-400 border-emerald-400/30",
};

export function WorkerPool({
  workers,
  maxWorkers,
  className,
  onPauseWorker,
  onResumeWorker,
  onRestartWorker,
}: WorkerPoolProps) {
  const activeWorkers = workers.filter((w) => w.status === "working").length;
  const idleWorkers = workers.filter((w) => w.status === "idle").length;
  const completedWorkers = workers.filter((w) => w.status === "completed").length;
  const errorWorkers = workers.filter((w) => w.status === "error").length;

  return (
    <div className={cn("rounded-lg border border-border overflow-hidden", className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-muted-foreground" />
            <span className="text-[11px] font-medium">Worker Pool</span>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-accent-orange">
              <Zap className="size-3" />
              {activeWorkers}/{maxWorkers} active
            </span>
          </div>
        </div>

        {/* Summary stats */}
        <div className="flex items-center gap-4 mt-2 text-[9px]">
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground" />
            {idleWorkers} idle
          </span>
          <span className="flex items-center gap-1 text-accent-orange">
            <span className="size-1.5 rounded-full bg-accent-orange" />
            {activeWorkers} working
          </span>
          <span className="flex items-center gap-1 text-green-500">
            <span className="size-1.5 rounded-full bg-green-500" />
            {completedWorkers} done
          </span>
          {errorWorkers > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <span className="size-1.5 rounded-full bg-red-500" />
              {errorWorkers} error
            </span>
          )}
        </div>
      </div>

      {/* Worker grid */}
      <div className="p-2">
        {workers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Bot className="size-8 text-muted-foreground/30 mb-2" />
            <p className="text-[11px] text-muted-foreground">No workers spawned yet</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              Workers will appear when PRD execution starts
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {workers.map((worker) => (
              <WorkerCard
                key={worker.id}
                worker={worker}
                onPause={onPauseWorker}
                onResume={onResumeWorker}
                onRestart={onRestartWorker}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pool capacity indicator */}
      <div className="px-3 py-2 border-t border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground">Capacity:</span>
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-accent-orange transition-all duration-300"
              style={{ width: `${(activeWorkers / maxWorkers) * 100}%` }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground">
            {activeWorkers}/{maxWorkers}
          </span>
        </div>
      </div>
    </div>
  );
}

function WorkerCard({
  worker,
  onPause,
  onResume,
  onRestart,
}: {
  worker: RalphWorker;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onRestart?: (id: string) => void;
}) {
  const config = workerStatusConfig[worker.status];
  const StatusIcon = config.icon;

  const elapsedTime = worker.startedAt
    ? formatElapsed(Date.now() - worker.startedAt)
    : null;

  return (
    <div
      className={cn(
        "p-2.5 rounded-lg border transition-all",
        config.bgColor,
        worker.status === "working" && "border-accent-orange/30",
        worker.status === "error" && "border-red-500/30",
        worker.status === "completed" && "border-green-500/30",
        worker.status === "idle" && "border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <StatusIcon
            className={cn(
              "size-3.5",
              config.color,
              worker.status === "working" && "animate-spin"
            )}
          />
          <span className="text-[11px] font-medium font-mono">{worker.id}</span>
        </div>
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[9px] font-medium border",
            modelColors[worker.model]
          )}
        >
          {worker.model}
        </span>
      </div>

      {/* Story assignment */}
      {worker.currentStoryId ? (
        <div className="text-[10px] text-muted-foreground mb-2 truncate">
          Working on: <span className="text-foreground">{worker.currentStoryId}</span>
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground/50 mb-2">
          No story assigned
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between text-[9px]">
        <div className="flex items-center gap-2">
          {/* Iteration */}
          <span className="flex items-center gap-1 text-muted-foreground">
            <RefreshCw className="size-3" />
            {worker.iteration}
          </span>

          {/* Elapsed time */}
          {elapsedTime && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3" />
              {elapsedTime}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {worker.status === "working" && onPause && (
            <button
              type="button"
              onClick={() => onPause(worker.id)}
              className="p-1 rounded hover:bg-muted transition-colors"
              title="Pause worker"
            >
              <Pause className="size-3 text-muted-foreground" />
            </button>
          )}
          {worker.status === "idle" && onResume && (
            <button
              type="button"
              onClick={() => onResume(worker.id)}
              className="p-1 rounded hover:bg-muted transition-colors"
              title="Resume worker"
            >
              <Play className="size-3 text-muted-foreground" />
            </button>
          )}
          {worker.status === "error" && onRestart && (
            <button
              type="button"
              onClick={() => onRestart(worker.id)}
              className="p-1 rounded hover:bg-red-500/20 transition-colors"
              title="Restart worker"
            >
              <RefreshCw className="size-3 text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {worker.error && (
        <div className="mt-2 p-1.5 rounded bg-red-500/10 border border-red-500/20">
          <p className="text-[9px] text-red-400 line-clamp-2">{worker.error}</p>
        </div>
      )}

      {/* Activity indicator */}
      {worker.status === "working" && (
        <div className="mt-2 flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full bg-accent-orange/20 overflow-hidden"
            >
              <div
                className="h-full bg-accent-orange animate-pulse"
                style={{
                  animationDelay: `${i * 200}ms`,
                  animationDuration: "1.5s",
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
