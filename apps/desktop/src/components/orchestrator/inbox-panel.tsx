"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCheck,
  Inbox,
  Loader2,
  MessageSquare,
  Send,
  Users,
  Bot,
  Crown,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  inboxRead,
  inboxWrite,
  inboxBroadcast,
  inboxMarkAllRead,
  inboxGetWorkers,
  inboxCount,
  type Message,
} from "@/lib/ipc/inbox";

// Helper to get a friendly worker name
function getWorkerLabel(workerId: string, index: number): string {
  if (workerId === "user") return "You";
  if (workerId === "system") return "System";
  if (workerId.includes("leader")) return "Leader";
  // For worker IDs, show "Worker 1", "Worker 2", etc.
  return `Worker ${index + 1}`;
}

// Get worker icon
function WorkerIcon({
  workerId,
  className,
}: { workerId: string; className?: string }) {
  if (workerId.includes("leader")) {
    return <Crown className={cn("size-3", className)} />;
  }
  return <Bot className={cn("size-3", className)} />;
}

interface InboxPanelProps {
  sessionId: string;
  className?: string;
}

export function InboxPanel({ sessionId, className }: InboxPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [workers, setWorkers] = useState<string[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Fetch messages and workers
  const fetchData = useCallback(async () => {
    try {
      const [workerList, count] = await Promise.all([
        inboxGetWorkers(sessionId),
        // Get total unread across all workers (use first worker or "system")
        inboxCount(sessionId, "system", true).catch(() => 0),
      ]);

      setWorkers(workerList);
      setUnreadCount(count);

      // If a worker is selected, fetch their messages
      if (selectedWorker) {
        const msgs = await inboxRead(sessionId, selectedWorker, false);
        setMessages(msgs);
      } else {
        // Show all messages (aggregate)
        const allMessages: Message[] = [];
        for (const worker of workerList) {
          const msgs = await inboxRead(sessionId, worker, false);
          allMessages.push(...msgs);
        }
        // Sort by timestamp
        allMessages.sort((a, b) => a.timestamp - b.timestamp);
        setMessages(allMessages);
      }
    } catch (e) {
      console.error("Failed to fetch inbox:", e);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, selectedWorker]);

  // Poll for updates
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Send message
  const handleSend = async () => {
    if (!newMessage.trim()) return;

    setIsSending(true);
    try {
      if (selectedWorker) {
        // Send to specific worker
        await inboxWrite(sessionId, "user", selectedWorker, newMessage.trim());
      } else {
        // Broadcast to all
        await inboxBroadcast(sessionId, "user", newMessage.trim());
      }
      setNewMessage("");
      fetchData();
    } catch (e) {
      console.error("Failed to send message:", e);
    } finally {
      setIsSending(false);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      for (const worker of workers) {
        await inboxMarkAllRead(sessionId, worker);
      }
      fetchData();
    } catch (e) {
      console.error("Failed to mark as read:", e);
    }
  };

  // Format message content based on type
  const formatMessage = (msg: Message) => {
    const msgType = msg.message;
    switch (msgType.type) {
      case "text":
        return msgType.content;
      case "shutdown_request":
        return `Shutdown request: ${msgType.reason}`;
      case "shutdown_approved":
        return "Shutdown approved";
      case "shutdown_rejected":
        return `Shutdown rejected: ${msgType.reason}`;
      case "idle_notification":
        return `Idle${msgType.completedTaskId ? ` (completed #${msgType.completedTaskId})` : ""}`;
      case "task_completed":
        return `Completed: ${msgType.taskSubject}`;
      case "plan_approval_request":
        return `Plan approval needed`;
      case "plan_approved":
        return "Plan approved";
      case "plan_rejected":
        return `Plan rejected: ${msgType.feedback}`;
      case "custom":
        return `[${msgType.action}]`;
      default:
        return "[Unknown message]";
    }
  };

  // Get message type icon/color
  const getMessageStyle = (msg: Message) => {
    const msgType = msg.message.type;
    switch (msgType) {
      case "shutdown_request":
      case "shutdown_rejected":
        return { color: "text-red-400", bg: "bg-red-500/10" };
      case "shutdown_approved":
      case "plan_approved":
      case "task_completed":
        return { color: "text-green-400", bg: "bg-green-500/10" };
      case "idle_notification":
        return { color: "text-amber-400", bg: "bg-amber-500/10" };
      case "plan_approval_request":
        return { color: "text-blue-400", bg: "bg-blue-500/10" };
      default:
        return { color: "text-foreground", bg: "" };
    }
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-foreground">Inbox</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-accent-orange/20 text-accent-orange">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Mark all as read"
          >
            <CheckCheck className="size-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Worker filter tabs */}
      {workers.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedWorker(null)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] shrink-0 transition-colors",
              !selectedWorker
                ? "bg-accent-orange/20 text-accent-orange"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Users className="size-3" />
            All
          </button>
          {workers.map((worker, idx) => (
            <button
              key={worker}
              type="button"
              onClick={() => setSelectedWorker(worker)}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] shrink-0 transition-colors",
                selectedWorker === worker
                  ? "bg-accent-orange/20 text-accent-orange"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              <WorkerIcon workerId={worker} />
              {getWorkerLabel(worker, idx)}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Inbox className="size-6 text-muted-foreground/40 mb-2" />
            <p className="text-[11px] text-muted-foreground">No messages yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Workers will communicate here
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1.5">
            {messages.map((msg) => {
              const style = getMessageStyle(msg);
              const isFromUser = msg.from === "user";
              const fromIdx = workers.indexOf(msg.from);
              const toIdx = workers.indexOf(msg.to);
              const fromLabel = getWorkerLabel(msg.from, fromIdx);
              const toLabel =
                msg.to === "broadcast" ? "Everyone" : getWorkerLabel(msg.to, toIdx);

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex flex-col p-2 rounded-md",
                    style.bg || "bg-muted/30",
                    !msg.read && "border-l-2 border-accent-orange"
                  )}
                >
                  {/* Header */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="flex items-center gap-1">
                      {!isFromUser && <WorkerIcon workerId={msg.from} className="text-muted-foreground" />}
                      <span
                        className={cn(
                          "text-[10px] font-medium",
                          isFromUser ? "text-blue-400" : msg.from.includes("leader") ? "text-amber-400" : "text-foreground/80"
                        )}
                      >
                        {fromLabel}
                      </span>
                    </div>
                    <span className="text-[9px] text-muted-foreground/50">→</span>
                    <span className="text-[10px] text-muted-foreground">
                      {toLabel}
                    </span>
                    <span className="text-[9px] text-muted-foreground/40 ml-auto">
                      {new Date(
                        msg.timestamp < 10000000000
                          ? msg.timestamp * 1000
                          : msg.timestamp
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {/* Content */}
                  <p className={cn("text-[11px] leading-relaxed", style.color)}>
                    {formatMessage(msg)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Compose */}
      <div className="px-2 py-1.5 border-t border-border">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="size-3 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              selectedWorker
                ? `Message ${getWorkerLabel(selectedWorker, workers.indexOf(selectedWorker))}...`
                : "Broadcast to all workers..."
            }
            className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!newMessage.trim() || isSending}
            className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            ) : (
              <Send className="size-3 text-accent-orange" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
