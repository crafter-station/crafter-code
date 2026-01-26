"use client";

import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@crafter-code/ui";
import type { FileConflict } from "@/stores/orchestrator-store";

interface ConflictAlertProps {
  conflicts: FileConflict[];
  onDismiss?: () => void;
  className?: string;
}

export function ConflictAlert({
  conflicts,
  onDismiss,
  className,
}: ConflictAlertProps) {
  if (conflicts.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-5 text-yellow-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-500">
              File Conflicts Detected
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Multiple workers are modifying the same files. Manual review may
              be required.
            </p>
            <ul className="mt-3 space-y-2">
              {conflicts.map((conflict) => (
                <li
                  key={conflict.filePath}
                  className="text-sm bg-muted/50 rounded p-2"
                >
                  <code className="font-mono text-xs">{conflict.filePath}</code>
                  <span className="text-muted-foreground ml-2">
                    ({conflict.workerIds.length} workers)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDismiss}
            className="shrink-0"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
