"use client";

import { useCallback, useEffect, useRef, useMemo } from "react";

import { Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { respondToPermission } from "@/lib/ipc/orchestrator";

import type { Message, OrchestratorSession, PermissionRequest } from "@/stores/orchestrator-store";
import { useOrchestratorStore } from "@/stores/orchestrator-store";
import { AgentIcon } from "./agent-icons";
import { MessageBubble } from "./message-bubble";
import { SessionInput } from "./session-input";
import { ToolCallCard } from "./tool-call-card";

// Union type for timeline items
type TimelineItem =
  | { kind: "message"; data: Message & { source?: string } }
  | { kind: "permission"; data: PermissionRequest };

interface SessionCardProps {
  session: OrchestratorSession;
  isActive?: boolean;
  onClose?: () => void;
  onFollowUp?: (sessionId: string, message: string) => void;
  className?: string;
}

export function SessionCard({
  session,
  isActive,
  onClose,
  onFollowUp,
  className,
}: SessionCardProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isRunning =
    session.status === "running" || session.status === "planning";

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.messages, session.workers]);

  const handleFollowUp = useCallback(
    (message: string) => {
      onFollowUp?.(session.id, message);
    },
    [session.id, onFollowUp],
  );

  // Get permission requests - use raw selector and filter with useMemo to avoid infinite loop
  const allPermissionRequests = useOrchestratorStore((state) => state.permissionRequests);
  const removePermissionRequest = useOrchestratorStore((state) => state.removePermissionRequest);

  const permissionRequests = useMemo(
    () => allPermissionRequests.filter((r) => r.sessionId === session.id),
    [allPermissionRequests, session.id]
  );

  // Check if waiting for permission (to enable input)
  const isWaitingForPermission = permissionRequests.length > 0;

  // Create unified timeline with messages and permission requests (chronological)
  const timeline: TimelineItem[] = useMemo(() => {
    // Combine session messages with worker messages
    const allMessages: Array<Message & { source?: string }> = [
      ...(session.messages || []).map((m) => ({ ...m, source: "session" })),
      ...session.workers.flatMap((worker) =>
        (worker.messages || []).map((m) => ({
          ...m,
          source: worker.task.slice(0, 30),
        })),
      ),
    ];

    const items: TimelineItem[] = [
      ...allMessages.map((m) => ({ kind: "message" as const, data: m })),
      ...permissionRequests.map((p) => ({ kind: "permission" as const, data: p })),
    ];

    return items.sort((a, b) => a.data.timestamp - b.data.timestamp);
  }, [session.messages, session.workers, permissionRequests]);

  // Get streaming output from workers - show even when completed
  const streamingOutput = session.workers
    .filter((w) => w.outputBuffer)
    .map((w) => w.outputBuffer)
    .join("");

  // Get tool calls from workers, filter out completed ones with no title
  const toolCalls = session.workers
    .flatMap((w) => w.toolCalls || [])
    .filter((tc) => {
      // Always show pending/in_progress tool calls
      if (tc.status === "pending" || tc.status === "in_progress") return true;
      // For completed/failed, need at least a title
      return tc.title && tc.title.trim().length > 0;
    });

  const handlePermissionResponse = async (workerId: string, toolCallId: string, optionId: string) => {
    try {
      await respondToPermission(workerId, optionId);
      removePermissionRequest(workerId, toolCallId);
    } catch (e) {
      console.error("Failed to respond to permission:", e);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-card rounded border",
        isActive ? "border-accent-orange/50" : "border-border",
        className,
      )}
    >
      {/* Header - ultra compact */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border shrink-0 bg-muted/20">
        <AgentIcon agentId={session.agentType} className="size-3.5 shrink-0" />
        <h3 className="text-[11px] truncate flex-1 text-foreground/80">
          {session.prompt}
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 rounded hover:bg-muted transition-colors shrink-0"
          >
            <X className="size-3 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Messages area - anchored to bottom */}
      <div
        className="flex-1 min-h-0 overflow-y-auto flex flex-col"
        ref={scrollRef}
      >
        <div className="flex-1" />
        <div>
          {timeline.length === 0 ? (
            <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground">
              {isRunning ? (
                <>
                  <Loader2 className="size-3 text-accent-orange animate-spin" />
                  {session.status === "planning"
                    ? "Planning..."
                    : "Thinking..."}
                </>
              ) : (
                <span className="text-muted-foreground/60">Ready</span>
              )}
            </div>
          ) : (
            <div>
              {/* Unified chronological timeline */}
              {timeline.map((item, index) => {
                if (item.kind === "message") {
                  const message = item.data;
                  // Show streaming indicator only for last assistant TEXT message while running
                  const isLastMessage = index === timeline.length - 1;
                  const isAssistantText = message.role === "assistant" && message.type === "TEXT";
                  const showStreaming = isRunning && isLastMessage && isAssistantText && !message.rendered;
                  return (
                    <MessageBubble
                      key={message.id}
                      type={message.type}
                      role={message.role || "assistant"}
                      content={message.content}
                      timestamp={message.timestamp}
                      toolName={message.toolName}
                      rendered={message.rendered}
                      isStreaming={showStreaming}
                    />
                  );
                }
                // Permission request
                const req = item.data;
                return (
                  <div
                    key={`${req.workerId}-${req.toolCallId}`}
                    className="mx-2 my-1 p-2 rounded border border-amber-500/50 bg-amber-500/5"
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-[10px] font-medium text-amber-400">
                        Permission Required
                      </span>
                    </div>
                    <p className="text-[11px] text-foreground/80 font-mono mb-2">
                      {req.title}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {req.options.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handlePermissionResponse(req.workerId, req.toolCallId, opt.id)}
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                            opt.kind === "allow_once" || opt.kind === "allow_always"
                              ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                              : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                          )}
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Show tool calls with new component */}
              {toolCalls.length > 0 && (
                <div className="flex flex-col gap-1 px-2 py-1">
                  {toolCalls.map((tc) => (
                    <ToolCallCard key={tc.id} toolCall={tc} />
                  ))}
                </div>
              )}

              {/* Show streaming output in real-time */}
              {streamingOutput && (
                <div className="px-2 py-1">
                  <p className="text-[11px] text-foreground/90 whitespace-pre-wrap">
                    {streamingOutput}
                  </p>
                </div>
              )}
              {isRunning && !streamingOutput && !isWaitingForPermission && (
                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-muted-foreground">
                  <Loader2 className="size-3 text-accent-orange animate-spin" />
                  Thinking...
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input - compact */}
      <div className="px-1.5 py-1 border-t border-border shrink-0">
        <SessionInput
          onSubmit={handleFollowUp}
          disabled={
            !onFollowUp ||
            session.status === "failed" ||
            session.status === "cancelled"
          }
          isLoading={isRunning && !isWaitingForPermission}
          placeholder={
            isWaitingForPermission
              ? "Type to cancel or wait..."
              : isRunning
                ? "..."
                : session.status === "failed"
                  ? "Failed"
                  : "Follow-up"
          }
        />
      </div>
    </div>
  );
}
