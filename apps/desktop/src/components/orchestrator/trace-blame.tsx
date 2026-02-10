"use client";

import { useEffect, useState } from "react";
import { GitBranch, Bot, User, HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTraceStore } from "@/stores/trace-store";
import type { AgentTrace, Conversation } from "@/lib/ipc/traces";

const MODEL_COLORS: Record<string, string> = {
  "anthropic/claude-opus-4-5-20251101": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "anthropic/claude-sonnet-4-5-20250929": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "anthropic/claude-haiku-4-5-20251001": "bg-green-500/20 text-green-400 border-green-500/30",
  "openai/gpt-4o": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

function getModelColor(modelId?: string): string {
  if (!modelId) return "bg-muted text-muted-foreground border-border";
  return MODEL_COLORS[modelId] ?? "bg-orange-500/20 text-orange-400 border-orange-500/30";
}

function getModelShortName(modelId?: string): string {
  if (!modelId) return "unknown";
  const parts = modelId.split("/");
  const name = parts[parts.length - 1];
  if (name.includes("opus")) return "Opus";
  if (name.includes("sonnet")) return "Sonnet";
  if (name.includes("haiku")) return "Haiku";
  if (name.includes("gpt-4o")) return "GPT-4o";
  return name.slice(0, 12);
}

function getContributorIcon(type: string) {
  switch (type) {
    case "ai":
      return <Bot className="size-3" />;
    case "human":
      return <User className="size-3" />;
    default:
      return <HelpCircle className="size-3" />;
  }
}

interface BlameAnnotation {
  startLine: number;
  endLine: number;
  modelId?: string;
  contributorType: string;
  workerId?: string;
  sessionId?: string;
  timestamp: string;
}

function buildAnnotations(traces: AgentTrace[]): BlameAnnotation[] {
  const annotations: BlameAnnotation[] = [];

  for (const trace of traces) {
    for (const file of trace.files) {
      for (const conv of file.conversations) {
        for (const range of conv.ranges) {
          annotations.push({
            startLine: range.startLine,
            endLine: range.endLine,
            modelId: conv.contributor.modelId,
            contributorType: conv.contributor.type,
            workerId: trace.metadata?.["dev.crafter-code"]?.workerId,
            sessionId: trace.metadata?.["dev.crafter-code"]?.orchestratorSessionId,
            timestamp: trace.timestamp,
          });
        }
      }
    }
  }

  annotations.sort((a, b) => a.startLine - b.startLine);
  return annotations;
}

interface TraceBlameProps {
  cwd: string;
  filePath: string;
  className?: string;
}

export function TraceBlame({ cwd, filePath, className }: TraceBlameProps) {
  const { fileTraces, fetchFileTraces, loading } = useTraceStore();
  const [hoveredAnnotation, setHoveredAnnotation] = useState<BlameAnnotation | null>(null);

  useEffect(() => {
    fetchFileTraces(cwd, filePath);
  }, [cwd, filePath, fetchFileTraces]);

  const traces = fileTraces[filePath] ?? [];
  const annotations = buildAnnotations(traces);

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 p-3 text-sm text-muted-foreground", className)}>
        <GitBranch className="size-4 animate-pulse" />
        Loading traces...
      </div>
    );
  }

  if (annotations.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 p-3 text-sm text-muted-foreground", className)}>
        <GitBranch className="size-4" />
        No agent traces for this file
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <GitBranch className="size-3.5" />
        Agent Trace ({annotations.length} ranges)
      </div>

      <div className="space-y-0.5">
        {annotations.map((ann, i) => {
          const colorClass = getModelColor(ann.modelId);
          const shortName = getModelShortName(ann.modelId);
          const isHovered = hoveredAnnotation === ann;

          return (
            <div
              key={`${ann.startLine}-${ann.endLine}-${i}`}
              className={cn(
                "flex items-center gap-2 px-3 py-1 text-xs font-mono border-l-2 transition-colors cursor-default",
                colorClass,
                isHovered && "bg-accent/10",
              )}
              onMouseEnter={() => setHoveredAnnotation(ann)}
              onMouseLeave={() => setHoveredAnnotation(null)}
            >
              {getContributorIcon(ann.contributorType)}

              <span className="w-16 text-right tabular-nums opacity-70">
                L{ann.startLine}-{ann.endLine}
              </span>

              <span className="font-medium">{shortName}</span>

              {isHovered && ann.workerId && (
                <span className="ml-auto text-[10px] opacity-50 truncate max-w-[120px]">
                  {ann.workerId.slice(0, 8)}
                </span>
              )}

              {isHovered && (
                <span className="text-[10px] opacity-50">
                  {new Date(ann.timestamp).toLocaleTimeString()}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface TraceSessionSummaryProps {
  cwd: string;
  sessionId: string;
  className?: string;
}

export function TraceSessionSummary({ cwd, sessionId, className }: TraceSessionSummaryProps) {
  const { sessionTraces, fetchSessionTraces, loading } = useTraceStore();

  useEffect(() => {
    fetchSessionTraces(cwd, sessionId);
  }, [cwd, sessionId, fetchSessionTraces]);

  const traces = sessionTraces[sessionId] ?? [];

  if (loading || traces.length === 0) return null;

  const fileCount = new Set(traces.flatMap((t) => t.files.map((f) => f.path))).size;
  const models = new Set(
    traces.flatMap((t) =>
      t.files.flatMap((f) => f.conversations.map((c) => c.contributor.modelId).filter(Boolean)),
    ),
  );

  return (
    <div className={cn("flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground", className)}>
      <GitBranch className="size-3" />
      <span>
        {traces.length} traces across {fileCount} files
      </span>
      {Array.from(models).map((model) => (
        <span
          key={model}
          className={cn("px-1.5 py-0.5 rounded text-[10px] border", getModelColor(model))}
        >
          {getModelShortName(model)}
        </span>
      ))}
    </div>
  );
}
