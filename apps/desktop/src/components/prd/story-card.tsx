"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  XCircle,
  Loader2,
  AlertTriangle,
  Lock,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Cpu,
  Gauge,
  RefreshCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  Story,
  StoryProgress,
  StoryStatus,
  ModelId,
  Complexity,
  CriterionStatus,
  AcceptanceCriterion,
} from "@/lib/types/prd";

interface StoryCardProps {
  story: Story;
  progress?: StoryProgress;
  className?: string;
  onRetry?: () => void;
}

const statusConfig: Record<
  StoryStatus,
  { icon: typeof Circle; color: string; bgColor: string; label: string }
> = {
  pending: {
    icon: Circle,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    label: "Pending",
  },
  in_progress: {
    icon: Loader2,
    color: "text-accent-orange",
    bgColor: "bg-accent-orange/10",
    label: "In Progress",
  },
  completed: {
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    label: "Completed",
  },
  failed: {
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    label: "Failed",
  },
  blocked: {
    icon: Lock,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    label: "Blocked",
  },
};

const modelConfig: Record<ModelId, { color: string; label: string }> = {
  opus: { color: "text-purple-400 bg-purple-500/10", label: "Opus" },
  sonnet: { color: "text-blue-400 bg-blue-500/10", label: "Sonnet" },
  haiku: { color: "text-emerald-400 bg-emerald-500/10", label: "Haiku" },
};

const complexityConfig: Record<Complexity, { color: string; label: string }> = {
  high: { color: "text-red-400 bg-red-500/10", label: "High" },
  medium: { color: "text-amber-400 bg-amber-500/10", label: "Medium" },
  low: { color: "text-green-400 bg-green-500/10", label: "Low" },
};

export function StoryCard({
  story,
  progress,
  className,
  onRetry,
}: StoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const status = progress?.status ?? "pending";
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  const passedCriteria =
    progress?.criteriaStatus.filter((c) => c.passed).length ?? 0;
  const totalCriteria = story.acceptance_criteria.length;
  const criteriaProgress =
    totalCriteria > 0 ? (passedCriteria / totalCriteria) * 100 : 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-border overflow-hidden transition-all",
        config.bgColor,
        className
      )}
    >
      {/* Header */}
      <div className="p-3">
        <div className="flex items-start gap-2">
          {/* Status icon */}
          <div className={cn("mt-0.5 shrink-0", config.color)}>
            <StatusIcon
              className={cn("size-4", status === "in_progress" && "animate-spin")}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-medium truncate">{story.title}</h3>

              {/* Badges */}
              <div className="flex items-center gap-1">
                {story.model && (
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-medium flex items-center gap-1",
                      modelConfig[story.model].color
                    )}
                  >
                    <Cpu className="size-2.5" />
                    {modelConfig[story.model].label}
                  </span>
                )}
                {story.complexity && (
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-medium flex items-center gap-1",
                      complexityConfig[story.complexity].color
                    )}
                  >
                    <Gauge className="size-2.5" />
                    {complexityConfig[story.complexity].label}
                  </span>
                )}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
              {story.description}
            </p>

            {/* Progress bar and iteration */}
            {progress && status !== "pending" && (
              <div className="mt-2 space-y-1">
                {/* Iteration info */}
                <div className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <RefreshCw className="size-3" />
                    Iteration {progress.iteration}/{progress.maxIterations}
                  </span>
                  <span className={cn("font-medium", config.color)}>
                    {passedCriteria}/{totalCriteria} criteria
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-300",
                      status === "completed"
                        ? "bg-green-500"
                        : status === "failed"
                          ? "bg-red-500"
                          : "bg-accent-orange"
                    )}
                    style={{ width: `${criteriaProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error message */}
            {progress?.error && (
              <div className="mt-2 flex items-start gap-1.5 p-2 rounded bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="size-3.5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-red-400">{progress.error}</p>
              </div>
            )}

            {/* Worker info */}
            {progress?.workerId && (
              <div className="mt-1.5 text-[9px] text-muted-foreground">
                Worker: <span className="font-mono">{progress.workerId}</span>
              </div>
            )}

            {/* Dependencies */}
            {story.dependencies.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground">
                <GitBranch className="size-3" />
                <span>Depends on: {story.dependencies.join(", ")}</span>
              </div>
            )}
          </div>

          {/* Expand/collapse */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border bg-background/50 p-3 space-y-3">
          {/* Acceptance Criteria */}
          <div>
            <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Acceptance Criteria
            </h4>
            <div className="space-y-1.5">
              {story.acceptance_criteria.map((criterion, index) => (
                <CriterionRow
                  key={index}
                  criterion={criterion}
                  status={progress?.criteriaStatus[index]}
                />
              ))}
            </div>
          </div>

          {/* Hints */}
          {story.hints && story.hints.length > 0 && (
            <div>
              <h4 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Hints
              </h4>
              <ul className="space-y-1">
                {story.hints.map((hint, index) => (
                  <li
                    key={index}
                    className="text-[11px] text-muted-foreground pl-3 relative before:absolute before:left-0 before:top-1.5 before:size-1 before:rounded-full before:bg-muted-foreground/40"
                  >
                    {hint}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          {(status === "failed" || status === "completed") && onRetry && (
            <div className="pt-2 border-t border-border">
              <button
                type="button"
                onClick={onRetry}
                className="px-3 py-1.5 rounded text-[11px] font-medium bg-accent-orange/20 text-accent-orange hover:bg-accent-orange/30 transition-colors"
              >
                Retry Story
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CriterionRow({
  criterion,
  status,
}: {
  criterion: AcceptanceCriterion;
  status?: CriterionStatus;
}) {
  const passed = status?.passed ?? false;
  const hasRun = status !== undefined;

  return (
    <div
      className={cn(
        "flex items-start gap-2 p-2 rounded",
        hasRun ? (passed ? "bg-green-500/5" : "bg-red-500/5") : "bg-muted/30"
      )}
    >
      {/* Status indicator */}
      <div className="mt-0.5 shrink-0">
        {!hasRun ? (
          <Circle className="size-3.5 text-muted-foreground" />
        ) : passed ? (
          <CheckCircle2 className="size-3.5 text-green-500" />
        ) : (
          <XCircle className="size-3.5 text-red-500" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Description or auto-generated label */}
        <p className="text-[11px]">
          {criterion.description || getCriterionLabel(criterion)}
        </p>

        {/* Type badge and details */}
        <div className="flex items-center gap-2 mt-1">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-muted text-muted-foreground">
            {criterion.type}
          </span>
          <span className="text-[9px] text-muted-foreground/70 truncate">
            {getCriterionDetails(criterion)}
          </span>
        </div>

        {/* Error message */}
        {status?.error && (
          <p className="mt-1 text-[10px] text-red-400">{status.error}</p>
        )}
      </div>
    </div>
  );
}

function getCriterionLabel(criterion: AcceptanceCriterion): string {
  switch (criterion.type) {
    case "test":
      return `Run test: ${criterion.command}`;
    case "file_exists":
      return `File exists: ${criterion.path}`;
    case "pattern":
      return `Pattern match in ${criterion.file}`;
    case "custom":
      return "Custom verification script";
    default:
      return "Unknown criterion";
  }
}

function getCriterionDetails(criterion: AcceptanceCriterion): string {
  switch (criterion.type) {
    case "test":
      return criterion.command ?? "";
    case "file_exists":
      return criterion.path ?? "";
    case "pattern":
      return `${criterion.file}: /${criterion.pattern}/`;
    case "custom":
      return criterion.script ? `${criterion.script.slice(0, 50)}...` : "";
    default:
      return "";
  }
}
