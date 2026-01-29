"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";

import { ArrowUp, Paperclip, X } from "lucide-react";
import { homeDir } from "@tauri-apps/api/path";

import {
  type ImageAttachment,
  createAcpSession,
  reconnectWorker,
  sendAcpPrompt,
  sendAcpPromptWithImages,
} from "@/lib/ipc/orchestrator";
import { cn } from "@/lib/utils";

import { useOrchestratorStore } from "@/stores/orchestrator-store";
import { SessionCard } from "./session-card";
import { CrafterCodeAscii } from "./crafter-code-ascii";

interface SessionColumnsProps {
  className?: string;
}

interface ImagePreview {
  id: string;
  data: string; // base64
  mimeType: string;
  preview: string; // data URL for display
}

export function SessionColumns({ className }: SessionColumnsProps) {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    removeSession,
    addSessionMessage,
    setSession,
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

  // Empty state input
  const [emptyPrompt, setEmptyPrompt] = useState("");
  const [isLaunching, setIsLaunching] = useState(false);
  const [images, setImages] = useState<ImagePreview[]>([]);
  const emptyInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Convert file to base64
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  // Add image from file
  const addImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;

      const base64 = await fileToBase64(file);
      const preview: ImagePreview = {
        id: crypto.randomUUID(),
        data: base64,
        mimeType: file.type,
        preview: `data:${file.type};base64,${base64}`,
      };
      setImages((prev) => [...prev, preview]);
    },
    [fileToBase64],
  );

  // Handle paste
  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await addImage(file);
          }
          return;
        }
      }
    },
    [addImage],
  );

  // Handle file input change
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      for (const file of files) {
        await addImage(file);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [addImage],
  );

  // Remove image
  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const handleEmptySubmit = useCallback(async () => {
    const hasContent = emptyPrompt.trim() || images.length > 0;
    if (!hasContent || isLaunching) return;

    setIsLaunching(true);
    try {
      let cwd: string;
      try {
        cwd = await homeDir();
      } catch {
        cwd = "/";
      }

      // Create session with text prompt first
      const session = await createAcpSession(
        images.length > 0 ? "" : emptyPrompt, // Empty prompt if we'll send with images
        "claude",
        cwd
      );

      setSession(session);
      setActiveSession(session.id);

      // If we have images, send the full prompt with images as first message
      if (images.length > 0) {
        const attachments: ImageAttachment[] = images.map((img) => ({
          data: img.data,
          mime_type: img.mimeType,
        }));

        addSessionMessage(session.id, {
          type: "TEXT",
          role: "user",
          content: `${emptyPrompt} [${images.length} image(s)]`,
          timestamp: Date.now(),
        });

        await sendAcpPromptWithImages(session.id, emptyPrompt, attachments);
      } else {
        addSessionMessage(session.id, {
          type: "TEXT",
          role: "user",
          content: emptyPrompt,
          timestamp: Date.now(),
        });
      }

      setEmptyPrompt("");
      setImages([]);
    } catch (err) {
      console.error("[SessionColumns] Failed to create session:", err);
    } finally {
      setIsLaunching(false);
    }
  }, [emptyPrompt, images, isLaunching, setSession, addSessionMessage, setActiveSession]);

  const handleEmptyKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleEmptySubmit();
      }
    },
    [handleEmptySubmit]
  );

  const canSubmit = (emptyPrompt.trim() || images.length > 0) && !isLaunching;

  if (sessions.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="flex flex-col items-center gap-8 w-full max-w-xl px-4">
          <CrafterCodeAscii />

          {/* Input container */}
          <div className="w-full max-w-md space-y-2">
            {/* Image previews */}
            {images.length > 0 && (
              <div className="flex gap-2 flex-wrap px-1">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="relative group size-14 rounded-lg border border-border overflow-hidden bg-muted/50"
                  >
                    {/* biome-ignore lint/a11y/useAltText: preview */}
                    {/* biome-ignore lint/performance/noImgElement: base64 */}
                    <img
                      src={img.preview}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="absolute -top-1 -right-1 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input row */}
            <div className="relative flex items-end gap-2">
              {/* Attachment button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLaunching}
                className={cn(
                  "p-2.5 rounded-lg transition-colors shrink-0",
                  "border border-border bg-background/80",
                  "hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed",
                  "text-muted-foreground hover:text-foreground",
                )}
                title="Attach image (or paste with Cmd+V)"
              >
                <Paperclip className="size-4" />
              </button>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Text input */}
              <div className="relative flex-1">
                <textarea
                  ref={emptyInputRef}
                  value={emptyPrompt}
                  onChange={(e) => setEmptyPrompt(e.target.value)}
                  onKeyDown={handleEmptyKeyDown}
                  onPaste={handlePaste}
                  disabled={isLaunching}
                  placeholder="What do you want to build?"
                  rows={1}
                  className={cn(
                    "w-full resize-none rounded-lg border border-border bg-background/80 px-4 py-3 pr-12",
                    "text-sm placeholder:text-muted-foreground/40",
                    "focus:outline-none focus:ring-2 focus:ring-accent-orange/30 focus:border-accent-orange/50",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "transition-all"
                  )}
                  style={{ minHeight: "48px", maxHeight: "120px" }}
                />
                <button
                  type="button"
                  onClick={handleEmptySubmit}
                  disabled={!canSubmit}
                  className={cn(
                    "absolute right-2 bottom-2",
                    "p-2 rounded-md transition-all",
                    "disabled:opacity-30 disabled:cursor-not-allowed",
                    canSubmit
                      ? "bg-accent-orange text-white hover:bg-accent-orange/90"
                      : "bg-muted text-muted-foreground",
                  )}
                  title="Send (Enter)"
                >
                  <ArrowUp className="size-4" />
                </button>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground/40">
            Press Enter to launch with Claude
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
