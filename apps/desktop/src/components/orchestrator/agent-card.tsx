"use client";

import { useEffect, useState } from "react";
import {
  RefreshCw,
  Square,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Clock,
  DollarSign,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@crafter-code/ui";
import type { WorkerSession, WorkerStatus } from "@/stores/orchestrator-store";

interface AgentCardProps {
  worker: WorkerSession;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function AgentCard({ worker, onCancel, onRetry }: AgentCardProps) {
  const [outputPreview, setOutputPreview] = useState("");

  useEffect(() => {
    const lastChars = worker.outputBuffer.slice(-500);
    setOutputPreview(lastChars);
  }, [worker.outputBuffer]);

  const canCancel = worker.status === "running" || worker.status === "pending";
  const canRetry = worker.status === "failed" || worker.status === "cancelled";

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-card p-4 h-full min-h-[200px]",
        worker.status === "running" && "border-accent-orange/50",
        worker.status === "completed" && "border-green-500/50",
        worker.status === "failed" && "border-destructive/50"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon status={worker.status} />
          <span className="text-xs font-mono uppercase text-muted-foreground">
            {worker.model}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canCancel && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onCancel}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Square className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel worker</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {canRetry && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onRetry}
                    className="text-muted-foreground hover:text-accent-orange"
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Retry worker</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Task description */}
      <p className="text-sm line-clamp-2 mb-3">{worker.task}</p>

      {/* Output preview */}
      <div className="flex-1 min-h-0 mb-3">
        {outputPreview ? (
          <div className="h-full overflow-hidden rounded bg-muted/50 p-2">
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all line-clamp-6">
              {outputPreview}
            </pre>
          </div>
        ) : worker.status === "pending" ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            Waiting to start...
          </div>
        ) : worker.status === "running" ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="size-5 animate-spin text-accent-orange" />
          </div>
        ) : null}
      </div>

      {/* Error message */}
      {worker.errorMessage && (
        <div className="mb-3 rounded bg-destructive/10 p-2 text-xs text-destructive">
          {worker.errorMessage}
        </div>
      )}

      {/* Footer stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Clock className="size-3" />
            <span>{formatTokens(worker.inputTokens + worker.outputTokens)}</span>
          </div>
          <div className="flex items-center gap-1">
            <DollarSign className="size-3" />
            <span>${worker.costUsd.toFixed(4)}</span>
          </div>
        </div>
        {worker.filesTouched.length > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 cursor-help">
                  <FileText className="size-3" />
                  <span>{worker.filesTouched.length}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="text-xs">
                  <p className="font-medium mb-1">Files touched:</p>
                  <ul className="space-y-0.5">
                    {worker.filesTouched.slice(0, 5).map((file) => (
                      <li key={file} className="font-mono truncate">
                        {file}
                      </li>
                    ))}
                    {worker.filesTouched.length > 5 && (
                      <li>...and {worker.filesTouched.length - 5} more</li>
                    )}
                  </ul>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: WorkerStatus }) {
  switch (status) {
    case "pending":
      return <Clock className="size-4 text-muted-foreground" />;
    case "running":
      return <Loader2 className="size-4 text-accent-orange animate-spin" />;
    case "completed":
      return <CheckCircle2 className="size-4 text-green-500" />;
    case "failed":
      return <AlertCircle className="size-4 text-destructive" />;
    case "cancelled":
      return <Square className="size-4 text-muted-foreground" />;
    default:
      return null;
  }
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}
