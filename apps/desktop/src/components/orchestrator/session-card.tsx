"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@crafter-code/ui";
import { createCodePlugin } from "@streamdown/code";

// Create code plugin with github-dark theme hardcoded
const code = createCodePlugin({ themes: ["vesper", "vesper"] });
import {
  Braces,
  ClipboardCopy,
  FileText,
  Loader2,
  MoreHorizontal,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Streamdown } from "streamdown";

import {
  cancelWorker,
  type ImageAttachment,
  reconnectWorker,
  respondToPermission,
  setAcpSessionMode,
} from "@/lib/ipc/orchestrator";
import { cn } from "@/lib/utils";

import type {
  AcpPlan,
  Message,
  OrchestratorSession,
  PermissionRequest,
  ToolCall,
} from "@/stores/orchestrator-store";
import { useOrchestratorStore } from "@/stores/orchestrator-store";
import { AgentIcon } from "./agent-icons";
import { MessageBubble } from "./message-bubble";
import { PlanCard } from "./plan-card";
import { SessionInput } from "./session-input";
import { ToolCallCard } from "./tool-call-card";

// Worker color palette - Vesper-inspired desaturated tones
const WORKER_COLORS = [
  { bg: "bg-[#6B9E78]", dot: "#6B9E78" },  // muted sage green (leader)
  { bg: "bg-[#8B7EC8]", dot: "#8B7EC8" },  // muted lavender
  { bg: "bg-[#C4A05A]", dot: "#C4A05A" },  // muted gold
  { bg: "bg-[#7BA3B8]", dot: "#7BA3B8" },  // muted slate blue
  { bg: "bg-[#B87B8B]", dot: "#B87B8B" },  // muted rose
  { bg: "bg-[#8BB8A8]", dot: "#8BB8A8" },  // muted teal
];

// Union type for timeline items with worker attribution
type TimelineItem =
  | { kind: "message"; data: Message & { source?: string; workerId?: string; workerIndex?: number } }
  | { kind: "permission"; data: PermissionRequest }
  | { kind: "tool_call"; data: ToolCall & { workerId?: string; workerIndex?: number } }
  | { kind: "plan"; data: AcpPlan & { timestamp: number; workerId?: string; workerIndex?: number } }
  | { kind: "streaming"; data: { workerId: string; workerIndex: number; content: string; timestamp: number } };

interface SessionCardProps {
  session: OrchestratorSession;
  isActive?: boolean;
  onClose?: () => void;
  onFollowUp?: (
    sessionId: string,
    message: string,
    images?: ImageAttachment[],
  ) => void;
  onFocus?: () => void;
  className?: string;
}

