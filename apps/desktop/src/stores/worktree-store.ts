import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Repository, Worktree, WorktreeStatus } from "@/lib/ipc/worktree";

interface WorktreeState {
  repositories: Repository[];
  selectedRepositoryId: string | null;
  selectedWorktreeId: string | null;
  repositoriesExpanded: Record<string, boolean>;
  worktreeStatuses: Record<string, WorktreeStatus>;

  setRepositories: (repos: Repository[]) => void;
  addRepository: (repo: Repository) => void;
  removeRepository: (id: string) => void;
  updateRepository: (id: string, updates: Partial<Repository>) => void;

  selectRepository: (id: string | null) => void;
  selectWorktree: (id: string | null) => void;
  toggleRepositoryExpanded: (id: string) => void;

  setWorktreeStatus: (worktreeId: string, status: WorktreeStatus) => void;

  getSelectedRepository: () => Repository | undefined;
  getSelectedWorktree: () => Worktree | undefined;
}

export const useWorktreeStore = create<WorktreeState>()(
  persist(
    (set, get) => ({
      repositories: [],
      selectedRepositoryId: null,
      selectedWorktreeId: null,
      repositoriesExpanded: {},
      worktreeStatuses: {},

      setRepositories: (repos) => set({ repositories: repos }),

      addRepository: (repo) =>
        set((state) => ({
          repositories: [repo, ...state.repositories],
          repositoriesExpanded: {
            ...state.repositoriesExpanded,
            [repo.id]: true,
          },
        })),

      removeRepository: (id) =>
        set((state) => {
          const newExpanded = { ...state.repositoriesExpanded };
          delete newExpanded[id];
          return {
            repositories: state.repositories.filter((r) => r.id !== id),
            repositoriesExpanded: newExpanded,
            selectedRepositoryId:
              state.selectedRepositoryId === id
                ? null
                : state.selectedRepositoryId,
            selectedWorktreeId:
              state.repositories.find((r) => r.id === id)?.worktrees.some(
                (w) => w.id === state.selectedWorktreeId,
              )
                ? null
                : state.selectedWorktreeId,
          };
        }),

      updateRepository: (id, updates) =>
        set((state) => ({
          repositories: state.repositories.map((r) =>
            r.id === id ? { ...r, ...updates } : r,
          ),
        })),

      selectRepository: (id) => set({ selectedRepositoryId: id }),

      selectWorktree: (id) => set({ selectedWorktreeId: id }),

      toggleRepositoryExpanded: (id) =>
        set((state) => ({
          repositoriesExpanded: {
            ...state.repositoriesExpanded,
            [id]: !state.repositoriesExpanded[id],
          },
        })),

      setWorktreeStatus: (worktreeId, status) =>
        set((state) => ({
          worktreeStatuses: {
            ...state.worktreeStatuses,
            [worktreeId]: status,
          },
        })),

      getSelectedRepository: () => {
        const { repositories, selectedRepositoryId } = get();
        return repositories.find((r) => r.id === selectedRepositoryId);
      },

      getSelectedWorktree: () => {
        const { repositories, selectedWorktreeId } = get();
        for (const repo of repositories) {
          const worktree = repo.worktrees.find(
            (w) => w.id === selectedWorktreeId,
          );
          if (worktree) return worktree;
        }
        return undefined;
      },
    }),
    {
      name: "crafter-code-worktree-store",
      partialize: (state) => ({
        repositories: state.repositories,
        selectedRepositoryId: state.selectedRepositoryId,
        selectedWorktreeId: state.selectedWorktreeId,
        repositoriesExpanded: state.repositoriesExpanded,
      }),
    },
  ),
);
