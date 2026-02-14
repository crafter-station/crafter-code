"use client";

import { ChevronLeft, ChevronRight, RotateCw, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface BrowserToolbarProps {
  url: string;
  onNavigate: (url: string) => void;
  onClose: () => void;
  onReload: () => void;
}

export function BrowserToolbar({
  url,
  onNavigate,
  onClose,
  onReload,
}: BrowserToolbarProps) {
  const [inputValue, setInputValue] = useState(url);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate(inputValue);
  };

  return (
    <div className="h-8 flex items-center gap-1 px-2 border-b border-border bg-card">
      <button
        type="button"
        onClick={() => {}}
        className="p-1 rounded hover:bg-muted transition-colors"
        title="Back"
      >
        <ChevronLeft className="size-4 text-muted-foreground" />
      </button>
      <button
        type="button"
        onClick={() => {}}
        className="p-1 rounded hover:bg-muted transition-colors"
        title="Forward"
      >
        <ChevronRight className="size-4 text-muted-foreground" />
      </button>
      <button
        type="button"
        onClick={onReload}
        className="p-1 rounded hover:bg-muted transition-colors"
        title="Reload"
      >
        <RotateCw className="size-4 text-muted-foreground" />
      </button>
      <form onSubmit={handleSubmit} className="flex-1">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className={cn(
            "w-full px-2 py-1 rounded bg-[#141414] text-xs font-mono",
            "border border-border focus:border-accent-orange focus:outline-none",
            "text-foreground placeholder:text-muted-foreground",
          )}
          placeholder="Enter URL..."
        />
      </form>
      <button
        type="button"
        onClick={onClose}
        className="p-1 rounded hover:bg-muted transition-colors"
        title="Close"
      >
        <X className="size-4 text-muted-foreground" />
      </button>
    </div>
  );
}
