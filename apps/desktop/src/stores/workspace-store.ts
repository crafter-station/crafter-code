import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Project directory information
 */
export interface ProjectInfo {
  /** Absolute path to the project directory */
  path: string;
  /** Display name (usually folder name) */
  name: string;
  /** Git branch if available */
  gitBranch?: string;
  /** Last accessed timestamp */
  lastAccessed: number;
  /** Whether this is a favorite/pinned project */
  pinned?: boolean;
}

/**
 * Active terminal/server running in a workspace
 */
export interface ActiveTerminal {
  /** Terminal ID from ACP */
  id: string;
  /** Session ID this terminal belongs to */
  sessionId: string;
  /** Command that was executed */
  command: string;
  /** Arguments passed to the command */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Whether the process is still running */
  running: boolean;
  /** Exit code if completed */
  exitCode?: number;
  /** Detected port if this is a server */
  port?: number;
  /** Output buffer (truncated for display) */
  outputPreview?: string;
  /** Created timestamp */
  createdAt: number;
}

interface WorkspaceState {
  /** Global vault directory (default workspace) */
  vaultPath: string | null;

  /** Recently used project directories */
  recentProjects: ProjectInfo[];

  /** Maximum number of recent projects to keep */
  maxRecentProjects: number;

  /** Currently selected project for new sessions */
  currentProjectPath: string | null;

  /** Active terminals/servers across all sessions */
  activeTerminals: ActiveTerminal[];

  // Vault actions
  setVaultPath: (path: string | null) => void;
  getVaultPath: () => string | null;

  // Project actions
  setCurrentProject: (path: string | null) => void;
  getCurrentProject: () => ProjectInfo | null;
  addRecentProject: (project: Omit<ProjectInfo, "lastAccessed">) => void;
  removeRecentProject: (path: string) => void;
  toggleProjectPin: (path: string) => void;
  getRecentProjects: () => ProjectInfo[];
  getPinnedProjects: () => ProjectInfo[];

