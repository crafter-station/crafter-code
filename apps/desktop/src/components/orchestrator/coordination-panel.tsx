"use client";

import { useState } from "react";
import { ChevronLeft, Inbox, ListTodo } from "lucide-react";

import { cn } from "@/lib/utils";
import { InboxPanel } from "./inbox-panel";
import { TaskBoard } from "./task-board";

type Tab = "tasks" | "inbox";

interface CoordinationPanelProps {
  sessionId: string | null;
  className?: string;
  onCollapse?: () => void;
}

export function CoordinationPanel({
  sessionId,
  className,
  onCollapse,
}: CoordinationPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("tasks");

  if (!sessionId) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center text-center p-4",
          className
        )}
      >
        <ListTodo className="size-8 text-muted-foreground/30 mb-2" />
        <p className="text-[11px] text-muted-foreground">
          Select a session to view coordination
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full bg-card", className)}>
      {/* Tab header */}
      <div className="flex items-center border-b border-border shrink-0">
        {/* Collapse button */}
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="p-2 hover:bg-muted transition-colors border-r border-border"
            title="Collapse panel"
          >
            <ChevronLeft className="size-3.5 text-muted-foreground" />
          </button>
        )}

        {/* Tabs */}
        <div className="flex-1 flex">
          <TabButton
            active={activeTab === "tasks"}
            onClick={() => setActiveTab("tasks")}
            icon={ListTodo}
            label="Tasks"
          />
          <TabButton
            active={activeTab === "inbox"}
            onClick={() => setActiveTab("inbox")}
            icon={Inbox}
            label="Inbox"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "tasks" ? (
          <TaskBoard sessionId={sessionId} className="h-full" />
        ) : (
          <InboxPanel sessionId={sessionId} className="h-full" />
        )}
      </div>
    </div>
  );
}

// Tab button component
function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof ListTodo;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors relative",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {active && (
        <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent-orange rounded-full" />
      )}
    </button>
  );
}
