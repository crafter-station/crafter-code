"use client";

import { useState } from "react";
import { Button } from "@crafter-code/ui";
import { Check, ExternalLink, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { FileConflict, WorkerSession } from "@/stores/orchestrator-store";

interface ConflictResolverProps {
  conflict: FileConflict;
  workers: WorkerSession[];
  onResolve?: (filePath: string, chosenWorkerId: string) => void;
  onOpenInEditor?: (filePath: string) => void;
  onClose?: () => void;
}

export function ConflictResolver({
  conflict,
  workers,
  onResolve,
  onOpenInEditor,
  onClose,
}: ConflictResolverProps) {
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);

  const conflictWorkers = workers.filter((w) =>
    conflict.workerIds.includes(w.id),
  );

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/50">
        <div>
          <h3 className="text-sm font-medium">Resolve Conflict</h3>
          <code className="text-xs font-mono text-muted-foreground">
            {conflict.filePath}
          </code>
        </div>
        <div className="flex items-center gap-2">
          {onOpenInEditor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenInEditor(conflict.filePath)}
              className="gap-1.5"
            >
              <ExternalLink className="size-3" />
              Open in Editor
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon-xs" onClick={onClose}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-0 divide-x">
        {conflictWorkers.map((worker) => (
          <button
            key={worker.id}
            type="button"
            onClick={() => setSelectedWorker(worker.id)}
            className={cn(
              "p-4 text-left transition-colors hover:bg-muted/30",
              selectedWorker === worker.id && "bg-accent-orange/5 ring-1 ring-inset ring-accent-orange/30",
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase text-muted-foreground">
                {worker.model}
              </span>
              {selectedWorker === worker.id && (
                <Check className="size-4 text-accent-orange" />
              )}
            </div>
            <p className="text-xs line-clamp-2 mb-2">{worker.task}</p>
            <p className="text-xs text-muted-foreground">
              {worker.filesTouched.length} files touched
            </p>
          </button>
        ))}
      </div>

      {selectedWorker && onResolve && (
        <div className="px-4 py-3 border-t bg-muted/50 flex justify-end">
          <Button
            size="sm"
            onClick={() => onResolve(conflict.filePath, selectedWorker)}
            className="gap-1.5"
          >
            <Check className="size-3" />
            Keep this version
          </Button>
        </div>
      )}
    </div>
  );
}