export function SessionCard({
  session,
  isActive,
  onClose,
  onFollowUp,
  onFocus,
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
    (message: string, images?: ImageAttachment[]) => {
      onFollowUp?.(session.id, message, images);
    },
    [session.id, onFollowUp],
  );

  // Stop running worker
  const handleStop = useCallback(async () => {
    const runningWorker = session.workers.find(
      (w) => w.status === "running" || w.status === "pending",
    );
    if (runningWorker) {
      try {
        await cancelWorker(session.id, runningWorker.id);
      } catch (error) {
        console.error("Failed to cancel worker:", error);
      }
    }
  }, [session.id, session.workers]);

  // Get permission requests - use raw selector and filter with useMemo to avoid infinite loop
  const allPermissionRequests = useOrchestratorStore(
    (state) => state.permissionRequests,
  );
  const removePermissionRequest = useOrchestratorStore(
    (state) => state.removePermissionRequest,
  );
  const removeSession = useOrchestratorStore((state) => state.removeSession);

  // Copy session as markdown
  const handleCopyAsMarkdown = useCallback(() => {
    const allMessages = [
      ...(session.messages || []),
      ...session.workers.flatMap((w) => w.messages || []),
    ].sort((a, b) => a.timestamp - b.timestamp);

    // Handle timestamp - if in seconds (< 10 trillion), convert to ms
    const createdAtMs =
      session.createdAt < 10000000000
        ? session.createdAt * 1000
        : session.createdAt;

    // Aggregate token stats from workers
    const totalInputTokens = session.workers.reduce(
      (sum, w) => sum + (w.inputTokens || 0),
      0
    );
    const totalOutputTokens = session.workers.reduce(
      (sum, w) => sum + (w.outputTokens || 0),
      0
    );
    // Calculate cost - use stored value or estimate from tokens (Sonnet 4: $3/1M in, $15/1M out)
    const totalCost = session.workers.reduce((sum, w) => {
      const cost =
        w.costUsd ||
        (w.inputTokens * 3 + w.outputTokens * 15) / 1_000_000;
      return sum + cost;
    }, 0);

    const markdown = [
      `# ${session.prompt}`,
      ``,
      `**Agent**: ${session.agentType}`,
      `**Created**: ${new Date(createdAtMs).toLocaleString()}`,
      `**Mode**: ${session.mode}`,
      `**Workers**: ${session.workers.length}`,
      `**Tokens**: ${totalInputTokens.toLocaleString()} in / ${totalOutputTokens.toLocaleString()} out`,
      `**Cost**: $${totalCost.toFixed(4)}`,
      ``,
      `---`,
      ``,
      ...allMessages.map((m) => {
        const role = m.role === "user" ? "**User**" : "**Assistant**";
        return `${role}:\n${m.content}\n`;
      }),
    ].join("\n");

    navigator.clipboard.writeText(markdown);
  }, [session]);

  // Copy session as raw JSON (all metadata)
  const handleCopyAsRaw = useCallback(() => {
    const raw = JSON.stringify(session, null, 2);
    navigator.clipboard.writeText(raw);
  }, [session]);

  // Delete session
  const handleDelete = useCallback(() => {
    removeSession(session.id);
    onClose?.();
  }, [session.id, removeSession, onClose]);

  const permissionRequests = useMemo(
    () => allPermissionRequests.filter((r) => r.sessionId === session.id),
    [allPermissionRequests, session.id],
  );

  // Check if waiting for permission (to enable input)
  const isWaitingForPermission = permissionRequests.length > 0;

  // Build worker index map for consistent coloring
  const workerIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    session.workers.forEach((w, idx) => map.set(w.id, idx));
    return map;
  }, [session.workers]);

  // Create unified timeline with messages, permissions, tool calls, and plans (chronological)
  // Each item now includes worker attribution for tracing
  const timeline: TimelineItem[] = useMemo(() => {
    // Combine session messages with worker messages (with worker attribution)
    const allMessages: Array<Message & { source?: string; workerId?: string; workerIndex?: number }> = [
      ...(session.messages || []).map((m) => ({ ...m, source: "session" })),
      ...session.workers.flatMap((worker, workerIdx) =>
        (worker.messages || []).map((m) => ({
          ...m,
          source: worker.task.slice(0, 30),
          workerId: worker.id,
          workerIndex: workerIdx,
        })),
      ),
    ];

    // Get tool calls from workers with worker attribution
    const toolCalls = session.workers
      .flatMap((worker, workerIdx) =>
        (worker.toolCalls || []).map((tc) => ({
          ...tc,
          workerId: worker.id,
          workerIndex: workerIdx,
        }))
      )
      .filter((tc) => {
        // Always show pending/in_progress tool calls
        if (tc.status === "pending" || tc.status === "in_progress") return true;
        // For completed/failed, need at least a title
        return tc.title && tc.title.trim().length > 0;
      });

    // Get plans from workers with worker attribution
    const plans = session.workers
      .filter((w) => w.plan && w.plan.entries.length > 0)
      .map((w, idx) => ({
        ...w.plan!,
        timestamp: w.planTimestamp ?? w.createdAt,
        workerId: w.id,
        workerIndex: idx,
      }));

    // Get streaming outputs as separate items (one per worker)
    const streamingItems = session.workers
      .filter((w) => w.outputBuffer && w.outputBuffer.trim())
      .map((w, idx) => ({
        kind: "streaming" as const,
        data: {
          workerId: w.id,
          workerIndex: workerIndexMap.get(w.id) ?? idx,
          content: w.outputBuffer,
          timestamp: w.updatedAt || Date.now(),
        },
      }));

    const items: TimelineItem[] = [
      ...allMessages.map((m) => ({ kind: "message" as const, data: m })),
      ...permissionRequests.map((p) => ({
        kind: "permission" as const,
        data: p,
      })),
      ...toolCalls.map((tc) => ({ kind: "tool_call" as const, data: tc })),
      ...plans.map((p) => ({ kind: "plan" as const, data: p })),
      ...streamingItems,
    ];

    return items.sort((a, b) => a.data.timestamp - b.data.timestamp);
  }, [session.messages, session.workers, permissionRequests, workerIndexMap]);

  // Check if any worker has streaming output (for loading indicator)
  const hasStreamingOutput = session.workers.some(
    (w) => w.outputBuffer && w.outputBuffer.trim()
  );


  const handlePermissionResponse = async (
    workerId: string,
    toolCallId: string,
    optionId: string,
  ) => {
    try {
      await respondToPermission(workerId, optionId);
      removePermissionRequest(workerId, toolCallId);
    } catch (e) {
      console.error("Failed to respond to permission:", e);
    }
  };

  return (
    <div
      onClick={onFocus}
      onFocus={onFocus}
      className={cn(
        "flex flex-col h-full bg-card rounded border transition-colors",
        isActive
          ? "border-accent-orange/50 ring-1 ring-accent-orange/20"
          : "border-border hover:border-border/80",
        className,
      )}
    >
      {/* Header - ultra compact */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border shrink-0 bg-muted/20">
        <AgentIcon agentId={session.agentType} className="size-3.5 shrink-0" />
        <h3 className="text-[11px] truncate flex-1 text-foreground/80">
          {session.prompt}
        </h3>
        {/* Worker dots - overlapping, with dropdown on hover */}
        {session.workers.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center shrink-0 -space-x-1 hover:opacity-80 transition-opacity"
              >
                {session.workers.slice(0, 5).map((worker, idx) => {
                  const color = WORKER_COLORS[idx % WORKER_COLORS.length];
                  return (
                    <span
                      key={worker.id}
                      className={cn(
                        "size-2.5 rounded-full ring-1 ring-card",
                        color.bg
                      )}
                    />
                  );
                })}
                {session.workers.length > 5 && (
                  <span className="text-[8px] text-muted-foreground ml-1.5">+{session.workers.length - 5}</span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 bg-[#141414] border border-[#262626] shadow-xl"
            >
              <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground border-b border-[#262626]">
                {session.workers.length} Workers
              </div>
              {session.workers.map((worker, idx) => {
                const color = WORKER_COLORS[idx % WORKER_COLORS.length];
                return (
                  <DropdownMenuItem
                    key={worker.id}
                    className="text-xs cursor-default hover:bg-[#262626] gap-2"
                  >
                    <span className={cn("size-2 rounded-full shrink-0", color.bg)} />
                    <span className="truncate flex-1">{worker.task.slice(0, 40)}</span>
                    <span className="text-[9px] text-muted-foreground shrink-0">
                      {worker.status === "completed" ? "✓" : worker.status === "running" ? "●" : "○"}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {/* Mode toggle - icon only */}
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            const newMode = session.mode === "plan" ? "default" : "plan";

            const trySetMode = async () => {
              await setAcpSessionMode(session.id, newMode);
            };

            try {
              await trySetMode();
            } catch (error) {
              const errorStr = String(error);
              console.error("Failed to set mode:", errorStr);

              const isDeadSession =
                errorStr.includes("No active worker for session") ||
                errorStr.includes("not found");

              if (isDeadSession) {
                console.log("[Frontend] Session dead, reconnecting before mode change...");
                const agentId = session.agentType || "claude";
                const cwd = session.cwd || "/";

                try {
                  await reconnectWorker(session.id, agentId, cwd);
                  console.log("[Frontend] Worker reconnected, retrying mode change...");
                  await trySetMode();
                } catch (reconnectError) {
                  console.error("Reconnect failed:", reconnectError);
                }
              }
            }
          }}
          title={session.mode === "plan" ? "Plan mode" : "Default mode"}
          className={cn(
            "p-1 rounded transition-colors shrink-0",
            session.mode === "plan"
              ? "bg-accent-orange/20 text-accent-orange hover:bg-accent-orange/30"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {session.mode === "plan" ? (
            <FileText className="size-3" />
          ) : (
            <Zap className="size-3" />
          )}
        </button>
        {/* Settings dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-1 rounded hover:bg-muted transition-colors shrink-0 text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44 bg-[#141414] border border-[#262626] shadow-xl"
          >
            <DropdownMenuItem
              onClick={handleCopyAsMarkdown}
              className="text-xs cursor-pointer hover:bg-[#262626]"
            >
              <ClipboardCopy className="size-3.5" />
              Copy as Markdown
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleCopyAsRaw}
              className="text-xs cursor-pointer hover:bg-[#262626]"
            >
              <Braces className="size-3.5" />
              Copy as JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-[#262626]" />
            <DropdownMenuItem
              onClick={handleDelete}
              variant="destructive"
              className="text-xs cursor-pointer hover:bg-red-500/10"
            >
              <Trash2 className="size-3.5" />
              Delete session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
              {/* Unified chronological timeline with worker attribution */}
              {timeline.map((item, index) => {
                // Get worker color for dot indicator (only show for multi-worker sessions)
                const isMultiWorker = session.workers.length > 1;
                const workerIndex =
                  item.kind === "message" ? item.data.workerIndex :
                  item.kind === "tool_call" ? item.data.workerIndex :
                  item.kind === "plan" ? item.data.workerIndex :
                  item.kind === "streaming" ? item.data.workerIndex :
                  undefined;
                const workerColor = isMultiWorker && workerIndex !== undefined
                  ? WORKER_COLORS[workerIndex % WORKER_COLORS.length]
                  : null;

                if (item.kind === "message") {
                  const message = item.data;
                  // Show streaming indicator only for last assistant TEXT message while running
                  const isLastMessage = index === timeline.length - 1;
                  const isAssistantText =
                    message.role === "assistant" && message.type === "TEXT";
                  const showStreaming =
                    isRunning &&
                    isLastMessage &&
                    isAssistantText &&
                    !message.rendered;
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
                if (item.kind === "tool_call") {
                  const toolCall = item.data;
                  return (
                    <div key={toolCall.id} className="px-2 py-0.5 flex items-start gap-1.5">
                      {/* Worker dot */}
                      {workerColor && (
                        <span className={cn("size-1.5 rounded-full shrink-0 mt-2", workerColor.bg)} />
                      )}
                      <div className="flex-1 min-w-0">
                        <ToolCallCard toolCall={toolCall} />
                      </div>
                    </div>
                  );
                }
                if (item.kind === "plan") {
                  const plan = item.data;
                  return (
                    <div key={`plan-${plan.timestamp}`} className="flex items-start gap-1.5 px-2">
                      {/* Worker dot */}
                      {workerColor && (
                        <span className={cn("size-1.5 rounded-full shrink-0 mt-2", workerColor.bg)} />
                      )}
                      <div className="flex-1 min-w-0">
                        <PlanCard plan={plan} />
                      </div>
                    </div>
                  );
                }
                if (item.kind === "streaming") {
                  const streaming = item.data;
                  return (
                    <div key={`streaming-${streaming.workerId}`} className="flex items-start gap-1.5 px-2 py-1">
                      {/* Worker dot (colored for multi-worker, orange for single) */}
                      <span className={cn(
                        "size-1.5 rounded-full shrink-0 mt-1.5",
                        workerColor ? workerColor.bg : "bg-accent-orange/60",
                        isRunning && "animate-pulse"
                      )} />
                      <div className="streamdown-compact flex-1 min-w-0 overflow-hidden">
                        <Streamdown
                          plugins={{ code }}
                          isAnimating={isRunning}
                          caret="circle"
                          controls={false}
                        >
                          {streaming.content}
                        </Streamdown>
                      </div>
                    </div>
                  );
                }
                // Permission request
                const req = item.data as PermissionRequest;
                const permWorkerIndex = workerIndexMap.get(req.workerId);
                const permWorkerColor = permWorkerIndex !== undefined
                  ? WORKER_COLORS[permWorkerIndex % WORKER_COLORS.length]
                  : null;
                return (
                  <div
                    key={`${req.workerId}-${req.toolCallId}`}
                    className="mx-2 my-1 p-2 rounded border border-amber-500/50 bg-amber-500/5"
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      {/* Worker dot */}
                      {permWorkerColor && (
                        <span className={cn("size-1.5 rounded-full shrink-0", permWorkerColor.bg)} />
                      )}
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
                          onClick={() =>
                            handlePermissionResponse(
                              req.workerId,
                              req.toolCallId,
                              opt.id,
                            )
                          }
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                            opt.kind === "allow_once" ||
                              opt.kind === "allow_always"
                              ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                              : "bg-red-500/20 text-red-400 hover:bg-red-500/30",
                          )}
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {isRunning && !hasStreamingOutput && !isWaitingForPermission && (
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
          sessionId={session.id}
          onSubmit={handleFollowUp}
          onStop={handleStop}
          disabled={
            !onFollowUp ||
            session.status === "failed" ||
            session.status === "cancelled"
          }
          isLoading={isRunning && !isWaitingForPermission}
          autoFocus={isActive}
          placeholder={
            isWaitingForPermission
              ? "Type to cancel or wait..."
              : isRunning
                ? "Type while waiting..."
                : session.status === "failed"
                  ? "Failed"
                  : "Follow-up"
          }
        />
      </div>
    </div>
  );
}
