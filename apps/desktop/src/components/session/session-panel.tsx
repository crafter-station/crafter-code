"use client";

import { useState } from "react";
import {
  Play,
  Pause,
  Square,
  Plus,
  Clock,
  Zap,
  DollarSign,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@crafter-code/ui";
import { useAgentStore, type AgentSession, type SessionStatus } from "@/stores/agent-store";

interface SessionPanelProps {
  className?: string;
  onNewSession?: () => void;
}

export function SessionPanel({ className, onNewSession }: SessionPanelProps) {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    updateSession,
    getTotalCost,
  } = useAgentStore();

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const handlePauseResume = () => {
    if (!activeSession) return;
    const newStatus: SessionStatus =
      activeSession.status === "running" ? "paused" : "running";
    updateSession(activeSession.id, { status: newStatus });
  };

  const handleCancel = () => {
    if (!activeSession) return;
    updateSession(activeSession.id, { status: "cancelled" });
  };

  return (
    <div className={cn("flex flex-col h-full bg-sidebar", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Sessions
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onNewSession}
          className="text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No sessions yet.
            <br />
            <button
              type="button"
              onClick={onNewSession}
              className="text-accent-orange hover:underline mt-2 inline-block"
            >
              Start a new session
            </button>
          </div>
        ) : (
          sessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onClick={() => setActiveSession(session.id)}
            />
          ))
        )}
      </div>

      {/* Active Session Controls */}
      {activeSession && (
        <div className="border-t border-sidebar-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <StatusBadge status={activeSession.status} />
            <div className="flex items-center gap-1">
              {(activeSession.status === "running" ||
                activeSession.status === "paused") && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handlePauseResume}
                  >
                    {activeSession.status === "running" ? (
                      <Pause className="size-4" />
                    ) : (
                      <Play className="size-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleCancel}
                    className="text-destructive"
                  >
                    <Square className="size-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Zap className="size-3" />
              <span>
                {activeSession.iteration}/{activeSession.maxIterations}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-3" />
              <span>{formatTokens(activeSession.tokensUsed)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <DollarSign className="size-3" />
              <span>{formatCost(activeSession.costUsd)}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2">
            {activeSession.prompt}
          </p>
        </div>
      )}

      {/* Footer with total cost */}
      <div className="border-t border-sidebar-border px-4 py-2 text-xs text-muted-foreground">
        Total: ${getTotalCost().toFixed(4)}
      </div>
    </div>
  );
}

interface SessionItemProps {
  session: AgentSession;
  isActive: boolean;
  onClick: () => void;
}

function SessionItem({ session, isActive, onClick }: SessionItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded-md transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "hover:bg-sidebar-accent/50"
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <StatusDot status={session.status} />
        <span className="text-xs text-muted-foreground">
          {formatTime(session.createdAt)}
        </span>
      </div>
      <p className="text-sm truncate">{session.prompt}</p>
    </button>
  );
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const colors: Record<SessionStatus, string> = {
    pending: "bg-muted text-muted-foreground",
    running: "bg-accent-orange/20 text-accent-orange",
    paused: "bg-yellow-500/20 text-yellow-500",
    completed: "bg-green-500/20 text-green-500",
    failed: "bg-destructive/20 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };

  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded text-xs font-mono uppercase",
        colors[status]
      )}
    >
      {status}
    </span>
  );
}

function StatusDot({ status }: { status: SessionStatus }) {
  const colors: Record<SessionStatus, string> = {
    pending: "bg-muted-foreground",
    running: "bg-accent-orange animate-pulse",
    paused: "bg-yellow-500",
    completed: "bg-green-500",
    failed: "bg-destructive",
    cancelled: "bg-muted-foreground",
  };

  return <span className={cn("size-2 rounded-full", colors[status])} />;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}
