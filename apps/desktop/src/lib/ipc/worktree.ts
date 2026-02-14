import { invoke } from "@tauri-apps/api/core";

export interface Repository {
  id: string;
  name: string;
  rootPath: string;
  defaultBranch: string;
  worktrees: Worktree[];
  addedAt: number;
}

export interface Worktree {
  id: string;
  name: string;
  branch: string;
  workingDirectory: string;
  repositoryId: string;
  isMain: boolean;
  createdAt: number;
}

export interface WorktreeStatus {
  worktreeId: string;
  modifiedFiles: number;
  stagedFiles: number;
  untrackedFiles: number;
  ahead: number;
  behind: number;
}

interface RawRepository {
  id: string;
  name: string;
  root_path: string;
  default_branch: string;
  worktrees: RawWorktree[];
  added_at: number;
}

interface RawWorktree {
  id: string;
  name: string;
  branch: string;
  working_directory: string;
  repository_id: string;
  is_main: boolean;
  created_at: number;
}

interface RawWorktreeStatus {
  worktree_id: string;
  modified_files: number;
  staged_files: number;
  untracked_files: number;
  ahead: number;
  behind: number;
}

function transformRepository(raw: RawRepository): Repository {
  return {
    id: raw.id,
    name: raw.name,
    rootPath: raw.root_path,
    defaultBranch: raw.default_branch,
    worktrees: raw.worktrees.map(transformWorktree),
    addedAt: toMs(raw.added_at),
  };
}

function transformWorktree(raw: RawWorktree): Worktree {
  return {
    id: raw.id,
    name: raw.name,
    branch: raw.branch,
    workingDirectory: raw.working_directory,
    repositoryId: raw.repository_id,
    isMain: raw.is_main,
    createdAt: toMs(raw.created_at),
  };
}

function transformWorktreeStatus(raw: RawWorktreeStatus): WorktreeStatus {
  return {
    worktreeId: raw.worktree_id,
    modifiedFiles: raw.modified_files,
    stagedFiles: raw.staged_files,
    untrackedFiles: raw.untracked_files,
    ahead: raw.ahead,
    behind: raw.behind,
  };
}

function toMs(ts: number): number {
  if (ts < 1e12) return ts * 1000;
  return ts;
}

export async function listRepositories(): Promise<Repository[]> {
  const repos = await invoke<RawRepository[]>("list_repositories");
  return repos.map(transformRepository);
}

export async function addRepository(path: string): Promise<Repository> {
  const repo = await invoke<RawRepository>("add_repository", { path });
  return transformRepository(repo);
}

export async function removeRepository(id: string): Promise<void> {
  return invoke<void>("remove_repository", { id });
}

export async function listWorktrees(repoId: string): Promise<Worktree[]> {
  const worktrees = await invoke<RawWorktree[]>("list_worktrees", { repoId });
  return worktrees.map(transformWorktree);
}

export async function createWorktree(
  repoId: string,
  baseRef?: string,
): Promise<Worktree> {
  const worktree = await invoke<RawWorktree>("create_worktree", {
    repoId,
    baseRef: baseRef || null,
  });
  return transformWorktree(worktree);
}

export async function deleteWorktree(
  repoId: string,
  worktreeId: string,
): Promise<void> {
  return invoke<void>("delete_worktree", { repoId, worktreeId });
}

export async function getWorktreeStatus(
  worktreeId: string,
): Promise<WorktreeStatus> {
  const status = await invoke<RawWorktreeStatus>("get_worktree_status", {
    worktreeId,
  });
  return transformWorktreeStatus(status);
}
