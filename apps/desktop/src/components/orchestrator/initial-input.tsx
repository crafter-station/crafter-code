"use client";

import { useCallback, useRef, useEffect, KeyboardEvent } from "react";
import { ArrowUp, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

interface InitialInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function InitialInput({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  placeholder = 'Ask anything... "Help me debug this issue"',
  className,
}: InitialInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const newHeight = Math.min(textarea.scrollHeight, 64);
    textarea.style.height = `${newHeight}px`;
  }, []);

  // Adjust height on mount and when value changes
  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );

  return (
    <div className={cn("relative flex items-end gap-1", className)}>
      {/* Attachment button */}
      <button
        type="button"
        disabled={isLoading}
        className={cn(
          "p-1 rounded-sm transition-colors shrink-0 mb-0.5",
          "hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed",
          "text-muted-foreground hover:text-foreground"
        )}
        title="Attach image"
      >
        <Paperclip className="size-3" />
      </button>

      {/* Textarea */}
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        placeholder={placeholder}
        rows={1}
        className={cn(
          "flex-1 resize-none rounded-sm border border-border bg-background/50 px-1.5 py-1 pr-6",
          "text-[10px] font-mono placeholder:text-muted-foreground/40",
          "focus:outline-none focus:ring-1 focus:ring-accent-orange/30 focus:border-accent-orange/30",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          "transition-colors overflow-y-auto"
        )}
        style={{ minHeight: "22px", maxHeight: "64px" }}
      />

      {/* Send button */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!value.trim() || isLoading}
        className={cn(
          "absolute right-1 bottom-1",
          "p-0.5 rounded-sm transition-colors",
          "text-muted-foreground hover:text-foreground hover:bg-muted",
          "disabled:opacity-40 disabled:cursor-not-allowed"
        )}
        title="Send (Enter)"
      >
        <ArrowUp className="size-3" />
      </button>
    </div>
  );
}
