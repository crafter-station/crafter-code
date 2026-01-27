"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@crafter-code/ui";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  Square,
} from "lucide-react";

import {
  type AgentConfig,
  createAcpSession,
  listAvailableAgents,
} from "@/lib/ipc/orchestrator";
import { cn } from "@/lib/utils";

import {
  type OrchestratorSession,
  useOrchestratorStore,
  type WorkerSession,
  type WorkerStatus,
} from "@/stores/orchestrator-store";
import { AgentIcon } from "./agent-icons";

interface OrchestratorSidebarProps {
  className?: string;
}

export function OrchestratorSidebar({ className }: OrchestratorSidebarProps) {
  const [isNewAgentExpanded, setIsNewAgentExpanded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionsOpen, setSessionsOpen] = useState(true);
  const [workersOpen, setWorkersOpen] = useState(true);

  // Agent selection state
  const [availableAgents, setAvailableAgents] = useState<AgentConfig[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Get selected agent config
  const selectedAgent = availableAgents.find((a) => a.id === selectedAgentId);

  // Load available agents on mount
  useEffect(() => {
    async function loadAgents() {
      try {
        const agents = await listAvailableAgents();
        setAvailableAgents(agents);
        // Default to Claude if available, otherwise first agent
        const defaultAgent = agents.find((a) => a.id === "claude") || agents[0];
        if (defaultAgent) {
          setSelectedAgentId(defaultAgent.id);
        }
      } catch (err) {
        console.error("[Orchestrator] Failed to load agents:", err);
      } finally {
        setLoadingAgents(false);
      }
    }
    loadAgents();
  }, []);

  const {
    sessions,
    activeSessionId,
    setActiveSession,
    setSession,
    addSessionMessage,
    getAllWorkers,
  } = useOrchestratorStore();

  const allWorkers = getAllWorkers();
  const runningWorkers = allWorkers.filter((w) => w.status === "running");

  const handleLaunch = useCallback(async () => {
    if (!prompt.trim() || isLoading || !selectedAgentId) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log(
        "[Orchestrator] Creating ACP session with prompt:",
        prompt,
        "agent:",
        selectedAgentId,
      );

      // All agents now use ACP protocol
      const cwd = process.cwd?.() || "/";
      const session = await createAcpSession(prompt, selectedAgentId, cwd);

      console.log("[Orchestrator] Session created:", session);
      setSession(session);
      // Add the initial prompt as a user message
      addSessionMessage(session.id, {
        type: "TEXT",
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      });
      setActiveSession(session.id);
      setPrompt("");
      setIsNewAgentExpanded(false);
    } catch (err) {
      console.error("[Orchestrator] Failed to create session:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : JSON.stringify(err);
      setError(errorMessage || "Failed to create session");
    } finally {
      setIsLoading(false);
    }
  }, [
    prompt,
    isLoading,
    selectedAgentId,
    setSession,
    addSessionMessage,
    setActiveSession,
  ]);

  const handleCancel = useCallback(() => {
    setIsNewAgentExpanded(false);
    setPrompt("");
    setError(null);
  }, []);

  return (
    <aside
      className={cn(
        "w-52 h-full bg-sidebar border-r border-sidebar-border flex flex-col",
        className,
      )}
    >
      {/* New Agent Button / Form */}
      <div className="p-2 border-b border-sidebar-border">
        {!isNewAgentExpanded ? (
          <button
            type="button"
            onClick={() => setIsNewAgentExpanded(true)}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 px-3 py-1.5",
              "border border-border bg-background text-muted-foreground rounded-md",
              "hover:bg-muted hover:text-foreground transition-colors",
              "text-xs",
            )}
          >
            <Plus className="size-3" />
            New Agent
          </button>
        ) : (
          <div className="space-y-2">
            {/* Agent Picker */}
            <div className="space-y-1">
              <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                Agent
              </label>
              {loadingAgents ? (
                <div className="h-7 flex items-center gap-2 px-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Loading...
                </div>
              ) : availableAgents.length === 0 ? (
                <div className="h-7 flex items-center px-2 text-xs text-destructive">
                  No agents found
                </div>
              ) : (
                <Select
                  value={selectedAgentId}
                  onValueChange={setSelectedAgentId}
                  disabled={isLoading}
                >
                  <SelectTrigger className="h-7 text-xs w-full border-border bg-[#141414]">
                    {selectedAgent ? (
                      <span className="flex items-center gap-1.5">
                        <AgentIcon
                          agentId={selectedAgentId}
                          className="size-3.5 shrink-0"
                        />
                        <span className="truncate">{selectedAgent.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Select agent...
                      </span>
                    )}
                  </SelectTrigger>
                  <SelectContent
                    className="bg-[#141414] border border-[#262626] shadow-xl min-w-[180px]"
                    position="popper"
                    sideOffset={4}
                  >
                    {availableAgents.map((agent) => (
                      <SelectItem
                        key={agent.id}
                        value={agent.id}
                        className="text-xs cursor-pointer pr-3 [&_[data-slot=select-item-indicator]]:!hidden hover:bg-[#262626] data-[state=checked]:bg-accent-orange/20 data-[state=checked]:text-accent-orange"
                      >
                        <span className="flex items-center gap-2">
                          <AgentIcon agentId={agent.id} className="!size-4" />
                          {agent.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* Agent description and env vars */}
              {selectedAgent && (
                <div className="space-y-0.5 px-0.5">
                  <p className="text-[9px] text-muted-foreground leading-tight">
                    {selectedAgent.description}
                  </p>
                  {selectedAgent.env_vars.length > 0 && (
                    <p className="text-[9px] text-muted-foreground/60">
                      Requires: {selectedAgent.env_vars.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>

            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the task..."
              disabled={isLoading}
              className="min-h-[60px] resize-none text-xs bg-background"
            />
            {error && <p className="text-[10px] text-destructive">{error}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handleLaunch}
                disabled={!prompt.trim() || isLoading || !selectedAgentId}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5",
                  "bg-accent-orange text-white rounded-md text-xs font-medium",
                  "hover:bg-accent-orange/90 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Launch"
                )}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isLoading}
                className={cn(
                  "px-2 py-1.5 rounded-md text-xs",
                  "text-muted-foreground hover:bg-muted transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Active Sessions */}
        <CollapsibleSection
          title="ACTIVE SESSIONS"
          count={sessions.length}
          isOpen={sessionsOpen}
          onToggle={() => setSessionsOpen(!sessionsOpen)}
        >
          {sessions.length === 0 ? (
            <p className="px-2 py-1.5 text-[10px] text-muted-foreground/60">
              No sessions yet
            </p>
          ) : (
            <div className="space-y-0.5 px-1.5">
              {sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onClick={() => setActiveSession(session.id)}
                />
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Workers */}
        <CollapsibleSection
          title="WORKERS"
          count={allWorkers.length}
          isOpen={workersOpen}
          onToggle={() => setWorkersOpen(!workersOpen)}
        >
          {allWorkers.length === 0 ? (
            <p className="px-2 py-1.5 text-[10px] text-muted-foreground/60">
              No workers spawned
            </p>
          ) : (
            <div className="space-y-0.5 px-1.5">
              {allWorkers.slice(0, 10).map((worker) => (
                <WorkerItem key={worker.id} worker={worker} />
              ))}
              {allWorkers.length > 10 && (
                <p className="px-2 py-0.5 text-[10px] text-muted-foreground/60">
                  +{allWorkers.length - 10} more
                </p>
              )}
            </div>
          )}
        </CollapsibleSection>
      </div>

      {/* Footer */}
      {runningWorkers.length > 0 && (
        <div className="border-t border-sidebar-border px-2 py-1.5 mt-auto">
          <p className="text-[9px] text-muted-foreground/60">
            {runningWorkers.length} worker
            {runningWorkers.length !== 1 ? "s" : ""} active
          </p>
        </div>
      )}
    </aside>
  );
}

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  count?: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  count,
  isOpen,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="border-b border-sidebar-border">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-sidebar-accent transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="size-2.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-2.5 text-muted-foreground" />
        )}
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
        {count !== undefined && (
          <span className="text-[9px] font-mono text-muted-foreground/60 ml-auto">
            {count}
          </span>
        )}
      </button>
      {isOpen && <div className="pb-1.5">{children}</div>}
    </div>
  );
}

// Session Item Component
interface SessionItemProps {
  session: OrchestratorSession;
  isActive: boolean;
  onClick: () => void;
}

function SessionItem({ session, isActive, onClick }: SessionItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-sm transition-colors",
        isActive
          ? "bg-accent-orange/15 border border-accent-orange/30"
          : "hover:bg-sidebar-accent",
      )}
    >
      <div className="flex items-center gap-1.5">
        <AgentIcon agentId={session.agentType} className="size-3 shrink-0" />
        <span className="text-[11px] truncate flex-1">{session.prompt}</span>
      </div>
      <div className="text-[9px] text-muted-foreground mt-0.5">
        {session.workers.length} worker{session.workers.length !== 1 ? "s" : ""}
      </div>
    </button>
  );
}

// Worker Item Component
interface WorkerItemProps {
  worker: WorkerSession & { sessionPrompt: string };
}

const WORKER_STATUS_ICONS: Record<WorkerStatus, React.ReactNode> = {
  pending: <Clock className="size-3 text-muted-foreground" />,
  running: <Loader2 className="size-3 text-accent-orange animate-spin" />,
  completed: <CheckCircle2 className="size-3 text-green-500" />,
  failed: <AlertCircle className="size-3 text-destructive" />,
  cancelled: <Square className="size-3 text-muted-foreground" />,
};

function WorkerItem({ worker }: WorkerItemProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm hover:bg-sidebar-accent">
      {WORKER_STATUS_ICONS[worker.status]}
      <span className="text-[10px] truncate flex-1">{worker.task}</span>
    </div>
  );
}
