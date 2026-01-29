"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Plus,
  Trash2,
  User,
  Upload,
  X,
  FileJson,
  AlertCircle,
  Cpu,
  Gauge,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  taskList,
  taskCreate,
  taskUpdate,
  taskDelete,
  type Task,
  type TaskStatus,
} from "@/lib/ipc/tasks";
import type { Prd, AcceptanceCriterion, Complexity, ModelId } from "@/lib/types/prd";

interface TaskBoardProps {
  sessionId: string;
  className?: string;
}

const statusConfig: Record<
  TaskStatus,
  { icon: typeof Circle; color: string; label: string }
> = {
  pending: { icon: Circle, color: "text-muted-foreground", label: "Pending" },
  in_progress: {
    icon: Loader2,
    color: "text-accent-orange",
    label: "In Progress",
  },
  completed: { icon: CheckCircle2, color: "text-green-500", label: "Done" },
  deleted: { icon: Trash2, color: "text-red-500", label: "Deleted" },
};

export function TaskBoard({ sessionId, className }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTaskSubject, setNewTaskSubject] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [prdJson, setPrdJson] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      const result = await taskList(sessionId);
      setTasks(result);
    } catch (e) {
      console.error("Failed to fetch tasks:", e);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Poll for updates
  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 2000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  // Create task
  const handleCreate = async () => {
    if (!newTaskSubject.trim()) return;

    try {
      await taskCreate(sessionId, newTaskSubject.trim(), "", newTaskSubject.trim() + "...");
      setNewTaskSubject("");
      setIsCreating(false);
      fetchTasks();
    } catch (e) {
      console.error("Failed to create task:", e);
    }
  };

  // Toggle task status
  const handleToggleStatus = async (task: Task) => {
    const nextStatus: Record<TaskStatus, TaskStatus> = {
      pending: "in_progress",
      in_progress: "completed",
      completed: "pending",
      deleted: "pending",
    };

    try {
      await taskUpdate(sessionId, task.id, { status: nextStatus[task.status] });
      fetchTasks();
    } catch (e) {
      console.error("Failed to update task:", e);
    }
  };

  // Delete task
  const handleDelete = async (taskId: string) => {
    try {
      await taskDelete(sessionId, taskId);
      fetchTasks();
    } catch (e) {
      console.error("Failed to delete task:", e);
    }
  };

  // Import PRD
  const handleImportPrd = async () => {
    if (!prdJson.trim()) return;

    setImportError(null);
    setIsImporting(true);

    try {
      const prd = JSON.parse(prdJson) as Prd;

      // Validate basic structure
      if (!prd.stories || !Array.isArray(prd.stories)) {
        throw new Error("Invalid PRD: missing stories array");
      }

      // Map story IDs to task IDs
      const storyIdToTaskId: Record<string, string> = {};

      // First pass: create all tasks (without dependencies)
      for (const story of prd.stories) {
        const task = await taskCreate(
          sessionId,
          story.title,
          story.description,
          `Working on: ${story.title}...`
        );
        storyIdToTaskId[story.id] = task.id;

        // Store PRD metadata in task
        await taskUpdate(sessionId, task.id, {
          metadata: {
            prd_story_id: story.id,
            acceptance_criteria: story.acceptance_criteria,
            complexity: story.complexity,
            model: story.model,
            hints: story.hints,
            prd_title: prd.title,
          },
        });
      }

      // Second pass: set up dependencies
      for (const story of prd.stories) {
        if (story.dependencies.length > 0) {
          const taskId = storyIdToTaskId[story.id];
          const blockedBy = story.dependencies
            .map((depId) => storyIdToTaskId[depId])
            .filter(Boolean);

          if (blockedBy.length > 0) {
            await taskUpdate(sessionId, taskId, { addBlockedBy: blockedBy });
          }
        }
      }

      // Reset and close
      setPrdJson("");
      setIsImportOpen(false);
      fetchTasks();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Failed to parse PRD JSON");
    } finally {
      setIsImporting(false);
    }
  };

  // Group tasks by status
  const pendingTasks = tasks.filter((t) => t.status === "pending");
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const completedTasks = tasks.filter((t) => t.status === "completed");

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full relative", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-foreground">Tasks</span>
          <span className="text-[10px] text-muted-foreground">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Import PRD"
          >
            <Upload className="size-3.5 text-muted-foreground" />
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Add task"
          >
            <Plus className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Import PRD Modal */}
      {isImportOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-[90%] max-w-md rounded-lg border border-border bg-background shadow-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <FileJson className="size-4 text-accent-orange" />
                <span className="text-[11px] font-medium">Import PRD</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportOpen(false);
                  setPrdJson("");
                  setImportError(null);
                }}
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                <X className="size-3.5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-3 space-y-3">
              <textarea
                value={prdJson}
                onChange={(e) => setPrdJson(e.target.value)}
                placeholder='{"title": "My PRD", "stories": [...], "constraints": {...}}'
                className="w-full h-48 p-2 rounded border border-border bg-muted/30 text-[11px] font-mono resize-none focus:outline-none focus:ring-1 focus:ring-accent-orange/50"
              />

              {importError && (
                <div className="flex items-start gap-2 p-2 rounded bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="size-3.5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-red-400">{importError}</p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-[9px] text-muted-foreground">
                  Stories will be created as tasks with acceptance criteria in metadata
                </p>
                <button
                  type="button"
                  onClick={handleImportPrd}
                  disabled={!prdJson.trim() || isImporting}
                  className="px-3 py-1.5 rounded text-[11px] font-medium bg-accent-orange/20 text-accent-orange hover:bg-accent-orange/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="size-3" />
                      Import
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 && !isCreating ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="size-6 text-muted-foreground/40 mb-2" />
            <p className="text-[11px] text-muted-foreground">No tasks yet</p>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="mt-2 text-[10px] text-accent-orange hover:underline"
            >
              Create first task
            </button>
          </div>
        ) : (
          <div className="p-2 space-y-3">
            {/* Create task input */}
            {isCreating && (
              <div className="flex items-center gap-1.5 p-1.5 rounded border border-accent-orange/50 bg-accent-orange/5">
                <Circle className="size-3 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  value={newTaskSubject}
                  onChange={(e) => setNewTaskSubject(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") {
                      setIsCreating(false);
                      setNewTaskSubject("");
                    }
                  }}
                  placeholder="Task description..."
                  className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/50"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newTaskSubject.trim()}
                  className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-accent-orange/20 text-accent-orange hover:bg-accent-orange/30 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            )}

            {/* In Progress */}
            {inProgressTasks.length > 0 && (
              <TaskSection
                title="In Progress"
                tasks={inProgressTasks}
                onToggle={handleToggleStatus}
                onDelete={handleDelete}
              />
            )}

            {/* Pending */}
            {pendingTasks.length > 0 && (
              <TaskSection
                title="Pending"
                tasks={pendingTasks}
                onToggle={handleToggleStatus}
                onDelete={handleDelete}
              />
            )}

            {/* Completed */}
            {completedTasks.length > 0 && (
              <TaskSection
                title="Completed"
                tasks={completedTasks}
                onToggle={handleToggleStatus}
                onDelete={handleDelete}
                collapsed
              />
            )}
          </div>
        )}
      </div>

      {/* Summary footer */}
      {tasks.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-accent-orange" />
              {inProgressTasks.length} active
            </span>
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-muted-foreground" />
              {pendingTasks.length} pending
            </span>
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-green-500" />
              {completedTasks.length} done
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Task section component
function TaskSection({
  title,
  tasks,
  onToggle,
  onDelete,
  collapsed = false,
}: {
  title: string;
  tasks: Task[];
  onToggle: (task: Task) => void;
  onDelete: (taskId: string) => void;
  collapsed?: boolean;
}) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-1.5 w-full text-left mb-1"
      >
        <span
          className={cn(
            "text-[9px] transition-transform",
            isCollapsed ? "" : "rotate-90"
          )}
        >
          ▶
        </span>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          ({tasks.length})
        </span>
      </button>

      {!isCollapsed && (
        <div className="space-y-0.5 ml-2">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={() => onToggle(task)}
              onDelete={() => onDelete(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Model and complexity display config
const modelConfig: Record<ModelId, { color: string; label: string }> = {
  opus: { color: "text-purple-400 bg-purple-500/10", label: "Opus" },
  sonnet: { color: "text-blue-400 bg-blue-500/10", label: "Sonnet" },
  haiku: { color: "text-emerald-400 bg-emerald-500/10", label: "Haiku" },
};

const complexityConfig: Record<Complexity, { color: string; label: string }> = {
  high: { color: "text-red-400 bg-red-500/10", label: "High" },
  medium: { color: "text-amber-400 bg-amber-500/10", label: "Medium" },
  low: { color: "text-green-400 bg-green-500/10", label: "Low" },
};

// Individual task item
function TaskItem({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const config = statusConfig[task.status];
  const StatusIcon = config.icon;
  const isBlocked = task.blockedBy.length > 0;

  // PRD metadata
  const acceptanceCriteria = task.metadata?.acceptance_criteria as AcceptanceCriterion[] | undefined;
  const complexity = task.metadata?.complexity as Complexity | undefined;
  const model = task.metadata?.model as ModelId | undefined;

  return (
    <div
      className={cn(
        "group flex items-start gap-1.5 p-1.5 rounded hover:bg-muted/50 transition-colors",
        isBlocked && "opacity-60"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={isBlocked}
        className={cn(
          "mt-0.5 shrink-0 transition-colors",
          config.color,
          task.status === "in_progress" && "animate-spin"
        )}
      >
        <StatusIcon className="size-3" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p
            className={cn(
              "text-[11px] leading-tight",
              task.status === "completed" && "line-through text-muted-foreground"
            )}
          >
            {task.subject}
          </p>

          {/* PRD badges */}
          {model && (
            <span
              className={cn(
                "px-1 py-0.5 rounded text-[8px] font-medium flex items-center gap-0.5",
                modelConfig[model].color
              )}
            >
              <Cpu className="size-2" />
              {modelConfig[model].label}
            </span>
          )}
          {complexity && (
            <span
              className={cn(
                "px-1 py-0.5 rounded text-[8px] font-medium flex items-center gap-0.5",
                complexityConfig[complexity].color
              )}
            >
              <Gauge className="size-2" />
              {complexityConfig[complexity].label}
            </span>
          )}
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {task.owner && (
            <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
              <User className="size-2.5" />
              {task.owner.slice(0, 8)}
            </span>
          )}
          {isBlocked && (
            <span className="text-[9px] text-amber-500">
              blocked by #{task.blockedBy.join(", #")}
            </span>
          )}
          {task.blocks.length > 0 && (
            <span className="text-[9px] text-muted-foreground/60">
              blocks #{task.blocks.join(", #")}
            </span>
          )}
          {acceptanceCriteria && acceptanceCriteria.length > 0 && (
            <span className="text-[9px] text-muted-foreground/60">
              {acceptanceCriteria.length} criteria
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
      >
        <Trash2 className="size-3 text-red-400" />
      </button>
    </div>
  );
}
