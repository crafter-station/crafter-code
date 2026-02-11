"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useOrchestratorStore } from "@/stores/orchestrator-store";

interface SearchResult {
  sessionId: string;
  sessionPrompt: string;
  workerId?: string;
  workerTask?: string;
  type: "prompt" | "message" | "file" | "tool";
  content: string;
  timestamp: number;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sessions = useOrchestratorStore((s) => s.sessions);
  const setActiveSession = useOrchestratorStore((s) => s.setActiveSession);
  const setActiveView = useOrchestratorStore((s) => s.setActiveView);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "f") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  const results = useMemo(() => {
    if (!query || query.length < 2) return [];
    const lower = query.toLowerCase();
    const matches: SearchResult[] = [];

    for (const session of sessions) {
      if (session.prompt.toLowerCase().includes(lower)) {
        matches.push({
          sessionId: session.id,
          sessionPrompt: session.prompt,
          type: "prompt",
          content: session.prompt,
          timestamp: session.createdAt,
        });
      }

      for (const worker of session.workers || []) {
        if (worker.task.toLowerCase().includes(lower)) {
          matches.push({
            sessionId: session.id,
            sessionPrompt: session.prompt,
            workerId: worker.id,
            workerTask: worker.task,
            type: "prompt",
            content: worker.task,
            timestamp: worker.createdAt,
          });
        }

        for (const msg of worker.messages || []) {
          if (msg.content.toLowerCase().includes(lower)) {
            matches.push({
              sessionId: session.id,
              sessionPrompt: session.prompt,
              workerId: worker.id,
              workerTask: worker.task,
              type: "message",
              content: msg.content,
              timestamp: msg.timestamp,
            });
          }
        }

        for (const file of worker.filesTouched || []) {
          if (file.toLowerCase().includes(lower)) {
            matches.push({
              sessionId: session.id,
              sessionPrompt: session.prompt,
              workerId: worker.id,
              workerTask: worker.task,
              type: "file",
              content: file,
              timestamp: worker.updatedAt,
            });
          }
        }

        for (const tc of worker.toolCalls || []) {
          if (tc.title.toLowerCase().includes(lower)) {
            matches.push({
              sessionId: session.id,
              sessionPrompt: session.prompt,
              workerId: worker.id,
              workerTask: worker.task,
              type: "tool",
              content: tc.title,
              timestamp: tc.timestamp,
            });
          }
        }
      }
    }

    return matches.slice(0, 50);
  }, [query, sessions]);

  const groupedResults = useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    for (const result of results) {
      const existing = groups.get(result.sessionId) || [];
      existing.push(result);
      groups.set(result.sessionId, existing);
    }
    return groups;
  }, [results]);

  const handleSelect = useCallback(
    (sessionId: string) => {
      setActiveSession(sessionId);
      setActiveView("sessions");
      setOpen(false);
    },
    [setActiveSession, setActiveView],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[15vh]">
      <div className="w-full max-w-xl bg-card border rounded-xl shadow-lg overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions, messages, files..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {query.length < 2 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No results for "{query}"
            </div>
          ) : (
            <div className="divide-y">
              {[...groupedResults.entries()].map(([sessionId, items]) => (
                <div key={sessionId}>
                  <button
                    type="button"
                    onClick={() => handleSelect(sessionId)}
                    className="w-full text-left px-4 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-xs font-medium">
                      {items[0].sessionPrompt}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({items.length} matches)
                    </span>
                  </button>
                  {items.slice(0, 5).map((result, i) => (
                    <button
                      key={`${result.sessionId}-${result.workerId}-${result.type}-${i}`}
                      type="button"
                      onClick={() => handleSelect(sessionId)}
                      className="w-full text-left px-6 py-2 hover:bg-muted/30 transition-colors flex items-start gap-2"
                    >
                      <TypeBadge type={result.type} />
                      <span className="text-xs line-clamp-2 flex-1">
                        {highlightMatch(result.content, query)}
                      </span>
                    </button>
                  ))}
                  {items.length > 5 && (
                    <div className="px-6 py-1 text-xs text-muted-foreground">
                      ...and {items.length - 5} more matches
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t bg-muted/30 text-[10px] text-muted-foreground flex items-center justify-between">
          <span>{results.length} results</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: SearchResult["type"] }) {
  const styles: Record<string, string> = {
    prompt: "bg-purple-500/10 text-purple-500",
    message: "bg-blue-500/10 text-blue-500",
    file: "bg-green-500/10 text-green-500",
    tool: "bg-accent-orange/10 text-accent-orange",
  };

  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded text-[9px] font-mono uppercase shrink-0",
        styles[type],
      )}
    >
      {type}
    </span>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;

  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 40);
  const slice = text.slice(start, end);
  const relIdx = idx - start;

  return (
    <>
      {start > 0 && "..."}
      {slice.slice(0, relIdx)}
      <mark className="bg-accent-orange/20 text-foreground rounded px-0.5">
        {slice.slice(relIdx, relIdx + query.length)}
      </mark>
      {slice.slice(relIdx + query.length)}
      {end < text.length && "..."}
    </>
  );
}
