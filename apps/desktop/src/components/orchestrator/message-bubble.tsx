"use client";

import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

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
  className,
}: MessageBubbleProps) {
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

  // THINKING message - dimmed with Streamdown
  if (type === "THINKING") {
    return (
      <div
        className={cn(
          "flex items-start gap-1.5 px-2 py-0.5 text-[10px]",
          className,
        )}
      >
        <span className="size-1 rounded-full bg-violet-400/40 mt-1.5 shrink-0" />
        <div className="streamdown-thinking flex-1 min-w-0 overflow-hidden">
          <Streamdown
            plugins={{ code }}
            isAnimating={isStreaming}
            shikiTheme={["github-light", "github-dark"]}
            controls={false}
          >
            {content}
          </Streamdown>
        </div>
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
            shikiTheme={["github-light", "github-dark"]}
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