  // Terminal actions
  addTerminal: (terminal: Omit<ActiveTerminal, "createdAt">) => void;
  updateTerminal: (id: string, updates: Partial<ActiveTerminal>) => void;
  removeTerminal: (id: string) => void;
  getTerminalsBySession: (sessionId: string) => ActiveTerminal[];
  getRunningTerminals: () => ActiveTerminal[];
  getActiveServers: () => ActiveTerminal[];
  clearSessionTerminals: (sessionId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      vaultPath: null,
      recentProjects: [],
      maxRecentProjects: 10,
      currentProjectPath: null,
      activeTerminals: [],

      // Vault actions
      setVaultPath: (path) => {
        set({ vaultPath: path });
      },

      getVaultPath: () => {
        return get().vaultPath;
      },

      // Project actions
      setCurrentProject: (path) => {
        set({ currentProjectPath: path });

        // Also add to recent if it's a new project
        if (path) {
          const existing = get().recentProjects.find((p) => p.path === path);
          if (!existing) {
            // Extract name from path
            const name = path.split("/").pop() || path;
            get().addRecentProject({ path, name });
          } else {
            // Update last accessed time
            set((state) => ({
              recentProjects: state.recentProjects.map((p) =>
                p.path === path ? { ...p, lastAccessed: Date.now() } : p
              ),
            }));
          }
        }
      },

      getCurrentProject: () => {
        const { currentProjectPath, recentProjects, vaultPath } = get();

        if (currentProjectPath) {
          const project = recentProjects.find((p) => p.path === currentProjectPath);
          if (project) return project;

          // Return a basic project info if not in recents
          return {
            path: currentProjectPath,
            name: currentProjectPath.split("/").pop() || currentProjectPath,
            lastAccessed: Date.now(),
          };
        }

        // Fall back to vault path
        if (vaultPath) {
          return {
            path: vaultPath,
            name: vaultPath.split("/").pop() || "Vault",
            lastAccessed: Date.now(),
          };
        }

        return null;
      },

      addRecentProject: (project) => {
        set((state) => {
          const newProject: ProjectInfo = {
            ...project,
            lastAccessed: Date.now(),
          };

          // Remove if already exists (will be re-added at top)
          const filtered = state.recentProjects.filter(
            (p) => p.path !== project.path
          );

          // Add at beginning and limit size
          const updated = [newProject, ...filtered].slice(
            0,
            state.maxRecentProjects
          );

          return { recentProjects: updated };
        });
      },

      removeRecentProject: (path) => {
        set((state) => ({
          recentProjects: state.recentProjects.filter((p) => p.path !== path),
          currentProjectPath:
            state.currentProjectPath === path ? null : state.currentProjectPath,
        }));
      },

      toggleProjectPin: (path) => {
        set((state) => ({
          recentProjects: state.recentProjects.map((p) =>
            p.path === path ? { ...p, pinned: !p.pinned } : p
          ),
        }));
      },

      getRecentProjects: () => {
        const { recentProjects } = get();
        // Sort by pinned first, then by last accessed
        return [...recentProjects].sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return b.lastAccessed - a.lastAccessed;
        });
      },

      getPinnedProjects: () => {
        return get().recentProjects.filter((p) => p.pinned);
      },

      // Terminal actions
      addTerminal: (terminal) => {
        set((state) => {
          // Prevent duplicate terminals
          if (state.activeTerminals.some((t) => t.id === terminal.id)) {
            return state;
          }
          return {
            activeTerminals: [
              ...state.activeTerminals,
              { ...terminal, createdAt: Date.now() },
            ],
          };
        });
      },

      updateTerminal: (id, updates) => {
        set((state) => ({
          activeTerminals: state.activeTerminals.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));
      },

      removeTerminal: (id) => {
        set((state) => ({
          activeTerminals: state.activeTerminals.filter((t) => t.id !== id),
        }));
      },

      getTerminalsBySession: (sessionId) => {
        return get().activeTerminals.filter((t) => t.sessionId === sessionId);
      },

      getRunningTerminals: () => {
        return get().activeTerminals.filter((t) => t.running);
      },

      getActiveServers: () => {
        return get().activeTerminals.filter((t) => t.running && t.port);
      },

      clearSessionTerminals: (sessionId) => {
        set((state) => ({
          activeTerminals: state.activeTerminals.filter(
            (t) => t.sessionId !== sessionId
          ),
        }));
      },
    }),
    {
      name: "crafter-code-workspace-store",
      partialize: (state) => ({
        vaultPath: state.vaultPath,
        recentProjects: state.recentProjects,
        currentProjectPath: state.currentProjectPath,
        // Don't persist activeTerminals - they're runtime state
      }),
    }
  )
);

/**
 * Helper to detect if a command looks like a server
 */
export function detectServerCommand(command: string, args?: string[]): boolean {
  const serverPatterns = [
    /^(npm|yarn|pnpm|bun)\s+(run\s+)?(dev|start|serve)/i,
    /^(node|deno|bun)\s+.*server/i,
    /^(python|python3)\s+.*(-m\s+)?http\.server/i,
    /^(uvicorn|gunicorn|flask|django)/i,
    /^(cargo\s+)?run.*--release/i,
    /^docker\s+(run|compose)/i,
  ];

  const fullCommand = args ? `${command} ${args.join(" ")}` : command;
  return serverPatterns.some((pattern) => pattern.test(fullCommand));
}

/**
 * Helper to extract port from command or output
 */
export function extractPort(text: string): number | undefined {
  // Common patterns: "localhost:3000", "port 8080", "listening on 5173"
  const patterns = [
    /localhost:(\d+)/i,
    /127\.0\.0\.1:(\d+)/i,
    /0\.0\.0\.0:(\d+)/i,
    /port\s*[=:]?\s*(\d+)/i,
    /listening\s+on\s+.*?(\d{4,5})/i,
    /:(\d{4,5})(?:\s|$|\/)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const port = parseInt(match[1], 10);
      if (port >= 1024 && port <= 65535) {
        return port;
      }
    }
  }

  return undefined;
}
