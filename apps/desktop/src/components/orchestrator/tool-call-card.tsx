"use client";

import { CheckCircle2, Loader2, XCircle, FileText, Pencil, Terminal, Search, Brain, Globe, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ToolCall, ToolCallKind } from "@/stores/orchestrator-store";

interface ToolCallCardProps {
  toolCall: ToolCall;
  className?: string;
}

const KIND_ICONS: Record<ToolCallKind, React.ComponentType<{ className?: string }>> = {
  read: FileText,
  edit: Pencil,
  delete: Trash2,
  move: FileText,
  search: Search,
  execute: Terminal,
  think: Brain,
  fetch: Globe,
  switch_mode: Brain,
  other: Terminal,
};

const KIND_COLORS: Record<ToolCallKind, string> = {
  read: "text-blue-400",
  edit: "text-amber-400",
  delete: "text-red-400",
  move: "text-purple-400",
  search: "text-cyan-400",
  execute: "text-green-400",
  think: "text-violet-400",
  fetch: "text-indigo-400",
  switch_mode: "text-pink-400",
  other: "text-muted-foreground",
};

export function ToolCallCard({ toolCall, className }: ToolCallCardProps) {
  const KindIcon = KIND_ICONS[toolCall.kind] || Terminal;
  const kindColor = KIND_COLORS[toolCall.kind] || KIND_COLORS.other;

  // Check if there's any meaningful content to display
  const hasContent = toolCall.content?.some((c) => {
    if (c.type === "text" && c.text) return true;
    if (c.type === "code" && c.code) return true;
    if (c.type === "error" && (c.text || c.message)) return true;
    if (c.type === "diff" && c.path) return true;
    return false;
  });

  // For completed tools with no content, render ultra-compact inline
  if (toolCall.status === "completed" && !hasContent) {
    return (
      <div className={cn("flex items-center gap-1.5 text-[10px] text-muted-foreground/60", className)}>
        <CheckCircle2 className="size-2.5 text-green-500/60" />
        <KindIcon className={cn("size-2.5", kindColor, "opacity-60")} />
        <span className="truncate opacity-80">{toolCall.title || toolCall.kind}</span>
      </div>
    );
  }

  // For failed tools, show error inline
  if (toolCall.status === "failed") {
    const errorContent = toolCall.content?.find((c) => c.type === "error");
    return (
      <div className={cn("flex items-center gap-1.5 text-[10px]", className)}>
        <XCircle className="size-2.5 text-red-400 shrink-0" />
        <span className="text-red-400/80 truncate">
          {errorContent?.message || errorContent?.text || toolCall.title || "Failed"}
        </span>
      </div>
    );
  }

  // For in-progress or pending, show spinner inline
  if (toolCall.status === "in_progress" || toolCall.status === "pending") {
    return (
      <div className={cn("flex items-center gap-1.5 text-[10px]", className)}>
        <Loader2 className={cn("size-2.5 animate-spin", kindColor)} />
        <KindIcon className={cn("size-2.5", kindColor)} />
        <span className="text-foreground/70 truncate">{toolCall.title || `Running ${toolCall.kind}...`}</span>
      </div>
    );
  }

  // Completed with content - show compact card
  return (
    <div className={cn("text-[10px]", className)}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <CheckCircle2 className="size-2.5 text-green-500/70 shrink-0" />
        <KindIcon className={cn("size-2.5", kindColor)} />
        <span className="text-foreground/70 truncate">{toolCall.title}</span>
      </div>

      {/* Content preview - ultra compact */}
      <div className="pl-5 text-[9px] text-muted-foreground/70 space-y-0.5 max-h-12 overflow-hidden">
        {toolCall.content?.slice(0, 2).map((c, i) => (
          <div key={i} className="truncate">
            {c.type === "diff" && (
              <span className="text-amber-400/70">{c.path}</span>
            )}
            {c.type === "text" && (
              <span>{c.text}</span>
            )}
            {c.type === "code" && (
              <span className="font-mono">{c.code?.slice(0, 60)}</span>
            )}
            {c.type === "error" && (
              <span className="text-red-400/70">{c.text || c.message}</span>
            )}
          </div>
        ))}
        {(toolCall.content?.length ?? 0) > 2 && (
          <span className="text-muted-foreground/50">+{(toolCall.content?.length ?? 0) - 2} more</span>
        )}
      </div>
    </div>
  );
}
