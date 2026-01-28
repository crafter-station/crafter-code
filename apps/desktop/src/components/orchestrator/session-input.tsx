"use client";

import {
  type ClipboardEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ArrowUp, Paperclip, Square, X } from "lucide-react";

import type { ImageAttachment } from "@/lib/ipc/orchestrator";
import { cn } from "@/lib/utils";

import { useOrchestratorStore } from "@/stores/orchestrator-store";

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pendingInput, clearPendingInput } = useOrchestratorStore();

  // Auto-focus when autoFocus prop changes to true
  useEffect(() => {
    if (autoFocus && inputRef.current && !disabled) {
      inputRef.current.focus();
    }
  }, [autoFocus, disabled]);

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

  // Handle paste (Cmd+V)
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

  const handleSubmit = useCallback(() => {
    if ((!value.trim() && images.length === 0) || disabled || isLoading) return;

    const attachments: ImageAttachment[] | undefined =
      images.length > 0
        ? images.map((img) => ({
            data: img.data,
            mime_type: img.mimeType,
          }))
        : undefined;

    onSubmit(value.trim(), attachments);
    setValue("");
    setImages([]);
  }, [value, images, disabled, isLoading, onSubmit]);

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
    (value.trim() || images.length > 0) && !disabled && !isLoading;

  return (
    <div className={cn("space-y-1", className)}>
      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-1 flex-wrap px-0.5">
          {images.map((img) => (
            <div
              key={img.id}
              className="relative group size-10 rounded border border-border overflow-hidden bg-muted/50"
            >
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
        </div>
      )}

      {/* Input row */}
      <div className="relative flex items-center gap-1">
        {/* Attachment button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isLoading}
          className={cn(
            "p-1 rounded-sm transition-colors shrink-0",
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

        {/* Text input - always editable during loading */}
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
            "transition-colors",
          )}
        />

        {/* Submit or Stop button */}
        {isLoading ? (
          <button
            type="button"
            onClick={onStop}
            className={cn(
              "absolute right-1 top-1/2 -translate-y-1/2",
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
              "absolute right-1 top-1/2 -translate-y-1/2",
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
  );
}
