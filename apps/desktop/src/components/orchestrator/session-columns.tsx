"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";

import { ArrowUp, ChevronDown, FileText, ImagePlus, PanelLeft, X } from "lucide-react";
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

import type { AvailableCommand } from "@/stores/orchestrator-store";
import { useOrchestratorStore } from "@/stores/orchestrator-store";
import { SessionCard } from "./session-card";
import { AgentIcon } from "./agent-icons";
import { CommandAutocomplete } from "./command-autocomplete";
import { CrafterCodeAscii } from "./crafter-code-ascii";

interface SessionColumnsProps {
  className?: string;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
}

interface ImagePreview {
  id: string;
  data: string;
  mimeType: string;
  preview: string;
}

interface TextAttachment {
  id: string;
  content: string;
  lineCount: number;
}

const LARGE_TEXT_THRESHOLD = 200;
const LARGE_TEXT_LINES_THRESHOLD = 5;

export function SessionColumns({ className, showSidebar, onToggleSidebar }: SessionColumnsProps) {
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
  const [textAttachments, setTextAttachments] = useState<TextAttachment[]>([]);
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

  // Default commands (shown when no ACP commands available)
  const defaultCommands: AvailableCommand[] = useMemo(() => [
    { name: "help", description: "Get help with using the agent", source: "builtin" },
    { name: "init", description: "Initialize a new project in the current directory", source: "builtin" },
    { name: "status", description: "Show current git status and project state", source: "builtin" },
    { name: "plan", description: "Create an execution plan before making changes", source: "builtin", input: { hint: "describe what to build" } },
    { name: "review", description: "Review recent changes and suggest improvements", source: "builtin" },
    { name: "test", description: "Run tests and show results", source: "builtin" },
    { name: "commit", description: "Stage and commit changes with a message", source: "builtin", input: { hint: "commit message" } },
    { name: "pr", description: "Create a pull request from current changes", source: "builtin", input: { hint: "PR title" } },
  ], []);

  // Get available commands from any previous sessions, fallback to defaults
  const availableCommands = useMemo(() => {
    const commandMap = new Map<string, AvailableCommand>();

    // First add commands from sessions
    for (const session of sessions) {
      for (const worker of session.workers) {
        for (const cmd of worker.availableCommands || []) {
          if (!commandMap.has(cmd.name)) {
            commandMap.set(cmd.name, cmd);
          }
        }
      }
    }

    // If no commands from sessions, use defaults
    if (commandMap.size === 0) {
      return defaultCommands;
    }

    return Array.from(commandMap.values());
  }, [sessions, defaultCommands]);

  // Handle command selection from autocomplete
  const handleSelectCommand = useCallback((cmd: AvailableCommand) => {
    const newValue = `/${cmd.name}${cmd.input?.hint ? " " : ""}`;
    setEmptyPrompt(newValue);
    emptyInputRef.current?.focus();
  }, []);

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

  // Check if text is large
  const isLargeText = useCallback((text: string): boolean => {
    const lineCount = text.split("\n").length;
    return text.length > LARGE_TEXT_THRESHOLD || lineCount > LARGE_TEXT_LINES_THRESHOLD;
  }, []);

  // Add text attachment
  const addTextAttachment = useCallback((text: string) => {
    const lineCount = text.split("\n").length;
    setTextAttachments((prev) => [...prev, {
      id: crypto.randomUUID(),
      content: text,
      lineCount,
    }]);
  }, []);

  // Remove text attachment
  const removeTextAttachment = useCallback((id: string) => {
    setTextAttachments((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Handle paste
  const handlePaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      // Check for image first
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

      // Check for large text
      const text = e.clipboardData?.getData("text/plain");
      if (text && isLargeText(text)) {
        e.preventDefault();
        addTextAttachment(text);
      }
    },
    [addImage, isLargeText, addTextAttachment],
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
    const hasContent = emptyPrompt.trim() || images.length > 0 || textAttachments.length > 0;
    if (!hasContent || isLaunching) return;

    setIsLaunching(true);
    try {
      let cwd: string;
      try {
        cwd = await homeDir();
      } catch {
        cwd = "/";
      }

      // Combine prompt with text attachments
      let fullPrompt = emptyPrompt;
      if (textAttachments.length > 0) {
        const attachmentTexts = textAttachments.map((t, i) =>
          `<attachment${textAttachments.length > 1 ? ` ${i + 1}` : ""}>\n${t.content}\n</attachment${textAttachments.length > 1 ? ` ${i + 1}` : ""}>`
        ).join("\n\n");
        fullPrompt = fullPrompt.trim()
          ? `${fullPrompt}\n\n${attachmentTexts}`
          : attachmentTexts;
      }

      const session = await createAcpSession(
        images.length > 0 ? "" : fullPrompt,
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

        const attachmentInfo = [
          images.length > 0 ? `${images.length} image(s)` : null,
          textAttachments.length > 0 ? `${textAttachments.length} text attachment(s)` : null,
        ].filter(Boolean).join(", ");

        addSessionMessage(session.id, {
          type: "TEXT",
          role: "user",
          content: `${emptyPrompt}${attachmentInfo ? ` [${attachmentInfo}]` : ""}`,
          timestamp: Date.now(),
        });

        await sendAcpPromptWithImages(session.id, fullPrompt, attachments);
      } else {
        const attachmentInfo = textAttachments.length > 0
          ? ` [${textAttachments.length} text attachment(s)]`
          : "";

        addSessionMessage(session.id, {
          type: "TEXT",
          role: "user",
          content: `${emptyPrompt}${attachmentInfo}`,
          timestamp: Date.now(),
        });
      }

      setEmptyPrompt("");
      setImages([]);
      setTextAttachments([]);
    } catch (err) {
      console.error("[SessionColumns] Failed to create session:", err);
    } finally {
      setIsLaunching(false);
    }
  }, [emptyPrompt, images, textAttachments, isLaunching, selectedAgentId, selectedModelId, setSession, addSessionMessage, setActiveSession]);

  const handleEmptyKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleEmptySubmit();
      }
    },
    [handleEmptySubmit]
  );

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setShowAgentDropdown(false);
      setShowModelDropdown(false);
    };
    if (showAgentDropdown || showModelDropdown) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showAgentDropdown, showModelDropdown]);

  const canSubmit = (emptyPrompt.trim() || images.length > 0 || textAttachments.length > 0) && !isLaunching;

  if (sessions.length === 0) {
    return (
      <div className={cn("relative flex flex-col h-full", className)}>
        {/* Sidebar toggle button when sidebar is hidden */}
        {!showSidebar && onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="absolute top-3 left-3 p-1.5 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground z-10"
            title="Show sidebar"
          >
            <PanelLeft className="size-4" />
          </button>
        )}

        {/* Centered content */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-[560px] px-6">
            {/* Logo */}
            <div className="flex justify-center mb-8">
              <CrafterCodeAscii />
            </div>

            {/* Input container */}
            <div className="space-y-3">
              {/* Main input */}
              <div className="rounded-xl border border-border bg-card shadow-sm">
                {/* Attachments preview - inside the card */}
                {(images.length > 0 || textAttachments.length > 0) && (
                  <div className="flex gap-3 flex-wrap p-3 pb-0">
                    {/* Image attachments */}
                    {images.map((img) => (
                      <div
                        key={img.id}
                        className="relative group size-24 rounded-lg border border-border overflow-hidden bg-muted/30"
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
                          className="absolute top-1 right-1 size-6 rounded-full bg-background/80 border border-border text-muted-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground hover:bg-background"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    {/* Text attachments */}
                    {textAttachments.map((text) => (
                      <div
                        key={text.id}
                        className="relative group h-24 min-w-24 max-w-48 rounded-lg border border-border overflow-hidden bg-muted/30 flex flex-col"
                      >
                        <div className="flex-1 flex items-center justify-center">
                          <FileText className="size-8 text-muted-foreground/60" />
                        </div>
                        <div className="px-2 pb-2 text-center">
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {text.lineCount} lines
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTextAttachment(text.id)}
                          className="absolute top-1 right-1 size-6 rounded-full bg-background/80 border border-border text-muted-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground hover:bg-background"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Textarea with command autocomplete */}
                <div className="relative">
                  <CommandAutocomplete
                    commands={availableCommands}
                    inputValue={emptyPrompt}
                    onSelectCommand={handleSelectCommand}
                    inputRef={emptyInputRef}
                  />
                  <textarea
                    ref={emptyInputRef}
                    value={emptyPrompt}
                    onChange={(e) => setEmptyPrompt(e.target.value)}
                    onKeyDown={handleEmptyKeyDown}
                    onPaste={handlePaste}
                    disabled={isLaunching}
                    placeholder="What do you want to build?"
                    rows={2}
                    className={cn(
                      "w-full resize-none bg-transparent px-4 pt-4 pb-2",
                      "text-[15px] placeholder:text-muted-foreground/50",
                      "focus:outline-none",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                    style={{ minHeight: "72px", maxHeight: "200px" }}
                  />
                </div>

                {/* Bottom toolbar */}
                <div className="flex items-center gap-0.5 px-2 pb-2">
                  {/* Agent select */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAgentDropdown(!showAgentDropdown);
                        setShowModelDropdown(false);
                      }}
                      className="flex items-center gap-1.5 h-7 px-2 rounded-md hover:bg-muted transition-colors text-xs"
                    >
                      {selectedAgent && (
                        <AgentIcon agentId={selectedAgentId} className="size-4" />
                      )}
                      <span className="text-muted-foreground">{selectedAgent?.name || "Agent"}</span>
                      <ChevronDown className="size-3 text-muted-foreground/50" />
                    </button>

                    {showAgentDropdown && (
                      <div className="absolute top-full left-0 mt-1 py-1 bg-popover border border-border rounded-lg shadow-lg z-50 min-w-[160px]">
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
                              "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors",
                              agent.id === selectedAgentId && "bg-muted"
                            )}
                          >
                            <AgentIcon agentId={agent.id} className="size-4" />
                            <span>{agent.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Model select */}
                  {selectedAgent && selectedAgent.models.length > 1 && (
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowModelDropdown(!showModelDropdown);
                          setShowAgentDropdown(false);
                        }}
                        className="flex items-center gap-1 h-7 px-2 rounded-md hover:bg-muted transition-colors text-xs"
                      >
                        <span className="text-muted-foreground">{selectedModel?.name || "Model"}</span>
                        <ChevronDown className="size-3 text-muted-foreground/50" />
                      </button>

                      {showModelDropdown && (
                        <div className="absolute top-full left-0 mt-1 py-1 bg-popover border border-border rounded-lg shadow-lg z-50 min-w-[180px]">
                          {selectedAgent.models.map((model) => (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                setSelectedModelId(model.id);
                                setShowModelDropdown(false);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted transition-colors text-left",
                                model.id === selectedModelId && "bg-muted"
                              )}
                            >
                              <span>{model.name}</span>
                              {model.id === selectedAgent.default_model && (
                                <span className="text-[10px] text-muted-foreground">default</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex-1" />

                  {/* Image button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLaunching}
                    className={cn(
                      "size-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors",
                      "text-muted-foreground/60 hover:text-muted-foreground",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                    )}
                    title="Attach image"
                  >
                    <ImagePlus className="size-4" />
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {/* Submit */}
                  <button
                    type="button"
                    onClick={handleEmptySubmit}
                    disabled={!canSubmit}
                    className={cn(
                      "size-7 flex items-center justify-center rounded-md transition-all",
                      "disabled:opacity-30 disabled:cursor-not-allowed",
                      canSubmit
                        ? "bg-foreground text-background hover:opacity-90"
                        : "bg-muted text-muted-foreground",
                    )}
                    title="Send"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                </div>
              </div>

              {/* Quick actions */}
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
                <span>Press</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">Enter</kbd>
                <span>to send</span>
                <span className="text-muted-foreground/30">·</span>
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">Shift+Enter</kbd>
                <span>for new line</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative flex h-full", className)}>
      {/* Sidebar toggle when hidden */}
      {!showSidebar && onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          className="absolute top-2 left-2 p-1.5 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground z-10"
          title="Show sidebar"
        >
          <PanelLeft className="size-4" />
        </button>
      )}

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
