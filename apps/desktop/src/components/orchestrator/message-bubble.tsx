"use client";

import { useState } from "react";
import { Streamdown } from "streamdown";
import { createCodePlugin } from "@streamdown/code";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";

const code = createCodePlugin({ themes: ["vesper", "vesper"] });

import { cn } from "@/lib/utils";

import type { MessageRole, MessageType } from "@/stores/orchestrator-store";

interface MessageBubbleProps {
  type: MessageType;
  role?: MessageRole;
  content: string;
  timestamp: number;
  toolName?: string;
  rendered?: boolean;
  isStreaming?: boolean;
  thinkingDurationMs?: number;
  className?: string;
}

const TYPE_COLORS: Record<MessageType, string> = {
  TOOL_USE: "text-blue-400",
  TEXT: "text-foreground/80",
  ERROR: "text-red-400",
  THINKING: "text-muted-foreground",
};

export function MessageBubble({
  type,
  role = "assistant",
  content,
  toolName,
  isStreaming = false,
  thinkingDurationMs,
  className,
}: MessageBubbleProps) {
  const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);

  // User message - full-width subtle background
  if (role === "user") {
    return (
      <div
        className={cn(
          "bg-muted/40 px-2 py-1 text-[11px] font-mono text-foreground/90",
          className,
        )}
      >
        {content}
      </div>
    );
  }

  // THINKING message - collapsible when not streaming
  if (type === "THINKING") {
    // While streaming, show full content
    if (isStreaming) {
      return (
        <div
          className={cn(
            "flex items-start gap-1.5 px-2 py-0.5 text-[10px]",
            className,
          )}
        >
          <span className="size-1 rounded-full bg-violet-400/60 mt-1.5 shrink-0 animate-pulse" />
          <div className="streamdown-thinking flex-1 min-w-0 overflow-hidden">
            <Streamdown
              plugins={{ code }}
              isAnimating={isStreaming}
              controls={false}
            >
              {content}
            </Streamdown>
          </div>
        </div>
      );
    }

    // Completed thinking - collapsible
    const durationSec = thinkingDurationMs ? Math.round(thinkingDurationMs / 1000) : null;
    // Strip markdown formatting from preview (remove **, *, `, etc.)
    const rawPreview = content.split('\n')[0]?.slice(0, 60) || "Reasoning";
    const previewText = rawPreview
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** -> bold
      .replace(/\*([^*]+)\*/g, '$1')       // *italic* -> italic
      .replace(/`([^`]+)`/g, '$1')         // `code` -> code
      .replace(/^#+\s*/, '');              // # heading -> heading

    return (
      <div className={cn("text-[10px] px-2 py-0.5", className)}>
        <button
          type="button"
          onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
          className="flex items-center gap-1.5 w-full text-left hover:bg-muted/30 rounded px-1 -mx-1 py-0.5 transition-colors text-muted-foreground/70"
        >
          {isThinkingExpanded ? (
            <ChevronDown className="size-2.5 shrink-0" />
          ) : (
            <ChevronRight className="size-2.5 shrink-0" />
          )}
          <Brain className="size-2.5 text-violet-400/60 shrink-0" />
          <span className="truncate flex-1">
            {isThinkingExpanded ? "Thinking" : previewText}
          </span>
          {durationSec !== null && (
            <span className="text-muted-foreground/50 shrink-0">
              {durationSec}s
            </span>
          )}
        </button>

        {isThinkingExpanded && (
          <div className="mt-1 ml-5 border-l border-violet-400/20 pl-2">
            <div className="streamdown-thinking text-muted-foreground/60 italic">
              <Streamdown plugins={{ code }} controls={false}>
                {content}
              </Streamdown>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Assistant TEXT message - with Streamdown for markdown rendering
  if (type === "TEXT") {
    return (
      <div
        className={cn(
          "flex items-start gap-1.5 px-2 py-1 text-[11px]",
          className,
        )}
      >
        <span className="size-1.5 rounded-full bg-white/60 mt-1.5 shrink-0" />
        <div className="streamdown-compact flex-1 min-w-0 overflow-hidden">
          <Streamdown
            plugins={{ code }}
            isAnimating={isStreaming}
            caret={isStreaming ? "circle" : undefined}
            controls={false}
          >
            {content}
          </Streamdown>
        </div>
      </div>
    );
  }

  // TOOL_USE and ERROR - compact inline
  return (
    <div
      className={cn(
        "flex items-start gap-1.5 px-2 py-1 text-[11px] font-mono",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-white/60 mt-1.5 shrink-0" />
      <span className={cn("shrink-0 opacity-60", TYPE_COLORS[type])}>
        {toolName || (type === "ERROR" ? "err" : "tool")}
      </span>
      <span className="text-foreground/60 flex-1">{content}</span>
    </div>
  );
}
