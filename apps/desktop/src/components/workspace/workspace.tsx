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
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Terminal } from "@/components/terminal/terminal";
import { FileTree } from "@/components/file-tree/file-tree";
import { SessionPanel } from "@/components/session/session-panel";
import { NewSessionDialog } from "@/components/session/new-session-dialog";
import { useAgentStore } from "@/stores/agent-store";
import { getProjectInfo, type ProjectInfo } from "@/lib/ipc/commands";

export function Workspace() {
  const { projectPath, setProjectPath } = useAgentStore();
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [terminalId, setTerminalId] = useState<string | null>(null);

  // Load project info when path changes
  useEffect(() => {
    if (!projectPath) {
      // Default to home directory
      const home = process.env.HOME || "/Users";
      setProjectPath(home);
      return;
    }

    getProjectInfo(projectPath)
      .then(setProjectInfo)
      .catch((err) => console.error("Failed to load project info:", err));
  }, [projectPath, setProjectPath]);

  const handleFileSelect = useCallback((path: string) => {
    console.log("File selected:", path);
    // TODO: Open file in editor or preview
  }, []);

  const handleTerminalReady = useCallback((id: string) => {
    setTerminalId(id);
  }, []);

  const handleSessionCreated = useCallback(
    (sessionId: string) => {
      // TODO: Start the agent in the terminal
      console.log("Session created:", sessionId);
    },
    []
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Title Bar */}
      <header className="h-10 flex items-center justify-between px-4 border-b border-border bg-sidebar shrink-0">
        <div className="flex items-center gap-3">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="size-5"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          <span className="font-mono text-sm font-medium">crafter/code</span>
        </div>

        {projectInfo && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <FolderOpen className="size-3.5" />
              <span>{projectInfo.name}</span>
            </div>
            {projectInfo.git_branch && (
              <div className="flex items-center gap-1.5">
                <GitBranch className="size-3.5" />
                <span>{projectInfo.git_branch}</span>
                {projectInfo.git_status === "clean" ? (
                  <CheckCircle2 className="size-3 text-green-500" />
                ) : (
                  <AlertCircle className="size-3 text-yellow-500" />
                )}
              </div>
            )}
          </div>
        )}

        <div className="w-[120px]" /> {/* Spacer for symmetry */}
      </header>

      {/* Main Content */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        {/* Sidebar - File Tree */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={35}>
          <div className="h-full flex flex-col bg-sidebar">
            <div className="px-4 py-3 border-b border-sidebar-border">
              <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Explorer
              </h2>
            </div>
            {projectPath && (
              <FileTree
                rootPath={projectPath}
                className="flex-1"
                onFileSelect={handleFileSelect}
              />
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Main Area */}
        <ResizablePanel defaultSize={55}>
          <ResizablePanelGroup orientation="vertical">
            {/* Terminal */}
            <ResizablePanel defaultSize={100}>
              <div className="h-full flex flex-col">
                <div className="px-4 py-2 border-b border-border bg-card flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full bg-accent-orange" />
                    <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Terminal
                    </span>
                  </div>
                  {terminalId && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {terminalId.slice(0, 8)}
                    </span>
                  )}
                </div>
                <div className="flex-1 p-1">
                  <Terminal
                    cwd={projectPath || undefined}
                    onReady={handleTerminalReady}
                  />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Sidebar - Sessions */}
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <SessionPanel
            className="h-full"
            onNewSession={() => setShowNewSession(true)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Status Bar */}
      <footer className="h-6 flex items-center justify-between px-4 border-t border-border bg-sidebar text-xs text-muted-foreground shrink-0">
        <div className="flex items-center gap-4">
          <span>Ready</span>
        </div>
        <div className="flex items-center gap-4">
          <span>v0.1.0</span>
        </div>
      </footer>

      {/* New Session Dialog */}
      <NewSessionDialog
        open={showNewSession}
        onOpenChange={setShowNewSession}
        onSessionCreated={handleSessionCreated}
      />
    </div>
  );
}
