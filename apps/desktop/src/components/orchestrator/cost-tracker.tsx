"use client";

import { DollarSign, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface CostTrackerProps {
  totalCost: number;
  completedWorkers: number;
  totalWorkers: number;
  className?: string;
}

export function CostTracker({
  totalCost,
  completedWorkers,
  totalWorkers,
  className,
}: CostTrackerProps) {
  const progress = totalWorkers > 0 ? (completedWorkers / totalWorkers) * 100 : 0;

  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-3 bg-sidebar border-b border-sidebar-border",
        className
      )}
    >
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Agent Fleet</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <TrendingUp className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {completedWorkers}/{totalWorkers}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-orange transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center gap-1.5 font-mono text-sm">
          <DollarSign className="size-4 text-green-500" />
          <span className="text-green-500">{formatCost(totalCost)}</span>
        </div>
      </div>
    </div>
  );
}

function formatCost(cost: number): string {
  if (cost < 0.01) {
    return cost.toFixed(4);
  }
  return cost.toFixed(2);
}
