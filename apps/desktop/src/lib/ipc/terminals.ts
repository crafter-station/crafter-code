import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Terminal created event from ACP
 */
export interface TerminalCreatedEvent {
  terminal_id: string;
  session_id: string;
  worker_id: string;
  command: string;
  args?: string[];
  cwd?: string;
  running: boolean;
  timestamp: number;
}

/**
 * Terminal output event from ACP
 */
export interface TerminalOutputEvent {
  terminal_id: string;
  session_id: string;
  output: string;
  running: boolean;
  exit_code?: number;
  timestamp: number;
}

/**
 * Terminal exited event from ACP
 */
export interface TerminalExitedEvent {
  terminal_id: string;
  session_id: string;
  exit_code?: number;
  running: boolean;
  timestamp: number;
}

/**
 * Terminal killed event from ACP
 */
export interface TerminalKilledEvent {
  terminal_id: string;
  session_id: string;
  running: boolean;
  timestamp: number;
}

/**
 * Terminal released event from ACP
 */
export interface TerminalReleasedEvent {
  terminal_id: string;
  session_id: string;
  timestamp: number;
}

/**
 * Listen for terminal created events
 */
export async function onTerminalCreated(
  callback: (event: TerminalCreatedEvent) => void
): Promise<UnlistenFn> {
  return listen<TerminalCreatedEvent>("terminal-created", (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for terminal output events
 */
export async function onTerminalOutput(
  callback: (event: TerminalOutputEvent) => void
): Promise<UnlistenFn> {
  return listen<TerminalOutputEvent>("terminal-output", (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for terminal exited events
 */
export async function onTerminalExited(
  callback: (event: TerminalExitedEvent) => void
): Promise<UnlistenFn> {
  return listen<TerminalExitedEvent>("terminal-exited", (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for terminal killed events
 */
export async function onTerminalKilled(
  callback: (event: TerminalKilledEvent) => void
): Promise<UnlistenFn> {
  return listen<TerminalKilledEvent>("terminal-killed", (event) => {
    callback(event.payload);
  });
}

/**
 * Listen for terminal released events
 */
export async function onTerminalReleased(
  callback: (event: TerminalReleasedEvent) => void
): Promise<UnlistenFn> {
  return listen<TerminalReleasedEvent>("terminal-released", (event) => {
    callback(event.payload);
  });
}
