import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// File system types
export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_file: boolean;
  is_hidden: boolean;
  size?: number;
  modified?: number;
}

export interface ProjectInfo {
  name: string;
  path: string;
  git_branch?: string;
  git_status?: string;
}

// Terminal commands
export async function spawnTerminal(
  cols: number,
  rows: number,
  cwd?: string,
): Promise<string> {
  return invoke<string>("spawn_terminal", { cols, rows, cwd });
}

export async function writeTerminal(id: string, data: string): Promise<void> {
  return invoke<void>("write_terminal", { id, data });
}

export async function resizeTerminal(
  id: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke<void>("resize_terminal", { id, cols, rows });
}

export async function killTerminal(id: string): Promise<void> {
  return invoke<void>("kill_terminal", { id });
}

// Terminal output listener
export function onTerminalOutput(
  terminalId: string,
  callback: (data: string) => void,
): Promise<UnlistenFn> {
  return listen<string>(`pty-output-${terminalId}`, (event) => {
    callback(event.payload);
  });
}

// File system commands
export async function readDirectory(path: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("read_directory", { path });
}

export async function getProjectInfo(path: string): Promise<ProjectInfo> {
  return invoke<ProjectInfo>("get_project_info", { path });
}

export async function readFileContent(path: string): Promise<string> {
  return invoke<string>("read_file_content", { path });
}
