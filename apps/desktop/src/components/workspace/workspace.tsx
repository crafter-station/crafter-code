"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@crafter-code/ui";
import {
  FolderOpen,
  GitBranch,
  AlertCircle,
  CheckCircle2,
  X,
  FileCode,
  Users,
  Terminal as TerminalIcon,
  Plus,
  Clock,
  DollarSign,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Terminal } from "@/components/terminal/terminal";
import { FileTree } from "@/components/file-tree/file-tree";
import { OrchestratorDashboard } from "@/components/orchestrator";
import { useAgentStore } from "@/stores/agent-store";
import { useOrchestratorStore } from "@/stores/orchestrator-store";
import { getProjectInfo, readFileContent, type ProjectInfo } from "@/lib/ipc/commands";

type ViewMode = "fleet" | "terminal";

export function Workspace() {
  const { projectPath, setProjectPath } = useAgentStore();
  const {
    sessions: fleets,
    activeSessionId,
    setActiveSession,
    getTotalCost
  } = useOrchestratorStore();
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<{ path: string; content: string } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("fleet");

  useEffect(() => {
    if (!projectPath) {
      const home = "/Users";
      setProjectPath(home);
      return;
    }

    getProjectInfo(projectPath)
      .then(setProjectInfo)
      .catch((err) => console.error("Failed to load project info:", err));
  }, [projectPath, setProjectPath]);

  const handleFileSelect = useCallback(async (path: string) => {
    try {
      const content = await readFileContent(path);
      setOpenFile({ path, content });
    } catch (err) {
      console.error("Failed to read file:", err);
    }
  }, []);

  const handleTerminalReady = useCallback((id: string) => {
    setTerminalId(id);
  }, []);

  const handleCloseFile = useCallback(() => {
    setOpenFile(null);
  }, []);

  const fileName = openFile?.path.split("/").pop() || "";
  const activeFleet = fleets.find(f => f.id === activeSessionId);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* macOS Titlebar */}
      <header
        className="h-9 flex items-center px-3 border-b border-border/50 bg-card shrink-0"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2" style={{ paddingLeft: '70px' }} data-tauri-drag-region>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="size-3.5 text-accent-orange"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span className="font-mono text-[11px] font-medium text-muted-foreground/80">crafter/code</span>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3 text-[11px] text-muted-foreground" data-tauri-drag-region>
          {projectInfo && (
            <>
              <div className="flex items-center gap-1.5">
                <FolderOpen className="size-3" />
                <span>{projectInfo.name}</span>
              </div>
              {projectInfo.git_branch && (
                <div className="flex items-center gap-1">
                  <GitBranch className="size-3" />
                  <span>{projectInfo.git_branch}</span>
                  {projectInfo.git_status === "clean" ? (
                    <CheckCircle2 className="size-2.5 text-green-500" />
                  ) : (
                    <AlertCircle className="size-2.5 text-yellow-500" />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </header>

      {/* Main Content */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar - File Tree */}
        <ResizablePanel defaultSize={20} minSize={12} maxSize={30}>
          <div className="h-full w-full flex flex-col bg-card overflow-hidden">
            <div className="px-3 py-1.5 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Explorer
              </span>
            </div>
            <div className="flex-1 overflow-auto p-1">
              {projectPath && (
                <FileTree
                  rootPath={projectPath}
                  onFileSelect={handleFileSelect}
                />
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Center - Fleet/Terminal */}
        <ResizablePanel defaultSize={58} minSize={30} maxSize={70}>
          <div className="h-full w-full flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="h-9 flex items-center px-2 border-b border-border bg-card shrink-0">
              <div className="flex items-center gap-1">
                {openFile && (
                  <div className="flex items-center gap-2 px-3 py-1 rounded-t bg-background text-sm">
                    <FileCode className="size-3.5 text-muted-foreground" />
                    <span className="text-xs">{fileName}</span>
                    <button
                      type="button"
                      onClick={handleCloseFile}
                      className="ml-1 p-0.5 rounded hover:bg-muted"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )}
                {!openFile && (
                  <>
                    <button
                      type="button"
                      onClick={() => setViewMode("fleet")}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors",
                        viewMode === "fleet" ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      <Users className="size-3.5" />
                      <span className="text-xs font-medium">Fleet</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("terminal")}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors",
                        viewMode === "terminal" ? "bg-background text-foreground" : "text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      <TerminalIcon className="size-3.5" />
                      <span className="text-xs font-medium">Terminal</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="relative flex-1 min-h-0 overflow-hidden">
              {openFile && (
                <div className="absolute inset-0 overflow-auto bg-background p-4 font-mono text-sm">
                  <pre className="whitespace-pre-wrap break-all text-xs leading-relaxed">
                    {openFile.content}
                  </pre>
                </div>
              )}

              {!openFile && viewMode === "terminal" && (
                <div className="terminal-container">
                  <Terminal
                    cwd={projectPath || undefined}
                    onReady={handleTerminalReady}
                  />
                </div>
              )}

              {!openFile && viewMode === "fleet" && (
                <div className="absolute inset-0">
                  <OrchestratorDashboard />
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Sidebar - Fleet History */}
        <ResizablePanel defaultSize={22} minSize={15} maxSize={35}>
          <div className="h-full w-full flex flex-col bg-card overflow-hidden">
            <div className="px-3 py-1.5 flex items-center justify-between border-b border-border">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Fleet History
              </span>
            </div>

            <div className="flex-1 overflow-auto">
              {fleets.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  <Users className="size-8 mx-auto mb-2 opacity-30" />
                  <p>No fleets yet</p>
                  <p className="text-xs mt-1">Launch a fleet to see it here</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {fleets.map((fleet) => (
                    <button
                      key={fleet.id}
                      type="button"
                      onClick={() => setActiveSession(fleet.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-lg transition-colors",
                        fleet.id === activeSessionId
                          ? "bg-accent-orange/10 border border-accent-orange/30"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <StatusDot status={fleet.status} />
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {fleet.workers.length} workers
                        </span>
                      </div>
                      <p className="text-sm truncate mb-2">{fleet.prompt}</p>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatTime(fleet.createdAt)}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="size-3" />
                          ${fleet.totalCost.toFixed(4)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Total Cost Footer */}
            <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Total spent</span>
                <span className="font-mono text-green-500">${getTotalCost().toFixed(4)}</span>
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Status Bar */}
      <footer className="h-5 flex items-center justify-between px-3 border-t border-border bg-card text-[10px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-green-500" />
            Ready
          </span>
          {activeFleet && (
            <span className="flex items-center gap-1 text-accent-orange">
              <Users className="size-3" />
              {activeFleet.workers.filter(w => w.status === "running").length} running
            </span>
          )}
        </div>
        <span className="font-mono">v0.1.0</span>
      </footer>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    planning: "bg-blue-500 animate-pulse",
    running: "bg-accent-orange animate-pulse",
    completed: "bg-green-500",
    failed: "bg-destructive",
    cancelled: "bg-muted-foreground",
  };

  return <span className={cn("size-2 rounded-full", colors[status] || "bg-muted-foreground")} />;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
