"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";

import { ArrowUp, ChevronDown, ImagePlus, X } from "lucide-react";
import { homeDir } from "@tauri-apps/api/path";

import {
  type ImageAttachment,
  type AgentConfig,
  createAcpSession,
  listAvailableAgents,
  reconnectWorker,
  sendAcpPrompt,
  sendAcpPromptWithImages,
} from "@/lib/ipc/orchestrator";
import { cn } from "@/lib/utils";

import { useOrchestratorStore } from "@/stores/orchestrator-store";
import { SessionCard } from "./session-card";
import { CrafterCodeAscii } from "./crafter-code-ascii";
import { AgentIcon } from "./agent-icons";

interface SessionColumnsProps {
  className?: string;
}

interface ImagePreview {
  id: string;
  data: string;
  mimeType: string;
  preview: string;
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

      addSessionMessage(sessionId, {
        type: "TEXT",
        role: "user",
        content: images?.length
          ? `${message} [${images.length} image(s)]`
          : message,
        timestamp: Date.now(),
      });

      const sendPrompt = async () => {
        if (images?.length) {
          await sendAcpPromptWithImages(sessionId, message, images);
        } else {
          await sendAcpPrompt(sessionId, message);
        }
      };

      try {
        await sendPrompt();
      } catch (error) {
        const errorStr = String(error);
        console.error("Follow-up failed:", errorStr);

        const isDeadSession =
          errorStr.includes("No active worker for session") ||
          errorStr.includes("not found");

        if (isDeadSession) {
          console.log("[Frontend] Session/worker dead, attempting to reconnect...");

          const agentId = originalSession.agentType || "claude";
          const cwd = originalSession.cwd || process.env.HOME || "/";

          try {
            await reconnectWorker(sessionId, agentId, cwd);
            console.log("[Frontend] Worker reconnected, retrying prompt...");
            await sendPrompt();
            return;
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

  // Agent/Model selection
  const [availableAgents, setAvailableAgents] = useState<AgentConfig[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("claude");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Load available agents
  useEffect(() => {
    async function loadAgents() {
      try {
        const agents = await listAvailableAgents();
        setAvailableAgents(agents);
        const defaultAgent = agents.find((a) => a.id === "claude") || agents[0];
        if (defaultAgent) {
          setSelectedAgentId(defaultAgent.id);
          setSelectedModelId(defaultAgent.default_model || "");
        }
      } catch (err) {
        console.error("[SessionColumns] Failed to load agents:", err);
      }
    }
    loadAgents();
  }, []);

  const selectedAgent = availableAgents.find((a) => a.id === selectedAgentId);
  const selectedModel = selectedAgent?.models.find((m) => m.id === selectedModelId)
    || selectedAgent?.models.find((m) => m.id === selectedAgent.default_model)
    || selectedAgent?.models[0];

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

      // Create session with selected agent and model
      const session = await createAcpSession(
        images.length > 0 ? "" : emptyPrompt,
        selectedAgentId,
        cwd,
        selectedModelId || undefined
      );

      setSession(session);
      setActiveSession(session.id);

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
  }, [emptyPrompt, images, isLaunching, selectedAgentId, selectedModelId, setSession, addSessionMessage, setActiveSession]);

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
        <div className="flex flex-col items-center gap-6 w-full max-w-2xl px-4">
          <CrafterCodeAscii />

          {/* Input container */}
          <div className="w-full">
            {/* Image previews */}
            {images.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-2 px-3">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="relative group size-10 rounded border border-border/50 overflow-hidden bg-muted/30"
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
                      className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="size-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Main input box */}
            <div className="rounded-lg border border-border/50 bg-background/60 focus-within:border-border transition-all">
              {/* Text input */}
              <textarea
                ref={emptyInputRef}
                value={emptyPrompt}
                onChange={(e) => setEmptyPrompt(e.target.value)}
                onKeyDown={handleEmptyKeyDown}
                onPaste={handlePaste}
                disabled={isLaunching}
                placeholder='Ask anything... "Help me debug this issue"'
                rows={1}
                className={cn(
                  "w-full resize-none bg-transparent px-3 py-3",
                  "text-sm placeholder:text-muted-foreground/40",
                  "focus:outline-none",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
                style={{ minHeight: "44px", maxHeight: "120px" }}
              />

              {/* Bottom bar with selects and buttons */}
              <div className="flex items-center gap-1 px-2 pb-2">
                {/* Agent select */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAgentDropdown(!showAgentDropdown);
                      setShowModelDropdown(false);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/50 transition-colors text-xs text-muted-foreground"
                  >
                    {selectedAgent && (
                      <AgentIcon agentId={selectedAgentId} className="size-3.5" />
                    )}
                    <span>{selectedAgent?.name || "Agent"}</span>
                    <ChevronDown className="size-3 opacity-50" />
                  </button>

                  {showAgentDropdown && (
                    <div className="absolute bottom-full left-0 mb-1 py-1 bg-popover border border-border rounded-md shadow-lg z-50 min-w-[140px]">
                      {availableAgents.filter(a => a.available).map((agent) => (
                        <button
                          key={agent.id}
                          type="button"
                          onClick={() => {
                            setSelectedAgentId(agent.id);
                            setSelectedModelId(agent.default_model || "");
                            setShowAgentDropdown(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors",
                            agent.id === selectedAgentId && "bg-accent-orange/10 text-accent-orange"
                          )}
                        >
                          <AgentIcon agentId={agent.id} className="size-4" />
                          {agent.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Model select */}
                {selectedAgent && selectedAgent.models.length > 1 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowModelDropdown(!showModelDropdown);
                        setShowAgentDropdown(false);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted/50 transition-colors text-xs text-muted-foreground"
                    >
                      <span>{selectedModel?.name || "Model"}</span>
                      <ChevronDown className="size-3 opacity-50" />
                    </button>

                    {showModelDropdown && (
                      <div className="absolute bottom-full left-0 mb-1 py-1 bg-popover border border-border rounded-md shadow-lg z-50 min-w-[160px]">
                        {selectedAgent.models.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => {
                              setSelectedModelId(model.id);
                              setShowModelDropdown(false);
                            }}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left",
                              model.id === selectedModelId && "bg-accent-orange/10 text-accent-orange"
                            )}
                          >
                            <span>{model.name}</span>
                            {model.id === selectedAgent.default_model && (
                              <span className="text-[10px] text-muted-foreground/50 ml-auto">default</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Default label (when using default model) */}
                {selectedModel?.id === selectedAgent?.default_model && (
                  <span className="text-xs text-muted-foreground/40 px-1">Default</span>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Image attachment button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLaunching}
                  className={cn(
                    "p-1.5 rounded hover:bg-muted/50 transition-colors",
                    "text-muted-foreground/50 hover:text-muted-foreground",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                  )}
                  title="Attach image"
                >
                  <ImagePlus className="size-4" />
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

                {/* Submit button */}
                <button
                  type="button"
                  onClick={handleEmptySubmit}
                  disabled={!canSubmit}
                  className={cn(
                    "p-1.5 rounded transition-all",
                    "disabled:opacity-20 disabled:cursor-not-allowed",
                    canSubmit
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "bg-muted text-muted-foreground",
                  )}
                  title="Send"
                >
                  <ArrowUp className="size-4" />
                </button>
              </div>
            </div>
          </div>
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
