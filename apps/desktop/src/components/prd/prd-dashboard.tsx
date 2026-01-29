"use client";

import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  FileJson,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  DollarSign,
  Zap,
  AlertTriangle,
  ChevronLeft,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  Prd,
  PrdSession,
  PrdSessionStatus,
  ValidationResult,
  StoryProgress,
} from "@/lib/types/prd";
import {
  validatePrd,
  createPrdSession,
  getPrdSession,
  pausePrdSession,
  resumePrdSession,
  cancelPrdSession,
  retryStory,
  formatCost,
  formatTokens,
  canPause,
  canResume,
  isSessionTerminal,
} from "@/lib/ipc/prd";
import { PrdEditor } from "./prd-editor";
import { StoryCard } from "./story-card";
import { WorkerPool } from "./worker-pool";

type View = "editor" | "execution";

interface PrdDashboardProps {
  initialPrd?: Prd;
  className?: string;
  onBack?: () => void;
}

const sessionStatusConfig: Record<
  PrdSessionStatus,
  { icon: typeof Clock; color: string; label: string }
> = {
  idle: { icon: Clock, color: "text-muted-foreground", label: "Idle" },
  validating: { icon: Loader2, color: "text-blue-400", label: "Validating" },
  running: { icon: Loader2, color: "text-accent-orange", label: "Running" },
  paused: { icon: Pause, color: "text-amber-500", label: "Paused" },
  completed: { icon: CheckCircle2, color: "text-green-500", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-500", label: "Failed" },
};

export function PrdDashboard({
  initialPrd,
  className,
  onBack,
}: PrdDashboardProps) {
  const [view, setView] = useState<View>(initialPrd ? "editor" : "editor");
  const [prd, setPrd] = useState<Prd | null>(initialPrd ?? null);
  const [session, setSession] = useState<PrdSession | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll for session updates when running
  useEffect(() => {
    if (!session || isSessionTerminal(session.status)) return;

    const interval = setInterval(async () => {
      try {
        const updated = await getPrdSession(session.id);
        setSession(updated);
      } catch (e) {
        console.error("Failed to fetch session:", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [session?.id, session?.status]);

  // Listen for PRD events
  useEffect(() => {
    const unlistenPromise = listen<{ sessionId: string; event: string }>(
      "prd-update",
      (event) => {
        if (session && event.payload.sessionId === session.id) {
          // Refresh session on any update
          getPrdSession(session.id).then(setSession).catch(console.error);
        }
      }
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [session?.id]);

  // Validate PRD
  const handleValidate = useCallback(async (prdToValidate: Prd): Promise<ValidationResult> => {
    setIsValidating(true);
    setError(null);

    try {
      const result = await validatePrd(prdToValidate);
      setValidation(result);
      return result;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Validation failed";
      setError(errorMsg);
      return {
        valid: false,
        errors: [errorMsg],
        warnings: [],
        estimatedCost: 0,
        modelAssignments: {},
        dependencyOrder: [],
      };
    } finally {
      setIsValidating(false);
    }
  }, []);

  // Start execution
  const handleStart = useCallback(async () => {
    if (!prd || !validation?.valid) return;

    setIsStarting(true);
    setError(null);

    try {
      const newSession = await createPrdSession(prd);
      setSession(newSession);
      setView("execution");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start execution");
    } finally {
      setIsStarting(false);
    }
  }, [prd, validation]);

  // Session controls
  const handlePause = useCallback(async () => {
    if (!session) return;
    try {
      await pausePrdSession(session.id);
      const updated = await getPrdSession(session.id);
      setSession(updated);
    } catch (e) {
      console.error("Failed to pause:", e);
    }
  }, [session]);

  const handleResume = useCallback(async () => {
    if (!session) return;
    try {
      await resumePrdSession(session.id);
      const updated = await getPrdSession(session.id);
      setSession(updated);
    } catch (e) {
      console.error("Failed to resume:", e);
    }
  }, [session]);

  const handleCancel = useCallback(async () => {
    if (!session) return;
    try {
      await cancelPrdSession(session.id);
      const updated = await getPrdSession(session.id);
      setSession(updated);
    } catch (e) {
      console.error("Failed to cancel:", e);
    }
  }, [session]);

  const handleRetryStory = useCallback(
    async (storyId: string) => {
      if (!session) return;
      try {
        await retryStory(session.id, storyId);
        const updated = await getPrdSession(session.id);
        setSession(updated);
      } catch (e) {
        console.error("Failed to retry story:", e);
      }
    },
    [session]
  );

  // Reset to editor
  const handleReset = useCallback(() => {
    setSession(null);
    setValidation(null);
    setView("editor");
  }, []);

  // Get story progress map
  const storyProgressMap = session
    ? Object.fromEntries(session.storyProgress)
    : {};

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 rounded hover:bg-muted transition-colors"
            >
              <ChevronLeft className="size-4 text-muted-foreground" />
            </button>
          )}
          <div className="flex items-center gap-2">
            <FileJson className="size-5 text-accent-orange" />
            <h1 className="text-sm font-semibold">
              {prd?.title || "PRD Orchestrator"}
            </h1>
          </div>
          {session && (
            <SessionStatusBadge status={session.status} />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          {session && (
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setView("editor")}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-medium transition-colors",
                  view === "editor"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Editor
              </button>
              <button
                type="button"
                onClick={() => setView("execution")}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-medium transition-colors",
                  view === "execution"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Execution
              </button>
            </div>
          )}

          {/* Controls */}
          {view === "editor" && !session && (
            <>
              <button
                type="button"
                onClick={() => prd && handleValidate(prd)}
                disabled={!prd || isValidating}
                className={cn(
                  "px-3 py-1.5 rounded text-[11px] font-medium transition-colors",
                  "border border-border hover:bg-muted disabled:opacity-50"
                )}
              >
                {isValidating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  "Validate"
                )}
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={!prd || !validation?.valid || isStarting}
                className={cn(
                  "px-3 py-1.5 rounded text-[11px] font-medium transition-colors",
                  "bg-accent-orange text-white hover:bg-accent-orange/90",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "flex items-center gap-1.5"
                )}
              >
                {isStarting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                Start
              </button>
            </>
          )}

          {session && !isSessionTerminal(session.status) && (
            <>
              {canPause(session.status) && (
                <button
                  type="button"
                  onClick={handlePause}
                  className="px-3 py-1.5 rounded text-[11px] font-medium border border-border hover:bg-muted flex items-center gap-1.5"
                >
                  <Pause className="size-3.5" />
                  Pause
                </button>
              )}
              {canResume(session.status) && (
                <button
                  type="button"
                  onClick={handleResume}
                  className="px-3 py-1.5 rounded text-[11px] font-medium bg-accent-orange text-white hover:bg-accent-orange/90 flex items-center gap-1.5"
                >
                  <Play className="size-3.5" />
                  Resume
                </button>
              )}
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1.5 rounded text-[11px] font-medium border border-red-500/30 text-red-400 hover:bg-red-500/10 flex items-center gap-1.5"
              >
                <Square className="size-3.5" />
                Cancel
              </button>
            </>
          )}

          {session && isSessionTerminal(session.status) && (
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 rounded text-[11px] font-medium border border-border hover:bg-muted flex items-center gap-1.5"
            >
              <RotateCcw className="size-3.5" />
              New PRD
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
          <AlertTriangle className="size-4 text-red-400" />
          <p className="text-[11px] text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-[10px] text-red-400 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Validation results */}
      {validation && view === "editor" && (
        <ValidationBanner validation={validation} />
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {view === "editor" ? (
          <div className="h-full overflow-y-auto p-4">
            <PrdEditor
              initialPrd={prd ?? undefined}
              onChange={setPrd}
              onValidate={handleValidate}
            />
          </div>
        ) : session ? (
          <ExecutionView
            session={session}
            storyProgressMap={storyProgressMap}
            onRetryStory={handleRetryStory}
          />
        ) : null}
      </div>

      {/* Footer stats */}
      {session && (
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-4 text-[10px]">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3" />
              {session.startedAt
                ? formatDuration(Date.now() - session.startedAt)
                : "Not started"}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Zap className="size-3" />
              {formatTokens(session.tokensUsed.input + session.tokensUsed.output)} tokens
            </span>
            <span className="flex items-center gap-1 text-green-400">
              <DollarSign className="size-3" />
              {formatCost(session.totalCost)}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {Array.from(session.storyProgress.values()).filter((p) => p.status === "completed").length}/
            {session.prd.stories.length} stories complete
          </div>
        </div>
      )}
    </div>
  );
}

function SessionStatusBadge({ status }: { status: PrdSessionStatus }) {
  const config = sessionStatusConfig[status];
  const StatusIcon = config.icon;

  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1",
        config.color,
        status === "running" && "bg-accent-orange/10",
        status === "completed" && "bg-green-500/10",
        status === "failed" && "bg-red-500/10",
        status === "paused" && "bg-amber-500/10"
      )}
    >
      <StatusIcon
        className={cn("size-3", status === "running" && "animate-spin")}
      />
      {config.label}
    </span>
  );
}

function ValidationBanner({ validation }: { validation: ValidationResult }) {
  if (validation.valid && validation.warnings.length === 0) {
    return (
      <div className="px-4 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center gap-2">
        <CheckCircle2 className="size-4 text-green-400" />
        <p className="text-[11px] text-green-400">
          PRD is valid. Estimated cost: {formatCost(validation.estimatedCost)}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
      {validation.errors.length > 0 && (
        <div className="flex items-start gap-2 mb-1">
          <XCircle className="size-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-medium text-red-400">Errors:</p>
            <ul className="text-[10px] text-red-400/80 list-disc list-inside">
              {validation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {validation.warnings.length > 0 && (
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-medium text-amber-400">Warnings:</p>
            <ul className="text-[10px] text-amber-400/80 list-disc list-inside">
              {validation.warnings.map((warn, i) => (
                <li key={i}>{warn}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ExecutionView({
  session,
  storyProgressMap,
  onRetryStory,
}: {
  session: PrdSession;
  storyProgressMap: Record<string, StoryProgress>;
  onRetryStory: (storyId: string) => void;
}) {
  return (
    <div className="h-full flex">
      {/* Stories panel */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Stories ({session.prd.stories.length})
        </h2>
        {session.prd.stories.map((story) => (
          <StoryCard
            key={story.id}
            story={story}
            progress={storyProgressMap[story.id]}
            onRetry={() => onRetryStory(story.id)}
          />
        ))}
      </div>

      {/* Workers panel */}
      <div className="w-80 border-l border-border p-4 overflow-y-auto">
        <WorkerPool
          workers={session.workers}
          maxWorkers={session.prd.constraints.max_workers}
        />
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
