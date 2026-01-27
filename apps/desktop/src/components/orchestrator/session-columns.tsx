"use client";

import { useCallback, useRef, useState, useEffect } from "react";

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

  // Scroll state for fade indicators
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();
    el.addEventListener("scroll", updateScrollState);

    // Also check on resize
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState, sessions.length]);

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
    <div className={cn("relative flex h-full", className)}>
      {/* Left fade indicator */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background/60 to-transparent z-10 pointer-events-none transition-opacity duration-200",
          canScrollLeft ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Session columns */}
      <div
        ref={scrollRef}
        className="flex-1 flex gap-1.5 overflow-x-auto p-1.5 scroll-smooth"
      >
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

      {/* Right fade indicator */}
      <div
        className={cn(
          "absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background/60 to-transparent z-10 pointer-events-none transition-opacity duration-200",
          canScrollRight ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
