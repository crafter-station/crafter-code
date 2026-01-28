"use client";

import { useMemo, useState } from "react";
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
  Copy,
  Check,
  ExternalLink,
  FileCode,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { ToolCall, ToolCallContent, ToolCallKind } from "@/stores/orchestrator-store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@crafter-code/ui/dialog";
import { ScrollArea } from "@crafter-code/ui/scroll-area";

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

// Extract heredoc content from bash command
function extractHeredocContent(command: string): { filePath: string; content: string } | null {
  // Match: cat > /path/file << 'EOF' or cat > /path/file << EOF
  const heredocMatch = command.match(/cat\s*>\s*([^\s<]+)\s*<<\s*'?(\w+)'?\s*\n([\s\S]*?)\n\2$/);
  if (heredocMatch) {
    return {
      filePath: heredocMatch[1],
      content: heredocMatch[3],
    };
  }
  return null;
}

// Extract simple command from backtick-wrapped title
function extractCommand(title: string): string {
  // Remove backticks from start and end
  if (title.startsWith("`") && title.endsWith("`")) {
    return title.slice(1, -1);
  }
  return title;
}

export function ToolCallCard({ toolCall, className }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const KindIcon = KIND_ICONS[toolCall.kind] || Terminal;
  const kindColor = KIND_COLORS[toolCall.kind] || KIND_COLORS.other;

  // For execute/terminal tools, try to extract heredoc content from title
  const heredocInfo = useMemo(() => {
    if (toolCall.kind === "execute" && toolCall.title) {
      const command = extractCommand(toolCall.title);
      return extractHeredocContent(command);
    }
    return null;
  }, [toolCall.kind, toolCall.title]);

  // Check if there's any meaningful content to display
  const hasContent = toolCall.content?.some((c) => {
    if (c.type === "text" && c.text) return true;
    if (c.type === "code" && c.code) return true;
    if (c.type === "error" && (c.text || c.message)) return true;
    if (c.type === "diff" && (c.path || c.new_text)) return true;
    if (c.type === "terminal" && (c.output || c.terminal_id)) return true;
    return false;
  }) || heredocInfo !== null; // Also has content if we extracted heredoc

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
        <span className="text-foreground/80 truncate flex-1">
          {/* For heredoc commands, show a nicer title */}
          {heredocInfo
            ? `Create ${heredocInfo.filePath.split("/").pop()}`
            : toolCall.title}
        </span>
        {!isExpanded && toolCall.content && toolCall.content.length > 0 && (
          <span className="text-muted-foreground/50 shrink-0">
            {toolCall.content.length} item{toolCall.content.length > 1 ? "s" : ""}
          </span>
        )}
      </button>

      {/* Content - expanded */}
      {isExpanded && (
        <div className="mt-1 ml-5 space-y-1 border-l border-border/50 pl-2">
          {/* Show heredoc content for bash commands */}
          {heredocInfo && (
            <HeredocContent filePath={heredocInfo.filePath} content={heredocInfo.content} />
          )}
          {/* Show regular content */}
          {toolCall.content?.map((c, i) => (
            <ContentItem key={i} content={c} />
          ))}
        </div>
      )}
    </div>
  );
}

