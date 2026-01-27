"use client";

import { useCallback } from "react";

import { Users } from "lucide-react";

import { sendAcpPrompt } from "@/lib/ipc/orchestrator";
import { cn } from "@/lib/utils";

import { useOrchestratorStore } from "@/stores/orchestrator-store";
import { SessionCard } from "./session-card";

interface SessionColumnsProps {
  className?: string;
}

export function SessionColumns({ className }: SessionColumnsProps) {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    removeSession,
    addSessionMessage,
  } = useOrchestratorStore();

  const handleCloseSession = useCallback(
    (sessionId: string) => {
      removeSession(sessionId);
    },
    [removeSession],
  );

  const handleFollowUp = useCallback(
    async (sessionId: string, message: string) => {
      const originalSession = sessions.find((s) => s.id === sessionId);
      if (!originalSession) return;

      // Add user message to current session
      addSessionMessage(sessionId, {
        type: "TEXT",
        role: "user",
        content: message,
        timestamp: Date.now(),
      });

      try {
        // Send follow-up to existing ACP session (keeps CLI alive)
        await sendAcpPrompt(sessionId, message);
        // Response will stream back to the same session via worker events
      } catch (error) {
        console.error("Follow-up failed:", error);
        addSessionMessage(sessionId, {
          type: "ERROR",
          role: "assistant",
          content: String(error),
          timestamp: Date.now(),
        });
      }
    },
    [sessions, addSessionMessage],
  );

  if (sessions.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center">
          <Users className="size-8 mx-auto mb-2 text-muted-foreground/20" />
          <p className="text-xs text-muted-foreground/60">
            Launch an agent to start
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full", className)}>
      {/* Session columns */}
      <div className="flex-1 flex gap-1.5 overflow-x-auto p-1.5">
        {sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onClose={() => handleCloseSession(session.id)}
            onFollowUp={handleFollowUp}
            onFocus={() => setActiveSession(session.id)}
            className="flex-shrink-0 w-[280px] min-w-[240px]"
          />
        ))}
      </div>
    </div>
  );
}
