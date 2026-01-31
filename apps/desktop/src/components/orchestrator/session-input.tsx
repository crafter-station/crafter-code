"use client";

import {
  type ClipboardEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@crafter-code/ui";
import { ArrowUp, FileText, Paperclip, Square, X } from "lucide-react";

import type { ImageAttachment } from "@/lib/ipc/orchestrator";
import { cn } from "@/lib/utils";

import type { AvailableCommand } from "@/stores/orchestrator-store";
import { useOrchestratorStore } from "@/stores/orchestrator-store";
import { CommandAutocomplete } from "./command-autocomplete";

interface SessionInputProps {
  sessionId: string;
  onSubmit: (message: string, images?: ImageAttachment[]) => void;
  onStop?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

interface ImagePreview {
  id: string;
  data: string; // base64
  mimeType: string;
  preview: string; // data URL for display
}

interface TextAttachment {
  id: string;
  content: string;
  lineCount: number;
}

// Threshold for large text detection
const LARGE_TEXT_THRESHOLD = 200; // characters
const LARGE_TEXT_LINES_THRESHOLD = 5; // lines
const MAX_TEXTAREA_ROWS = 4;

export function SessionInput({
  sessionId,
  onSubmit,
  onStop,
  disabled,
  isLoading,
  placeholder = "Follow-up...",
  autoFocus,
  className,
}: SessionInputProps) {
  const [value, setValue] = useState("");
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [textAttachments, setTextAttachments] = useState<TextAttachment[]>([]);
  const [viewingText, setViewingText] = useState<TextAttachment | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pendingInput, clearPendingInput, getSession, workspaceCommands } = useOrchestratorStore();

  // Get session info for context
  const session = getSession(sessionId);

  // Combine workspace commands (from store, loaded by sidebar) with ACP commands from session workers
  const availableCommands = useMemo(() => {
    const commandMap = new Map<string, AvailableCommand>();

    // First add workspace commands
    for (const cmd of workspaceCommands) {
      commandMap.set(cmd.name, cmd);
    }

    // Then add/override with commands from session workers (ACP AvailableCommandsUpdate)
    if (session) {
      for (const worker of session.workers) {
        for (const cmd of worker.availableCommands || []) {
          commandMap.set(cmd.name, cmd);
        }
      }
    }

    return Array.from(commandMap.values());
  }, [workspaceCommands, session]);

  // Handle command selection from autocomplete
  const handleSelectCommand = useCallback((cmd: AvailableCommand) => {
    const newValue = `/${cmd.name}${cmd.input?.hint ? " " : ""}`;
    setValue(newValue);
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    // Reset height to get accurate scrollHeight
    textarea.style.height = "auto";

    // Calculate line height (approx 16px for text-[10px] with line-height)
    const lineHeight = 14;
    const maxHeight = lineHeight * MAX_TEXTAREA_ROWS + 8; // +8 for padding

    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, []);

  // Auto-focus when autoFocus prop changes to true
  useEffect(() => {
    if (autoFocus && inputRef.current && !disabled) {
      inputRef.current.focus();
    }
  }, [autoFocus, disabled]);

  // Adjust height when value changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [value, adjustTextareaHeight]);

  // Consume pending input from store only if it's for THIS session
  useEffect(() => {
    if (
      pendingInput &&
      pendingInput.sessionId === sessionId &&
      inputRef.current
    ) {
      setValue((prev) =>
        prev ? `${prev}${pendingInput.text}` : pendingInput.text,
      );
      clearPendingInput();
      inputRef.current.focus();
    }
  }, [pendingInput, sessionId, clearPendingInput]);

  // Convert file to base64
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix to get pure base64
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

  // Check if text is "large"
  const isLargeText = useCallback((text: string): boolean => {
    const lineCount = text.split("\n").length;
    return (
      text.length > LARGE_TEXT_THRESHOLD ||
      lineCount > LARGE_TEXT_LINES_THRESHOLD
    );
  }, []);

  // Add text attachment
  const addTextAttachment = useCallback((text: string) => {
    const lineCount = text.split("\n").length;
    const attachment: TextAttachment = {
      id: crypto.randomUUID(),
      content: text,
      lineCount,
    };
    setTextAttachments((prev) => [...prev, attachment]);
  }, []);

  // Handle paste (Cmd+V)
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
        return;
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

      // Reset input so same file can be selected again
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

  // Remove text attachment
  const removeTextAttachment = useCallback((id: string) => {
    setTextAttachments((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleSubmit = useCallback(() => {
    const hasContent =
      value.trim() || images.length > 0 || textAttachments.length > 0;
    if (!hasContent || disabled || isLoading) return;

    const attachments: ImageAttachment[] | undefined =
      images.length > 0
        ? images.map((img) => ({
            data: img.data,
            mime_type: img.mimeType,
          }))
        : undefined;

    // Combine input value with text attachments
    const textParts = [
      value.trim(),
      ...textAttachments.map((t) => t.content),
    ].filter(Boolean);
    const fullMessage = textParts.join("\n\n");

    onSubmit(fullMessage, attachments);
    setValue("");
    setImages([]);
    setTextAttachments([]);
  }, [value, images, textAttachments, disabled, isLoading, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const canSubmit =
    (value.trim() || images.length > 0 || textAttachments.length > 0) &&
    !disabled &&
    !isLoading;

  const hasAttachments = images.length > 0 || textAttachments.length > 0;

  return (
    <>
      <div className={cn("space-y-1", className)}>
        {/* Attachments row (images + text) */}
        {hasAttachments && (
          <div className="flex gap-1 flex-wrap px-0.5">
            {/* Image previews */}
            {images.map((img) => (
              <div
                key={img.id}
                className="relative group size-10 rounded border border-border overflow-hidden bg-muted/50"
              >
                {/* biome-ignore lint/a11y/useAltText: base64 preview */}
                {/* biome-ignore lint/performance/noImgElement: base64 preview, not optimizable */}
                <img
                  src={img.preview}
                  alt="Attached"
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="size-2" />
                </button>
              </div>
            ))}

            {/* Text attachment previews */}
            {textAttachments.map((textAttach) => (
              <button
                key={textAttach.id}
                type="button"
                onClick={() => setViewingText(textAttach)}
                className="relative group size-10 rounded border border-border overflow-hidden bg-muted/50 hover:bg-muted transition-colors"
              >
                {/* Text preview icon + line count badge */}
                <div className="size-full flex flex-col items-center justify-center">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="text-[8px] text-muted-foreground font-mono">
                    +{textAttach.lineCount}L
                  </span>
                </div>
                {/* Remove button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTextAttachment(textAttach.id);
                  }}
                  className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="size-2" />
                </button>
              </button>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="relative flex items-end gap-1">
          {/* Command autocomplete */}
          <CommandAutocomplete
            commands={availableCommands}
            inputValue={value}
            onSelectCommand={handleSelectCommand}
            inputRef={inputRef}
          />

          {/* Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isLoading}
            className={cn(
              "p-1 rounded-sm transition-colors shrink-0 mb-0.5",
              "hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed",
              "text-muted-foreground hover:text-foreground",
            )}
            title="Attach image (or paste with Cmd+V)"
          >
            <Paperclip className="size-3" />
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

          {/* Text input - always editable during loading, auto-grows */}
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-sm border border-border bg-background/50 px-1.5 py-1 pr-6",
              "text-[10px] font-mono placeholder:text-muted-foreground/40",
              "focus:outline-none focus:ring-1 focus:ring-accent-orange/30 focus:border-accent-orange/30",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "transition-colors overflow-y-auto",
            )}
            style={{ minHeight: "22px", maxHeight: "64px" }}
          />

          {/* Submit or Stop button */}
          {isLoading ? (
            <button
              type="button"
              onClick={onStop}
              className={cn(
                "absolute right-1 bottom-1",
                "p-0.5 rounded-sm transition-colors",
                "bg-destructive/80 text-white hover:bg-destructive",
              )}
              title="Stop"
            >
              <Square className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                "absolute right-1 bottom-1",
                "p-0.5 rounded-sm transition-colors",
                "disabled:opacity-20 disabled:cursor-not-allowed",
                canSubmit
                  ? "bg-accent-orange text-white hover:bg-accent-orange/90"
                  : "text-muted-foreground/50",
              )}
            >
              <ArrowUp className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Text preview dialog */}
      <Dialog
        open={viewingText !== null}
        onOpenChange={(open) => !open && setViewingText(null)}
      >
        <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileText className="size-4" />
              Text Attachment ({viewingText?.lineCount} lines)
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh] rounded border border-border bg-muted/30 p-3">
            <pre className="text-[10px] font-mono whitespace-pre-wrap break-words text-foreground/80">
              {viewingText?.content}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
