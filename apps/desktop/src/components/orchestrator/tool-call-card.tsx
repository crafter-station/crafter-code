"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Pencil,
  XCircle,
  Terminal,
  Search,
  Brain,
  Globe,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { ToolCall, ToolCallContent, ToolCallKind } from "@/stores/orchestrator-store";

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
  const [isExpanded, setIsExpanded] = useState(false);
  const KindIcon = KIND_ICONS[toolCall.kind] || Terminal;
  const kindColor = KIND_COLORS[toolCall.kind] || KIND_COLORS.other;

  // Check if there's any meaningful content to display
  const hasContent = toolCall.content?.some((c) => {
    if (c.type === "text" && c.text) return true;
    if (c.type === "code" && c.code) return true;
    if (c.type === "error" && (c.text || c.message)) return true;
    if (c.type === "diff" && (c.path || c.new_text)) return true;
    if (c.type === "terminal" && (c.output || c.terminal_id)) return true;
    return false;
  });

  // Get status icon
  const StatusIcon = getStatusIcon(toolCall.status);
  const statusColor = getStatusColor(toolCall.status);

  // For in-progress, show spinner
  if (toolCall.status === "in_progress" || toolCall.status === "pending") {
    return (
      <div className={cn("flex items-center gap-1.5 text-[10px] py-0.5", className)}>
        <Loader2 className={cn("size-3 animate-spin", kindColor)} />
        <KindIcon className={cn("size-3", kindColor)} />
        <span className="text-foreground/80 truncate flex-1">
          {toolCall.title || `Running ${toolCall.kind}...`}
        </span>
      </div>
    );
  }

  // For failed tools, show error
  if (toolCall.status === "failed") {
    const errorContent = toolCall.content?.find((c) => c.type === "error");
    return (
      <div className={cn("flex items-center gap-1.5 text-[10px] py-0.5", className)}>
        <XCircle className="size-3 text-red-400 shrink-0" />
        <span className="text-red-400/80 truncate flex-1">
          {errorContent?.message || errorContent?.text || toolCall.title || "Failed"}
        </span>
      </div>
    );
  }

  // For completed without content - ultra compact
  if (!hasContent) {
    return (
      <div className={cn("flex items-center gap-1.5 text-[10px] text-muted-foreground/60 py-0.5", className)}>
        <StatusIcon className={cn("size-2.5", statusColor)} />
        <KindIcon className={cn("size-2.5", kindColor, "opacity-60")} />
        <span className="truncate opacity-80">{toolCall.title || toolCall.kind}</span>
      </div>
    );
  }

  // Completed with content - expandable card
  return (
    <div className={cn("text-[10px] py-0.5", className)}>
      {/* Header - clickable to expand */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 w-full text-left hover:bg-muted/30 rounded px-1 -mx-1 py-0.5 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="size-2.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-2.5 text-muted-foreground shrink-0" />
        )}
        <StatusIcon className={cn("size-2.5 shrink-0", statusColor)} />
        <KindIcon className={cn("size-2.5 shrink-0", kindColor)} />
        <span className="text-foreground/80 truncate flex-1">{toolCall.title}</span>
        {!isExpanded && toolCall.content && toolCall.content.length > 0 && (
          <span className="text-muted-foreground/50 shrink-0">
            {toolCall.content.length} item{toolCall.content.length > 1 ? "s" : ""}
          </span>
        )}
      </button>

      {/* Content - expanded */}
      {isExpanded && toolCall.content && (
        <div className="mt-1 ml-5 space-y-1 border-l border-border/50 pl-2">
          {toolCall.content.map((c, i) => (
            <ContentItem key={i} content={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// Content item renderer
function ContentItem({ content }: { content: ToolCallContent }) {
  const [showFull, setShowFull] = useState(false);

  if (content.type === "diff") {
    const fileName = content.path?.split("/").pop() || "file";
    const preview = content.new_text?.slice(0, 200) || "";
    const hasMore = (content.new_text?.length || 0) > 200;

    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1 text-amber-400/80">
          <Pencil className="size-2.5" />
          <span className="font-mono">{fileName}</span>
          {content.path && (
            <span className="text-muted-foreground/50 truncate text-[9px]">
              {content.path}
            </span>
          )}
        </div>
        {content.new_text && (
          <div className="bg-muted/30 rounded p-1.5 font-mono text-[9px] text-foreground/70 overflow-hidden">
            <pre className="whitespace-pre-wrap break-all">
              {showFull ? content.new_text : preview}
              {hasMore && !showFull && "..."}
            </pre>
            {hasMore && (
              <button
                type="button"
                onClick={() => setShowFull(!showFull)}
                className="text-accent-orange hover:underline mt-1"
              >
                {showFull ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (content.type === "terminal") {
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1 text-green-400/80">
          <Terminal className="size-2.5" />
          <span className="font-mono">Terminal</span>
          {content.exit_code !== undefined && (
            <span className={cn(
              "text-[9px]",
              content.exit_code === 0 ? "text-green-400/60" : "text-red-400/60"
            )}>
              exit {content.exit_code}
            </span>
          )}
        </div>
        {content.output && (
          <div className="bg-zinc-900 rounded p-1.5 font-mono text-[9px] text-green-400/80 overflow-hidden max-h-32 overflow-y-auto">
            <pre className="whitespace-pre-wrap break-all">{content.output}</pre>
          </div>
        )}
      </div>
    );
  }

  if (content.type === "text") {
    return (
      <div className="text-foreground/70">
        {content.text}
      </div>
    );
  }

  if (content.type === "code") {
    return (
      <div className="bg-muted/30 rounded p-1.5 font-mono text-[9px] overflow-hidden">
        <pre className="whitespace-pre-wrap break-all">{content.code}</pre>
      </div>
    );
  }

  if (content.type === "error") {
    return (
      <div className="text-red-400/80 flex items-center gap-1">
        <XCircle className="size-2.5" />
        {content.message || content.text}
      </div>
    );
  }

  // Unknown type
  return (
    <div className="text-muted-foreground/50">
      [{content.type}]
    </div>
  );
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return CheckCircle2;
    case "failed":
      return XCircle;
    case "in_progress":
    case "pending":
      return Loader2;
    default:
      return CheckCircle2;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "text-green-500/70";
    case "failed":
      return "text-red-400";
    case "in_progress":
    case "pending":
      return "text-accent-orange";
    default:
      return "text-muted-foreground";
  }
}
