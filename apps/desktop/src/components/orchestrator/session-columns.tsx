"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Users } from "lucide-react";

import {
  type ImageAttachment,
  reconnectWorker,
  sendAcpPrompt,
  sendAcpPromptWithImages,
} from "@/lib/ipc/orchestrator";
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
    async (sessionId: string, message: string, images?: ImageAttachment[]) => {
      const originalSession = sessions.find((s) => s.id === sessionId);
      if (!originalSession) return;

      // Add user message to current session
      addSessionMessage(sessionId, {
        type: "TEXT",
        role: "user",
        content: images?.length
          ? `${message} [${images.length} image(s)]`
          : message,
        timestamp: Date.now(),
      });

      // Helper to send prompt (with or without images)
      const sendPrompt = async () => {
        if (images?.length) {
          await sendAcpPromptWithImages(sessionId, message, images);
        } else {
          await sendAcpPrompt(sessionId, message);
        }
      };

      try {
        // Send follow-up to existing ACP session (keeps CLI alive)
        await sendPrompt();
        // Response will stream back to the same session via worker events
      } catch (error) {
        const errorStr = String(error);
        console.error("Follow-up failed:", errorStr);

        // Check if this is a "dead session/worker" error (app was restarted)
        const isDeadSession =
          errorStr.includes("No active worker for session") ||
          errorStr.includes("not found");

        if (isDeadSession) {
          console.log("[Frontend] Session/worker dead, attempting to reconnect...");

          // Try to reconnect the worker
          const agentId = originalSession.agentType || "claude";
          const cwd = originalSession.cwd || process.env.HOME || "/";

          try {
            await reconnectWorker(sessionId, agentId, cwd);
            console.log("[Frontend] Worker reconnected, retrying prompt...");

            // Retry the prompt after reconnection
            await sendPrompt();
            return; // Success!
          } catch (reconnectError) {
            console.error("Reconnect failed:", reconnectError);
            addSessionMessage(sessionId, {
              type: "ERROR",
              role: "assistant",
              content: `Session expired. Failed to reconnect: ${String(reconnectError)}`,
              timestamp: Date.now(),
            });
            return;
          }
        }

        // Other errors: show to user
        addSessionMessage(sessionId, {
          type: "ERROR",
          role: "assistant",
          content: errorStr,
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
          canScrollLeft ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Session columns */}
      <div
        ref={scrollRef}
        className="flex-1 flex gap-1.5 overflow-x-auto p-1.5 scroll-smooth scrollbar-none"
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
          canScrollRight ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
