"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Command, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AvailableCommand } from "@/stores/orchestrator-store";

type TriggerMode = "command" | "skill" | null;

interface CommandAutocompleteProps {
  commands: AvailableCommand[];
  inputValue: string;
  onSelectCommand: (command: AvailableCommand) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  className?: string;
}

export function CommandAutocomplete({
  commands,
  inputValue,
  onSelectCommand,
  inputRef,
  className,
}: CommandAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Check if we should show the autocomplete and what mode
  const triggerMode: TriggerMode = useMemo(() => {
    if (inputValue.startsWith("/") && !inputValue.includes(" ")) return "command";
    if (inputValue.startsWith("@") && !inputValue.includes(" ")) return "skill";
    return null;
  }, [inputValue]);

  const showAutocomplete = triggerMode !== null;

  // Filter items based on input and trigger mode
  const filteredCommands = useMemo(() => {
    if (!triggerMode) return [];

    const query = inputValue.slice(1).toLowerCase(); // Remove the "/" or "@" prefix

    // Filter by type based on trigger mode
    const typeFilter = triggerMode === "command" ? "command" : "skill";
    const relevantItems = commands.filter((cmd) => cmd.type === typeFilter);

    if (!query) return relevantItems.slice(0, 8); // Show first 8 when just "/" or "@" is typed

    return relevantItems
      .filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(query) ||
          cmd.description.toLowerCase().includes(query)
      )
      .slice(0, 8);
  }, [commands, inputValue, triggerMode]);

  // Reset selected index when filtered commands change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-command-item]");
    const selectedItem = items[selectedIndex];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!showAutocomplete || filteredCommands.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
          break;
        case "Tab":
        case "Enter":
          if (filteredCommands[selectedIndex]) {
            e.preventDefault();
            onSelectCommand(filteredCommands[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          // Let parent handle clearing
          break;
      }
    },
    [showAutocomplete, filteredCommands, selectedIndex, onSelectCommand]
  );

  // Attach keyboard listener to the input
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    input.addEventListener("keydown", handleKeyDown as EventListener);
    return () => {
      input.removeEventListener("keydown", handleKeyDown as EventListener);
    };
  }, [inputRef, handleKeyDown]);

  if (!showAutocomplete || filteredCommands.length === 0) return null;

  return (
    <div
      ref={listRef}
      className={cn(
        "absolute bottom-full left-0 right-0 mb-1 z-50",
        "bg-popover border border-border rounded-lg shadow-lg overflow-hidden",
        "max-h-[240px] overflow-y-auto",
        className
      )}
    >
      <div className="px-2 py-1.5 border-b border-border bg-muted/30">
        <span className="text-[10px] text-muted-foreground font-medium">
          {triggerMode === "skill" ? "Skills" : "Commands"}
        </span>
      </div>
      <div className="py-1">
        {filteredCommands.map((cmd, index) => (
          <button
            key={cmd.name}
            type="button"
            data-command-item
            onClick={() => onSelectCommand(cmd)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={cn(
              "w-full flex items-start gap-2 px-2 py-1.5 text-left transition-colors",
              index === selectedIndex
                ? "bg-accent-orange/10 text-foreground"
                : "text-foreground/80 hover:bg-muted"
            )}
          >
            {triggerMode === "skill" ? (
              <Sparkles className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
            ) : (
              <Command className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-medium">
                  {triggerMode === "skill" ? "@" : "/"}{cmd.name}
                </span>
                {cmd.source && (
                  <span
                    className={cn(
                      "text-[8px] px-1 py-0.5 rounded",
                      cmd.source === "builtin"
                        ? "bg-blue-500/20 text-blue-400"
                        : cmd.source === "project"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-purple-500/20 text-purple-400"
                    )}
                  >
                    {cmd.source}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground truncate">
                {cmd.description}
              </p>
              {cmd.input?.hint && (
                <p className="text-[9px] text-muted-foreground/60 italic truncate mt-0.5">
                  {cmd.input.hint}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="px-2 py-1 border-t border-border bg-muted/20">
        <span className="text-[9px] text-muted-foreground">
          <kbd className="px-1 py-0.5 rounded bg-muted text-[8px] font-mono">↑↓</kbd>
          {" "}navigate{" "}
          <kbd className="px-1 py-0.5 rounded bg-muted text-[8px] font-mono">Tab</kbd>
          {" "}select{" "}
          <kbd className="px-1 py-0.5 rounded bg-muted text-[8px] font-mono">Esc</kbd>
          {" "}dismiss
        </span>
      </div>
    </div>
  );
}
