/**
 * PRD (Product Requirements Document) types for Ralph-style execution
 *
 * Based on the Ralph Wiggum technique:
 * - Stories with acceptance criteria
 * - Iteration loops until criteria pass
 * - Completion promises
 */

// Acceptance criterion types
export type CriterionType = "test" | "file_exists" | "pattern" | "custom";

export interface AcceptanceCriterion {
  type: CriterionType;
  /** For type: "test" - command to run */
  command?: string;
  /** For type: "file_exists" - path to check */
  path?: string;
  /** For type: "pattern" - file to search in */
  file?: string;
  /** For type: "pattern" - regex pattern to match */
  pattern?: string;
  /** For type: "custom" - script to execute */
  script?: string;
  /** Human-readable description */
  description?: string;
}

export interface CriterionStatus {
  passed: boolean;
  error?: string;
  lastChecked?: number;
}

// Story types
export type StoryStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "blocked";

export type ModelId = "opus" | "sonnet" | "haiku";

export type Complexity = "low" | "medium" | "high";

export interface Story {
  id: string;
  title: string;
  description: string;
  acceptance_criteria: AcceptanceCriterion[];
  dependencies: string[];
  hints?: string[];
  /** Auto-detected or manually set */
  complexity?: Complexity;
  /** Model to use (auto-assigned based on complexity) */
  model?: ModelId;
}

export interface StoryProgress {
  status: StoryStatus;
  workerId?: string;
  iteration: number;
  maxIterations: number;
  criteriaStatus: CriterionStatus[];
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

// PRD types
export interface PrdConstraints {
  max_workers: number;
  max_iterations_per_story: number;
  total_timeout_minutes?: number;
  models?: {
    master?: ModelId;
    default?: ModelId;
  };
}

export interface Prd {
  title: string;
  description?: string;
  stories: Story[];
  constraints: PrdConstraints;
}

// Worker types for Ralph loops
export type WorkerStatus = "idle" | "working" | "completed" | "error";

export interface RalphWorker {
  id: string;
  model: ModelId;
  status: WorkerStatus;
  currentStoryId?: string;
  iteration: number;
  startedAt?: number;
  lastActivityAt?: number;
  error?: string;
}

// Session types
export type PrdSessionStatus =
  | "idle"
  | "validating"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export interface PrdSession {
  id: string;
  prd: Prd;
  status: PrdSessionStatus;
  workers: RalphWorker[];
  storyProgress: Map<string, StoryProgress>;
  totalCost: number;
  tokensUsed: {
    input: number;
    output: number;
  };
  startedAt?: number;
  completedAt?: number;
  prUrl?: string;
}

// Iteration history
export interface Iteration {
  number: number;
  startedAt: number;
  completedAt?: number;
  criteriaResults: CriterionStatus[];
  commitHash?: string;
  summary?: string;
}

// Validation result
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  estimatedCost: number;
  modelAssignments: Record<string, ModelId>;
  dependencyOrder: string[];
}

// Cost tracking
export interface CostBreakdown {
  storyId: string;
  model: ModelId;
  iterations: number;
  tokens: {
    input: number;
    output: number;
  };
  cost: number;
}

// Default constraints
export const DEFAULT_CONSTRAINTS: PrdConstraints = {
  max_workers: 3,
  max_iterations_per_story: 15,
  total_timeout_minutes: 120,
  models: {
    master: "opus",
    default: "sonnet",
  },
};

// Model costs per 1M tokens (approximate)
export const MODEL_COSTS: Record<ModelId, { input: number; output: number }> = {
  opus: { input: 15, output: 75 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 0.25, output: 1.25 },
};

// Complexity to model mapping
export const COMPLEXITY_TO_MODEL: Record<Complexity, ModelId> = {
  low: "haiku",
  medium: "sonnet",
  high: "opus",
};
