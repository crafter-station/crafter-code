"use client";

import { type KeyboardEvent, useCallback, useState } from "react";

import { ArrowUp, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface SessionInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function SessionInput({
  onSubmit,
  disabled,
  isLoading,
  placeholder = "Follow-up...",
  className,
}: SessionInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    if (!value.trim() || disabled || isLoading) return;
    onSubmit(value.trim());
    setValue("");
  }, [value, disabled, isLoading, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className={cn("relative", className)}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled || isLoading}
        placeholder={placeholder}
        rows={1}
        className={cn(
          "w-full resize-none rounded-sm border border-border bg-background/50 px-1.5 py-1 pr-6",
          "text-[10px] font-mono placeholder:text-muted-foreground/40",
          "focus:outline-none focus:ring-1 focus:ring-accent-orange/30 focus:border-accent-orange/30",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          "transition-colors",
        )}
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!value.trim() || disabled || isLoading}
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2",
          "p-0.5 rounded-sm transition-colors",
          "disabled:opacity-20 disabled:cursor-not-allowed",
          value.trim() && !disabled && !isLoading
            ? "bg-accent-orange text-white hover:bg-accent-orange/90"
            : "text-muted-foreground/50",
        )}
      >
        {isLoading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <ArrowUp className="size-3" />
        )}
      </button>
    </div>
  );
}
