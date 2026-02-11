"use client";

import { LayoutDashboard, Columns3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useOrchestratorStore, type ActiveView } from "@/stores/orchestrator-store";

export function ViewToggle() {
  const activeView = useOrchestratorStore((s) => s.activeView);
  const setActiveView = useOrchestratorStore((s) => s.setActiveView);

  return (
    <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
      <ToggleButton
        active={activeView === "sessions"}
        onClick={() => setActiveView("sessions")}
        icon={<Columns3 className="size-3.5" />}
        label="Sessions"
        shortcut="D"
      />
      <ToggleButton
        active={activeView === "dashboard"}
        onClick={() => setActiveView("dashboard")}
        icon={<LayoutDashboard className="size-3.5" />}
        label="Dashboard"
        shortcut="D"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
