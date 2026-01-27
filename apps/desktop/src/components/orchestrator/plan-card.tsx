"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AcpPlan, AcpPlanEntry, AcpPlanEntryPriority, AcpPlanEntryStatus } from "@/stores/orchestrator-store";

interface PlanCardProps {
  plan: AcpPlan;
  className?: string;
}

const STATUS_ICONS: Record<AcpPlanEntryStatus, React.ReactNode> = {
  pending: <Circle className="size-3 text-muted-foreground/50" />,
  in_progress: <Loader2 className="size-3 text-accent-orange animate-spin" />,
  completed: <CheckCircle2 className="size-3 text-green-500" />,
};

const PRIORITY_COLORS: Record<AcpPlanEntryPriority, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-muted-foreground",
};

export function PlanCard({ plan, className }: PlanCardProps) {
  if (!plan.entries || plan.entries.length === 0) return null;

  const completedCount = plan.entries.filter((e) => e.status === "completed").length;
  const totalCount = plan.entries.length;

  return (
    <div
      className={cn(
        "mx-2 my-1 p-2 rounded border border-blue-500/30 bg-blue-500/5",
        className
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-blue-400">
          Plan
        </span>
        <span className="text-[9px] text-muted-foreground/60">
          {completedCount}/{totalCount}
        </span>
      </div>
      <div className="space-y-1">
        {plan.entries.map((entry, index) => (
          <PlanEntryItem key={index} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function PlanEntryItem({ entry }: { entry: AcpPlanEntry }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 shrink-0">
        {STATUS_ICONS[entry.status]}
      </span>
      <span
        className={cn(
          "text-[10px] leading-tight",
          entry.status === "completed" && "text-muted-foreground/60 line-through"
        )}
      >
        {entry.content}
      </span>
      {entry.priority === "high" && (
        <span className={cn("text-[8px] shrink-0", PRIORITY_COLORS[entry.priority])}>
          !
        </span>
      )}
    </div>
  );
}