// Diff view with git-style + / - highlighting
function DiffView({
  fileName,
  filePath,
  oldText,
  newText,
}: {
  fileName: string;
  filePath: string;
  oldText?: string;
  newText?: string;
}) {
  const [showFull, setShowFull] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate diff lines
  const diffLines = useMemo(() => {
    const lines: Array<{ type: "add" | "remove" | "context"; text: string }> = [];

    if (oldText && newText) {
      // Simple line-by-line diff
      const oldLines = oldText.split("\n");
      const newLines = newText.split("\n");

      // Find removed lines (in old but not in new)
      for (const line of oldLines) {
        if (!newLines.includes(line)) {
          lines.push({ type: "remove", text: line });
        }
      }

      // Find added lines (in new but not in old)
      for (const line of newLines) {
        if (!oldLines.includes(line)) {
          lines.push({ type: "add", text: line });
        }
      }
    } else if (newText && !oldText) {
      // New file - all lines are additions
      for (const line of newText.split("\n")) {
        lines.push({ type: "add", text: line });
      }
    } else if (oldText && !newText) {
      // Deleted file - all lines are removals
      for (const line of oldText.split("\n")) {
        lines.push({ type: "remove", text: line });
      }
    }

    return lines;
  }, [oldText, newText]);

  const visibleLines = showFull ? diffLines : diffLines.slice(0, 15);
  const hasMore = diffLines.length > 15;
  const addedCount = diffLines.filter((l) => l.type === "add").length;
  const removedCount = diffLines.filter((l) => l.type === "remove").length;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(newText || oldText || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-0.5">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <Pencil className="size-2.5 text-amber-400/80" />
        <span className="font-mono text-amber-400/80">{fileName}</span>
        <span className="text-muted-foreground/50 truncate text-[9px] flex-1">
          {filePath}
        </span>
        {addedCount > 0 && (
          <span className="text-[9px] text-green-400">+{addedCount}</span>
        )}
        {removedCount > 0 && (
          <span className="text-[9px] text-red-400">-{removedCount}</span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="p-0.5 rounded hover:bg-muted transition-colors"
          title="Copy content"
        >
          {copied ? (
            <Check className="size-2.5 text-green-400" />
          ) : (
            <Copy className="size-2.5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Diff content */}
      <div className="bg-zinc-900/80 rounded overflow-hidden font-mono text-[9px]">
        {visibleLines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "px-1.5 py-px flex",
              line.type === "add" && "bg-green-500/10",
              line.type === "remove" && "bg-red-500/10"
            )}
          >
            <span
              className={cn(
                "w-3 shrink-0 select-none",
                line.type === "add" && "text-green-400",
                line.type === "remove" && "text-red-400"
              )}
            >
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            </span>
            <span
              className={cn(
                "flex-1 whitespace-pre-wrap break-all",
                line.type === "add" && "text-green-300/90",
                line.type === "remove" && "text-red-300/90",
                line.type === "context" && "text-foreground/60"
              )}
            >
              {line.text}
            </span>
          </div>
        ))}
        {hasMore && !showFull && (
          <div className="px-1.5 py-1 text-muted-foreground/50 border-t border-border/30">
            ... {diffLines.length - 15} more lines
          </div>
        )}
      </div>

      {/* Show more button */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowFull(!showFull)}
          className="text-[9px] text-accent-orange hover:underline"
        >
          {showFull ? "Show less" : `Show all ${diffLines.length} lines`}
        </button>
      )}
    </div>
  );
}

// Heredoc content display (for bash cat > file << EOF commands)
function HeredocContent({ filePath, content }: { filePath: string; content: string }) {
  const [showFull, setShowFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileName = filePath.split("/").pop() || "file";
  const preview = content.slice(0, 300);
  const hasMore = content.length > 300;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-green-400/80">
        <Terminal className="size-2.5" />
        <span className="font-mono text-[9px]">cat &gt;</span>
        <span className="font-mono text-amber-400/80">{fileName}</span>
        <span className="text-muted-foreground/50 truncate text-[9px] flex-1">
          {filePath}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="p-0.5 rounded hover:bg-muted transition-colors"
          title="Copy content"
        >
          {copied ? (
            <Check className="size-2.5 text-green-400" />
          ) : (
            <Copy className="size-2.5 text-muted-foreground" />
          )}
        </button>
      </div>
      <div className="bg-muted/30 rounded p-1.5 font-mono text-[9px] text-foreground/70 overflow-hidden">
        <pre className="whitespace-pre-wrap break-all">
          {showFull ? content : preview}
          {hasMore && !showFull && "..."}
        </pre>
        {hasMore && (
          <button
            type="button"
            onClick={() => setShowFull(!showFull)}
            className="text-accent-orange hover:underline mt-1"
          >
            {showFull ? "Show less" : `Show more (${content.length} chars)`}
          </button>
        )}
      </div>
    </div>
  );
}

// Content item renderer
function ContentItem({ content }: { content: ToolCallContent }) {
  const [showFull, setShowFull] = useState(false);

  if (content.type === "diff") {
    const fileName = content.path?.split("/").pop() || "file";

    return (
      <DiffView
        fileName={fileName}
        filePath={content.path || ""}
        oldText={content.old_text}
        newText={content.new_text}
      />
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
