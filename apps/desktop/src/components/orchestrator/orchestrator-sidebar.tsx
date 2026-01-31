"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Textarea,
} from "@crafter-code/ui";
import { homeDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Loader2,
  MessageSquare,
  Pin,
  Plus,
  Server,
  Sparkles,
  Square,
  Terminal,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";

import {
  type AgentConfig,
  type AgentModel,
  createAcpFleetSession,
  createAcpSession,
  listAvailableAgents,
} from "@/lib/ipc/orchestrator";
import {
  createPrdSession,
  validatePrd,
  parsePrd,
} from "@/lib/ipc/prd";
import type { ValidationResult } from "@/lib/types/prd";
import {
  listWorkspaceCommands,
  listWorkspaceSkills,
  type WorkspaceCommandInfo,
  type WorkspaceSkillInfo,
} from "@/lib/ipc/skills";
import { cn } from "@/lib/utils";

import {
  type AvailableCommand,
  type OrchestratorSession,
  useOrchestratorStore,
} from "@/stores/orchestrator-store";
import {
  type ActiveTerminal,
  type ProjectInfo,
  useWorkspaceStore,
} from "@/stores/workspace-store";
import { AgentIcon } from "./agent-icons";

interface OrchestratorSidebarProps {
  className?: string;
}

export function OrchestratorSidebar({ className }: OrchestratorSidebarProps) {
  const [isNewAgentExpanded, setIsNewAgentExpanded] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mode state: "single" | "fleet"
  const [isFleetMode, setIsFleetMode] = useState(false);
  const [workerCount, setWorkerCount] = useState("3");

  // PRD mode state (optional in Fleet mode)
  const [usePrd, setUsePrd] = useState(false);
  const [prdFile, setPrdFile] = useState<{ name: string; content: string } | null>(null);
  const [prdValidation, setPrdValidation] = useState<ValidationResult | null>(null);
  const [isValidatingPrd, setIsValidatingPrd] = useState(false);

  // Collapsible section states (all open by default)
  const [sessionsOpen, setSessionsOpen] = useState(true);
  const [terminalsOpen, setTerminalsOpen] = useState(true);
  const [skillsOpen, setSkillsOpen] = useState(true);
  const [commandsOpen, setCommandsOpen] = useState(true);

  // Session list pagination
  const [showAllSessions, setShowAllSessions] = useState(false);
  const SESSIONS_LIMIT = 9;

  // Agent selection state (for new agent form)
  const [availableAgents, setAvailableAgents] = useState<AgentConfig[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [loadingAgents, setLoadingAgents] = useState(true);

  // Project selection for NEW agent (local to form, not global)
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(
    null,
  );

  // Skills/commands state (contextual to active session)
  const [globalSkills, setGlobalSkills] = useState<WorkspaceSkillInfo[]>([]);
  const [projectSkills, setProjectSkills] = useState<WorkspaceSkillInfo[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [builtinCommands, setBuiltinCommands] = useState<
    WorkspaceCommandInfo[]
  >([]);
  const [globalCommands, setGlobalCommands] = useState<WorkspaceCommandInfo[]>(
    [],
  );
  const [projectCommands, setProjectCommands] = useState<
    WorkspaceCommandInfo[]
  >([]);

  // Get selected agent config
  const selectedAgent = availableAgents.find((a) => a.id === selectedAgentId);

  // Get selected model (or default)
  const selectedModel = selectedAgent?.models.find((m) => m.id === selectedModelId)
    || selectedAgent?.models.find((m) => m.id === selectedAgent.default_model)
    || selectedAgent?.models[0];

  // Workspace state (for project list)
  const {
    getRecentProjects,
    addRecentProject,
    getRunningTerminals,
    getActiveServers,
    removeTerminal,
  } = useWorkspaceStore();

  const recentProjects = getRecentProjects();
  const runningTerminals = getRunningTerminals();
  const activeServers = getActiveServers();
  const selectedProject = recentProjects.find(
    (p) => p.path === selectedProjectPath,
  );

  // Orchestrator store
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    setSession,
    addSessionMessage,
    getAllWorkers,
    getActiveSession,
    setPendingInput,
    setWorkspaceCommands,
  } = useOrchestratorStore();

  const allWorkers = getAllWorkers();
  const runningWorkers = allWorkers.filter((w) => w.status === "running");
  const activeSession = getActiveSession();

  // Get the project path and agent type for the active session (for contextual skills/commands)
  const activeSessionCwd = activeSession?.cwd;
  const activeAgentId = activeSession?.agentType;

  // Helper to inject text into active session input
  const handleInjectToInput = useCallback(
    (text: string) => {
      if (activeSessionId) {
        setPendingInput(activeSessionId, text);
      }
    },
    [activeSessionId, setPendingInput],
  );

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
          setSelectedModelId(defaultAgent.default_model || "");
        }
      } catch (err) {
        console.error("[Orchestrator] Failed to load agents:", err);
      } finally {
        setLoadingAgents(false);
      }
    }
    loadAgents();
  }, []);

  // Reset model when agent changes
  const handleAgentChange = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    const agent = availableAgents.find((a) => a.id === agentId);
    if (agent) {
      setSelectedModelId(agent.default_model || "");
    }
  }, [availableAgents]);

  // Load global skills when agent changes (or on mount with default)
  useEffect(() => {
    async function loadGlobalSkills() {
      setLoadingSkills(true);
      try {
        const result = await listWorkspaceSkills(undefined, activeAgentId);
        setGlobalSkills(result.globalSkills);
      } catch (err) {
        console.error("[Orchestrator] Failed to load global skills:", err);
      } finally {
        setLoadingSkills(false);
      }
    }
    loadGlobalSkills();
  }, [activeAgentId]);

  // Load project skills when session with cwd is active (or agent changes)
  useEffect(() => {
    async function loadProjectSkills() {
      if (!activeSessionCwd) {
        setProjectSkills([]);
        return;
      }
      try {
        const result = await listWorkspaceSkills(
          activeSessionCwd,
          activeAgentId,
        );
        setProjectSkills(result.projectSkills);
      } catch (err) {
        console.error("[Orchestrator] Failed to load project skills:", err);
      }
    }
    loadProjectSkills();
  }, [activeSessionCwd, activeAgentId]);

  // Load builtin and global commands when agent changes (or on mount with default)
  useEffect(() => {
    async function loadBuiltinCommands() {
      try {
        const result = await listWorkspaceCommands(undefined, activeAgentId);
        setBuiltinCommands(result.builtinCommands);
        setGlobalCommands(result.globalCommands);
      } catch (err) {
        console.error("[Orchestrator] Failed to load builtin commands:", err);
      }
    }
    loadBuiltinCommands();
  }, [activeAgentId]);

  // Load project commands when session with cwd is active (or agent changes)
  useEffect(() => {
    async function loadProjectCommands() {
      if (!activeSessionCwd) {
        setProjectCommands([]);
        return;
      }
      try {
        const result = await listWorkspaceCommands(
          activeSessionCwd,
          activeAgentId,
        );
        setProjectCommands(result.projectCommands);
      } catch (err) {
        console.error("[Orchestrator] Failed to load project commands:", err);
      }
    }
    loadProjectCommands();
  }, [activeSessionCwd, activeAgentId]);

  // Total skills count
  const totalSkillsCount = globalSkills.length + projectSkills.length;

  // Sync workspace commands to store for sharing with input components
  useEffect(() => {
    const commands: AvailableCommand[] = [];

    // Add builtin commands
    for (const cmd of builtinCommands) {
      commands.push({
        name: cmd.name,
        description: cmd.description,
        source: "builtin",
        type: "command",
        input: cmd.inputHint ? { hint: cmd.inputHint } : undefined,
      });
    }

    // Add global/user commands
    for (const cmd of globalCommands) {
      commands.push({
        name: cmd.name,
        description: cmd.description,
        source: "user",
        type: "command",
        input: cmd.inputHint ? { hint: cmd.inputHint } : undefined,
      });
    }

    // Add project commands
    for (const cmd of projectCommands) {
      commands.push({
        name: cmd.name,
        description: cmd.description,
        source: "project",
        type: "command",
        input: cmd.inputHint ? { hint: cmd.inputHint } : undefined,
      });
    }

    // Add global skills
    for (const skill of globalSkills) {
      commands.push({
        name: skill.name,
        description: skill.description,
        source: "user",
        type: "skill",
      });
    }

    // Add project skills
    for (const skill of projectSkills) {
      commands.push({
        name: skill.name,
        description: skill.description,
        source: "project",
        type: "skill",
      });
    }

    setWorkspaceCommands(commands);
  }, [builtinCommands, globalCommands, projectCommands, globalSkills, projectSkills, setWorkspaceCommands]);

  // Handle opening directory picker (for new agent form)
  const handleBrowseDirectory = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Project Directory",
      });
      if (selected && typeof selected === "string") {
        const name = selected.split("/").pop() || selected;
        addRecentProject({ path: selected, name });
        setSelectedProjectPath(selected);
      }
    } catch (err) {
      console.error("[Workspace] Failed to open directory:", err);
    }
  }, [addRecentProject]);

  const handleLaunch = useCallback(async () => {
    // For PRD mode, check PRD validation. For other modes, check prompt
    if (isFleetMode && usePrd) {
      if (!prdValidation?.valid || isLoading || !prdFile) return;
    } else {
      if (!prompt.trim() || isLoading || !selectedAgentId) return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use selected project path, or home directory as fallback
      let cwd: string;
      if (selectedProjectPath) {
        cwd = selectedProjectPath;
      } else {
        try {
          cwd = await homeDir();
        } catch {
          cwd = "/";
        }
      }

      let session;
      if (isFleetMode && usePrd && prdFile) {
        // PRD mode: create PRD session with stories
        const prd = parsePrd(prdFile.content);
        const prdSession = await createPrdSession(prd);
        // Create an orchestrator session to track in UI
        session = {
          id: prdSession.id,
          prompt: `PRD: ${prd.title}`,
          status: "running" as const,
          mode: "default" as const,
          sessionType: "ralph" as const,
          model: "opus" as const,
          agentType: selectedAgentId as "claude" | "gemini" | "codex",
          workers: prdSession.workers.map((w) => ({
            id: w.id,
            sessionId: prdSession.id,
            task: w.currentStoryId || "Idle",
            status: w.status === "working" ? "running" as const : "pending" as const,
            model: w.model,
            agentType: selectedAgentId as "claude" | "gemini" | "codex",
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            outputBuffer: "",
            thinkingBuffer: "",
            messages: [],
            toolCalls: [],
            availableCommands: [],
            filesTouched: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })),
          messages: [],
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCost: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cwd,
          prdSessionId: prdSession.id,
        };
      } else if (isFleetMode) {
        // Fleet mode: spawn multiple workers
        session = await createAcpFleetSession(
          prompt,
          selectedAgentId,
          cwd,
          Number.parseInt(workerCount, 10),
        );
      } else {
        // Single agent mode - pass selected model if different from default
        const modelId = selectedModelId || undefined;
        session = await createAcpSession(prompt, selectedAgentId, cwd, modelId);
      }

      setSession(session);
      if (!(isFleetMode && usePrd)) {
        addSessionMessage(session.id, {
          type: "TEXT",
          role: "user",
          content: prompt,
          timestamp: Date.now(),
        });
      }
      setActiveSession(session.id);
      setPrompt("");
      setPrdFile(null);
      setPrdValidation(null);
      setUsePrd(false);
      setSelectedProjectPath(null); // Reset for next agent
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
    prdFile,
    prdValidation,
    isLoading,
    selectedAgentId,
    selectedModelId,
    selectedProjectPath,
    isFleetMode,
    usePrd,
    workerCount,
    setSession,
    addSessionMessage,
    setActiveSession,
  ]);

  const handleCancel = useCallback(() => {
    setIsNewAgentExpanded(false);
    setPrompt("");
    setPrdFile(null);
    setPrdValidation(null);
    setUsePrd(false);
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
            {/* Mode Toggle */}
            <div className="flex gap-1 p-0.5 bg-muted rounded-md">
              <button
                type="button"
                onClick={() => {
                  setIsFleetMode(false);
                  setUsePrd(false);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors",
                  !isFleetMode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Bot className="size-3" />
                Single
              </button>
              <button
                type="button"
                onClick={() => setIsFleetMode(true)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors",
                  isFleetMode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Users className="size-3" />
                Fleet
              </button>
            </div>

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
                  onValueChange={handleAgentChange}
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
                        disabled={!agent.available}
                        className={cn(
                          "text-xs cursor-pointer pl-2 pr-3 [&_[data-slot=select-item-indicator]]:!hidden hover:bg-[#262626] data-[state=checked]:bg-accent-orange/20 data-[state=checked]:text-accent-orange",
                          !agent.available && "opacity-40 cursor-not-allowed",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <AgentIcon agentId={agent.id} className="!size-4" />
                          {agent.name}
                          {!agent.available && (
                            <span className="text-[9px] text-muted-foreground/50 ml-auto truncate max-w-[100px]">
                              {agent.description.toLowerCase().includes("requires")
                                ? agent.description
                                : "not installed"}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Model Picker (only show if agent has multiple models) */}
            {selectedAgent && selectedAgent.models.length > 1 && (
              <div className="space-y-1">
                <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                  Model
                </label>
                <Select
                  value={selectedModelId || selectedAgent.default_model}
                  onValueChange={setSelectedModelId}
                  disabled={isLoading}
                >
                  <SelectTrigger className="h-7 text-xs w-full border-border bg-[#141414]">
                    {selectedModel ? (
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{selectedModel.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Select model...
                      </span>
                    )}
                  </SelectTrigger>
                  <SelectContent
                    className="bg-[#141414] border border-[#262626] shadow-xl min-w-[180px]"
                    position="popper"
                    sideOffset={4}
                  >
                    {selectedAgent.models.map((model) => (
                      <SelectItem
                        key={model.id}
                        value={model.id}
                        className={cn(
                          "text-xs cursor-pointer pl-2 pr-3 [&_[data-slot=select-item-indicator]]:!hidden hover:bg-[#262626] data-[state=checked]:bg-accent-orange/20 data-[state=checked]:text-accent-orange",
                        )}
                      >
                        <span className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-2">
                            {model.name}
                            {model.id === selectedAgent.default_model && (
                              <span className="text-[8px] text-muted-foreground/50">
                                default
                              </span>
                            )}
                          </span>
                          <span className="text-[9px] text-muted-foreground/60">
                            {model.description}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Project Picker */}
            <div className="space-y-1">
              <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
                Directory
              </label>
              <div className="flex gap-1">
                {recentProjects.length > 0 ? (
                  <Select
                    value={selectedProjectPath || ""}
                    onValueChange={setSelectedProjectPath}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="h-7 text-xs flex-1 border-border bg-[#141414]">
                      {selectedProject ? (
                        <span className="flex items-center gap-1.5 truncate">
                          <FolderOpen className="size-3 shrink-0 text-accent-orange" />
                          <span className="truncate">
                            {selectedProject.name}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Folder className="size-3" />
                          Home directory
                        </span>
                      )}
                    </SelectTrigger>
                    <SelectContent
                      className="bg-[#141414] border border-[#262626] shadow-xl min-w-[180px]"
                      position="popper"
                      sideOffset={4}
                    >
                      {recentProjects.map((project) => (
                        <SelectItem
                          key={project.path}
                          value={project.path}
                          className="text-xs cursor-pointer pl-2 pr-3 hover:bg-[#262626] data-[state=checked]:bg-accent-orange/20 data-[state=checked]:text-accent-orange"
                        >
                          <span className="flex items-center gap-2 w-full">
                            <FolderOpen className="size-3.5 shrink-0" />
                            <span className="truncate flex-1">
                              {project.name}
                            </span>
                            {project.pinned && (
                              <Pin className="size-2.5 text-accent-orange shrink-0" />
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <button
                    type="button"
                    onClick={handleBrowseDirectory}
                    disabled={isLoading}
                    className={cn(
                      "h-7 flex-1 flex items-center gap-1.5 px-2",
                      "text-xs text-muted-foreground",
                      "border border-border bg-[#141414] rounded-md",
                      "hover:bg-[#1a1a1a] hover:text-foreground transition-colors",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    <Folder className="size-3" />
                    Browse...
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleBrowseDirectory}
                  disabled={isLoading}
                  className={cn(
                    "h-7 px-2 flex items-center justify-center",
                    "border border-border bg-[#141414] rounded-md",
                    "text-muted-foreground hover:text-foreground hover:bg-[#1a1a1a]",
                    "transition-colors",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                  title="Browse for directory"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Fleet Configuration (Fleet mode only) */}
            {isFleetMode && (
              <div className="space-y-2">
                {/* Workers + PRD toggle in one row */}
                <div className="flex items-center gap-2">
                  <Select
                    value={workerCount}
                    onValueChange={setWorkerCount}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="h-7 text-xs w-24 border-border bg-[#141414]">
                      <span className="flex items-center gap-1">
                        <Users className="size-3 text-accent-orange" />
                        {workerCount}
                      </span>
                    </SelectTrigger>
                    <SelectContent
                      className="bg-[#141414] border border-[#262626] shadow-xl"
                      position="popper"
                      sideOffset={4}
                    >
                      {["2", "3", "4", "5"].map((n) => (
                        <SelectItem key={n} value={n} className="text-xs">
                          {n} workers{n === "3" ? " (rec)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <button
                    type="button"
                    onClick={() => {
                      setUsePrd(!usePrd);
                      if (usePrd) {
                        setPrdFile(null);
                        setPrdValidation(null);
                      }
                    }}
                    disabled={isLoading}
                    className={cn(
                      "flex-1 h-7 flex items-center justify-center gap-1.5 px-2 rounded-md text-[10px] font-medium transition-colors",
                      usePrd
                        ? "bg-accent-orange/20 text-accent-orange border border-accent-orange/30"
                        : "bg-[#141414] text-muted-foreground border border-border hover:text-foreground hover:bg-[#1a1a1a]",
                    )}
                  >
                    <Sparkles className="size-3" />
                    {usePrd ? "PRD Mode" : "Free-form"}
                  </button>
                </div>

                {/* PRD File Picker (when PRD mode enabled) */}
                {usePrd && (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = ".json,.prd.json";
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) {
                            const text = await file.text();
                            setPrdFile({ name: file.name, content: text });
                            setPrdValidation(null);
                            // Auto-validate
                            setIsValidatingPrd(true);
                            try {
                              const prd = parsePrd(text);
                              const result = await validatePrd(prd);
                              setPrdValidation(result);
                            } catch (err) {
                              setPrdValidation({
                                valid: false,
                                errors: [err instanceof Error ? err.message : "Invalid JSON"],
                                warnings: [],
                                estimatedCost: 0,
                                modelAssignments: {},
                                dependencyOrder: [],
                              });
                            } finally {
                              setIsValidatingPrd(false);
                            }
                          }
                        };
                        input.click();
                      }}
                      disabled={isLoading}
                      className={cn(
                        "w-full h-8 flex items-center justify-center gap-2 px-3",
                        "text-xs border border-dashed rounded-md transition-colors",
                        prdFile
                          ? "border-accent-orange/50 bg-accent-orange/5 text-foreground"
                          : "border-border bg-[#141414] text-muted-foreground hover:border-accent-orange/30 hover:text-foreground",
                      )}
                    >
                      {isValidatingPrd ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : prdFile ? (
                        <>
                          <Sparkles className="size-3.5 text-accent-orange" />
                          <span className="truncate">{prdFile.name}</span>
                          <X
                            className="size-3 ml-auto opacity-50 hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPrdFile(null);
                              setPrdValidation(null);
                            }}
                          />
                        </>
                      ) : (
                        <>
                          <Upload className="size-3.5" />
                          Drop or select .prd.json
                        </>
                      )}
                    </button>

                    {/* Validation Status - compact */}
                    {prdValidation && (
                      <div
                        className={cn(
                          "px-2 py-1.5 rounded text-[10px] flex items-center gap-2",
                          prdValidation.valid
                            ? "bg-green-500/10 text-green-500"
                            : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {prdValidation.valid ? (
                          <>
                            <span className="font-medium">{prdValidation.dependencyOrder.length} stories</span>
                            <span className="text-muted-foreground">~${prdValidation.estimatedCost.toFixed(2)}</span>
                          </>
                        ) : (
                          <span className="truncate">{prdValidation.errors[0]}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Prompt Input (shown unless PRD mode) */}
            {!(isFleetMode && usePrd) && (
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  isFleetMode
                    ? "Describe the task for the fleet..."
                    : "Describe the task..."
                }
                disabled={isLoading}
                className="min-h-[60px] resize-none text-xs bg-background"
              />
            )}

            {error && <p className="text-[10px] text-destructive">{error}</p>}
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handleLaunch}
                disabled={
                  isFleetMode && usePrd
                    ? !prdValidation?.valid || isLoading
                    : !prompt.trim() || isLoading || !selectedAgentId
                }
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
                    {isFleetMode
                      ? usePrd
                        ? "Starting..."
                        : "Launching Fleet..."
                      : "Connecting..."}
                  </>
                ) : isFleetMode ? (
                  <>
                    {usePrd ? <Sparkles className="size-3" /> : <Users className="size-3" />}
                    {usePrd ? "Start" : "Launch Fleet"}
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
              {(showAllSessions
                ? sessions
                : sessions.slice(0, SESSIONS_LIMIT)
              ).map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onClick={() => setActiveSession(session.id)}
                />
              ))}
              {sessions.length > SESSIONS_LIMIT && !showAllSessions && (
                <button
                  type="button"
                  onClick={() => setShowAllSessions(true)}
                  className="w-full px-2 py-1 text-[9px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-accent rounded-sm transition-colors"
                >
                  Show {sessions.length - SESSIONS_LIMIT} more...
                </button>
              )}
              {showAllSessions && sessions.length > SESSIONS_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllSessions(false)}
                  className="w-full px-2 py-1 text-[9px] text-muted-foreground/60 hover:text-muted-foreground hover:bg-sidebar-accent rounded-sm transition-colors"
                >
                  Show less
                </button>
              )}
            </div>
          )}
        </CollapsibleSection>

        {/* Active Terminals / Servers */}
        <CollapsibleSection
          title="TERMINALS"
          count={runningTerminals.length}
          isOpen={terminalsOpen}
          onToggle={() => setTerminalsOpen(!terminalsOpen)}
        >
          {runningTerminals.length === 0 ? (
            <p className="px-2 py-1.5 text-[10px] text-muted-foreground/60">
              No active terminals
            </p>
          ) : (
            <div className="space-y-0.5 px-1.5">
              {/* Active Servers first */}
              {activeServers.length > 0 && (
                <>
                  <p className="px-1.5 pt-1 text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50">
                    Servers
                  </p>
                  {activeServers.map((terminal) => (
                    <TerminalItem
                      key={terminal.id}
                      terminal={terminal}
                      isServer
                      onKill={() => removeTerminal(terminal.id)}
                    />
                  ))}
                </>
              )}
              {/* Other running terminals */}
              {runningTerminals.filter((t) => !t.port).length > 0 && (
                <>
                  {activeServers.length > 0 && (
                    <p className="px-1.5 pt-1 text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50">
                      Processes
                    </p>
                  )}
                  {runningTerminals
                    .filter((t) => !t.port)
                    .map((terminal) => (
                      <TerminalItem
                        key={terminal.id}
                        terminal={terminal}
                        onKill={() => removeTerminal(terminal.id)}
                      />
                    ))}
                </>
              )}
            </div>
          )}
        </CollapsibleSection>

        {/* Skills (global always, project when session active) */}
        <CollapsibleSection
          title="SKILLS"
          count={totalSkillsCount}
          isOpen={skillsOpen}
          onToggle={() => setSkillsOpen(!skillsOpen)}
        >
          {loadingSkills ? (
            <p className="px-2 py-1.5 text-[10px] text-muted-foreground/60 flex items-center gap-1.5">
              <Loader2 className="size-2.5 animate-spin" />
              Loading...
            </p>
          ) : totalSkillsCount === 0 ? (
            <p className="px-2 py-1.5 text-[10px] text-muted-foreground/60">
              No skills in ~/.claude/skills/
            </p>
          ) : (
            <div className="space-y-0.5 px-1.5 max-h-[300px] overflow-y-auto">
              {/* Global/User Skills */}
              {globalSkills.length > 0 && (
                <div>
                  <p className="px-1.5 pt-1.5 pb-0.5 text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50 flex items-center gap-1">
                    <User className="size-2" />
                    Global
                    <span className="text-muted-foreground/30">
                      ({globalSkills.length})
                    </span>
                  </p>
                  {globalSkills.slice(0, 20).map((skill) => (
                    <WorkspaceSkillItem
                      key={skill.path}
                      skill={skill}
                      onInject={
                        activeSessionId ? handleInjectToInput : undefined
                      }
                    />
                  ))}
                  {globalSkills.length > 20 && (
                    <p className="px-2 py-0.5 text-[9px] text-muted-foreground/50">
                      +{globalSkills.length - 20} more
                    </p>
                  )}
                </div>
              )}
              {/* Project Skills */}
              {projectSkills.length > 0 && (
                <div>
                  <p className="px-1.5 pt-1.5 pb-0.5 text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50 flex items-center gap-1">
                    <Folder className="size-2" />
                    Project
                    <span className="text-muted-foreground/30">
                      ({projectSkills.length})
                    </span>
                  </p>
                  {projectSkills.slice(0, 20).map((skill) => (
                    <WorkspaceSkillItem
                      key={skill.path}
                      skill={skill}
                      onInject={
                        activeSessionId ? handleInjectToInput : undefined
                      }
                    />
                  ))}
                  {projectSkills.length > 20 && (
                    <p className="px-2 py-0.5 text-[9px] text-muted-foreground/50">
                      +{projectSkills.length - 20} more
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>

        {/* Commands (builtin always, project when session active) */}
        <CollapsibleSection
          title="COMMANDS"
          count={
            builtinCommands.length +
            globalCommands.length +
            projectCommands.length
          }
          isOpen={commandsOpen}
          onToggle={() => setCommandsOpen(!commandsOpen)}
        >
          {builtinCommands.length === 0 ? (
            <p className="px-2 py-1.5 text-[10px] text-muted-foreground/60">
              Loading commands...
            </p>
          ) : (
            <div className="space-y-0.5 px-1.5 max-h-[300px] overflow-y-auto">
              {/* Built-in commands grouped by category */}
              {["swarm", "code", "git", "analysis", "utility"].map(
                (category) => {
                  const categoryCommands = builtinCommands.filter(
                    (c) => c.category === category,
                  );
                  if (categoryCommands.length === 0) return null;
                  return (
                    <div key={category}>
                      <p className="px-1.5 pt-1.5 pb-0.5 text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50">
                        {category}
                        <span className="text-muted-foreground/30 ml-1">
                          ({categoryCommands.length})
                        </span>
                      </p>
                      {categoryCommands.map((cmd) => (
                        <WorkspaceCommandItem
                          key={cmd.name}
                          command={cmd}
                          onInject={
                            activeSessionId ? handleInjectToInput : undefined
                          }
                        />
                      ))}
                    </div>
                  );
                },
              )}
              {/* Global/User commands from ~/.claude/commands/ */}
              {globalCommands.length > 0 && (
                <div>
                  <p className="px-1.5 pt-1.5 pb-0.5 text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50 flex items-center gap-1">
                    <User className="size-2" />
                    Global
                    <span className="text-muted-foreground/30">
                      ({globalCommands.length})
                    </span>
                  </p>
                  {globalCommands.slice(0, 30).map((cmd) => (
                    <WorkspaceCommandItem
                      key={cmd.name}
                      command={cmd}
                      onInject={
                        activeSessionId ? handleInjectToInput : undefined
                      }
                    />
                  ))}
                  {globalCommands.length > 30 && (
                    <p className="px-2 py-0.5 text-[9px] text-muted-foreground/50">
                      +{globalCommands.length - 30} more
                    </p>
                  )}
                </div>
              )}
              {/* Project commands (when session active) */}
              {projectCommands.length > 0 && (
                <div>
                  <p className="px-1.5 pt-1.5 pb-0.5 text-[8px] font-mono uppercase tracking-wider text-muted-foreground/50 flex items-center gap-1">
                    <Folder className="size-2" />
                    Project
                    <span className="text-muted-foreground/30">
                      ({projectCommands.length})
                    </span>
                  </p>
                  {projectCommands.map((cmd) => (
                    <WorkspaceCommandItem
                      key={cmd.name}
                      command={cmd}
                      onInject={
                        activeSessionId ? handleInjectToInput : undefined
                      }
                    />
                  ))}
                </div>
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
  icon?: React.ReactNode;
}

function CollapsibleSection({
  title,
  count,
  isOpen,
  onToggle,
  children,
  icon,
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
        {icon && <span className="text-muted-foreground">{icon}</span>}
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

// Relative time utility
function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

// Session Item Component
interface SessionItemProps {
  session: OrchestratorSession;
  isActive: boolean;
  onClick: () => void;
}

function SessionItem({ session, isActive, onClick }: SessionItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const relativeTime = getRelativeTime(session.updatedAt || session.createdAt);
  const messageCount =
    (session.messages?.length || 0) +
    session.workers.reduce((acc, w) => acc + (w.messages?.length || 0), 0);

  // Get running workers for this session
  const runningWorkers = session.workers.filter((w) => w.status === "running");
  const hasRunningWorkers = runningWorkers.length > 0;

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full text-left px-1.5 py-0.5 rounded-sm transition-colors flex items-center gap-1.5 min-w-0",
          isActive
            ? "bg-accent-orange/15 border border-accent-orange/30"
            : "hover:bg-sidebar-accent",
        )}
      >
        {hasRunningWorkers ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="size-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <AgentIcon agentId={session.agentType} className="size-3 shrink-0" />
        )}
        <span className="text-[10px] truncate flex-1 min-w-0">
          {session.prompt}
        </span>
        <span className="text-[8px] text-muted-foreground/40 shrink-0 tabular-nums flex items-center gap-0.5">
          {messageCount > 0 && (
            <>
              <span>{messageCount}</span>
              <MessageSquare className="size-2" />
              <span className="mx-0.5">·</span>
            </>
          )}
          {relativeTime}
        </span>
      </button>

      {/* Nested workers when expanded */}
      {isExpanded && hasRunningWorkers && (
        <div className="ml-3 pl-2 border-l border-border/50 space-y-0.5">
          {runningWorkers.map((worker) => (
            <div
              key={worker.id}
              className="flex items-center gap-1.5 px-1.5 py-0.5 text-[9px] text-muted-foreground"
            >
              <span className="size-1.5 rounded-full bg-accent-orange animate-pulse shrink-0" />
              <span className="truncate flex-1">
                {worker.task || "Working..."}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Terminal Item Component
interface TerminalItemProps {
  terminal: ActiveTerminal;
  isServer?: boolean;
  onKill: () => void;
}

function TerminalItem({ terminal, isServer, onKill }: TerminalItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Format command for display
  const displayCommand = terminal.args
    ? `${terminal.command} ${terminal.args.join(" ")}`
    : terminal.command;
  const truncatedCommand =
    displayCommand.length > 30
      ? displayCommand.slice(0, 27) + "..."
      : displayCommand;

  return (
    <div
      className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm hover:bg-sidebar-accent group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isServer ? (
        <Server className="size-3 shrink-0 text-green-500" />
      ) : (
        <Terminal className="size-3 shrink-0 text-muted-foreground" />
      )}
      <span className="text-[9px] truncate flex-1" title={displayCommand}>
        {truncatedCommand}
      </span>
      {terminal.port && (
        <span className="text-[8px] font-mono text-green-500 shrink-0">
          :{terminal.port}
        </span>
      )}
      {terminal.running && (
        <span className="size-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
      )}
      {isHovered && terminal.running && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onKill();
          }}
          className="p-0.5 hover:bg-destructive/20 rounded transition-colors"
          title="Kill process"
        >
          <X className="size-2.5 text-destructive" />
        </button>
      )}
    </div>
  );
}

// Workspace Skill Item Component (for SKILL.md files)
interface WorkspaceSkillItemProps {
  skill: WorkspaceSkillInfo;
  onInject?: (text: string) => void;
}

function WorkspaceSkillItem({ skill, onInject }: WorkspaceSkillItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleInject = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInject?.(`@${skill.name} `);
  };

  return (
    <div
      className="group cursor-pointer"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-sm hover:bg-sidebar-accent h-6">
        <span className="text-[9px] font-mono text-foreground/80 truncate flex-1 min-w-0">
          {skill.name}
        </span>
        {onInject && (
          <button
            type="button"
            onClick={handleInject}
            className="opacity-0 group-hover:opacity-100 flex items-center justify-center size-4 rounded-sm bg-accent-orange/20 hover:bg-accent-orange/40 text-accent-orange transition-opacity shrink-0"
            title="Add to input"
          >
            <Plus className="size-2.5" />
          </button>
        )}
      </div>
      {isExpanded && (
        <div className="px-3 pb-1 space-y-0.5">
          <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
            {skill.description}
          </p>
        </div>
      )}
    </div>
  );
}

// Workspace Command Item Component (for built-in slash commands)
interface WorkspaceCommandItemProps {
  command: WorkspaceCommandInfo;
  onInject?: (command: string) => void;
}

function WorkspaceCommandItem({
  command,
  onInject,
}: WorkspaceCommandItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleInject = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInject?.(`/${command.name} `);
  };

  return (
    <div
      className="group cursor-pointer"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-sm hover:bg-sidebar-accent h-6">
        <span className="text-[9px] font-mono text-foreground/80 truncate flex-1 min-w-0">
          /{command.name}
        </span>
        {command.inputHint && (
          <span className="text-[8px] text-muted-foreground/40 truncate max-w-[40px] group-hover:opacity-0 transition-opacity">
            {command.inputHint}
          </span>
        )}
        {onInject && (
          <button
            type="button"
            onClick={handleInject}
            className="opacity-0 group-hover:opacity-100 flex items-center justify-center size-4 rounded-sm bg-accent-orange/20 hover:bg-accent-orange/40 text-accent-orange transition-opacity shrink-0"
            title="Add to input"
          >
            <Plus className="size-2.5" />
          </button>
        )}
      </div>
      {isExpanded && (
        <p className="px-3 pb-1 text-[9px] text-muted-foreground/70 leading-relaxed">
          {command.description}
        </p>
      )}
    </div>
  );
}
