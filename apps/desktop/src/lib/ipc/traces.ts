import { invoke } from "@tauri-apps/api/core";

export type ContributorType = "human" | "ai" | "mixed" | "unknown";

export interface Contributor {
  type: ContributorType;
  modelId?: string;
}

export interface LineRange {
  startLine: number;
  endLine: number;
  contentHash?: string;
}

export interface RelatedResource {
  type: string;
  url: string;
}

export interface Conversation {
  url?: string;
  contributor: Contributor;
  ranges: LineRange[];
  related?: RelatedResource[];
}

export interface TracedFile {
  path: string;
  conversations: Conversation[];
}

export interface CrafterCodeMetadata {
  orchestratorSessionId: string;
  workerId: string;
  taskId?: string;
  cost?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

export interface TraceMetadata {
  "dev.crafter-code": CrafterCodeMetadata;
}

export interface VcsInfo {
  type: string;
  revision: string;
}

export interface AgentTrace {
  version: string;
  id: string;
  timestamp: string;
  vcs?: VcsInfo;
  tool: { name: string; version: string };
  files: TracedFile[];
  metadata?: TraceMetadata;
}

export interface TraceSummary {
  totalTraces: number;
  totalFiles: number;
  modelsUsed: string[];
  sessions: string[];
}

export async function getFileTraces(
  cwd: string,
  filePath: string,
): Promise<AgentTrace[]> {
  return invoke<AgentTrace[]>("get_file_traces", { cwd, filePath });
}

export async function getSessionTraces(
  cwd: string,
  sessionId: string,
): Promise<AgentTrace[]> {
  return invoke<AgentTrace[]>("get_session_traces", { cwd, sessionId });
}

export async function getWorkerTraces(
  cwd: string,
  workerId: string,
): Promise<AgentTrace[]> {
  return invoke<AgentTrace[]>("get_worker_traces", { cwd, workerId });
}

export async function getTraceSummary(cwd: string): Promise<TraceSummary> {
  return invoke<TraceSummary>("get_trace_summary", { cwd });
}
