"use client";

import { useCallback, useState, useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  FileCheck,
  FileText,
  Loader2,
  Plus,
  Search,
  Terminal,
  Trash2,
  Wand2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  AcceptanceCriterion,
  CriterionType,
  ModelId,
  Prd,
  Story,
  ValidationResult,
} from "@/lib/types/prd";
import { DEFAULT_CONSTRAINTS, COMPLEXITY_TO_MODEL } from "@/lib/types/prd";

type EditorMode = "visual" | "json";

interface PrdEditorProps {
  initialPrd?: Prd;
  onChange?: (prd: Prd) => void;
  onValidate?: (prd: Prd) => Promise<ValidationResult>;
  onStart?: (prd: Prd) => void;
  className?: string;
}

const CRITERION_ICONS: Record<CriterionType, typeof Terminal> = {
  test: Terminal,
  file_exists: FileCheck,
  pattern: Search,
  custom: Code2,
};

const CRITERION_LABELS: Record<CriterionType, string> = {
  test: "Run Test",
  file_exists: "File Exists",
  pattern: "Pattern Match",
  custom: "Custom Script",
};

export function PrdEditor({
  initialPrd,
  onChange,
  onValidate,
  onStart,
  className,
}: PrdEditorProps) {
  const [mode, setMode] = useState<EditorMode>("visual");
  const [prd, setPrdInternal] = useState<Prd>(
    initialPrd || {
      title: "",
      description: "",
      stories: [],
      constraints: DEFAULT_CONSTRAINTS,
    }
  );
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(initialPrd || prd, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Wrapper to notify parent of changes
  const setPrd = useCallback((newPrd: Prd | ((prev: Prd) => Prd)) => {
    setPrdInternal((prev) => {
      const updated = typeof newPrd === "function" ? newPrd(prev) : newPrd;
      onChange?.(updated);
      return updated;
    });
  }, [onChange]);

  // Sync JSON when switching modes
  const handleModeChange = useCallback(
    (newMode: EditorMode) => {
      if (newMode === "json" && mode === "visual") {
        setJsonText(JSON.stringify(prd, null, 2));
        setJsonError(null);
      } else if (newMode === "visual" && mode === "json") {
        try {
          const parsed = JSON.parse(jsonText);
          setPrd(parsed);
          setJsonError(null);
        } catch (e) {
          setJsonError("Invalid JSON - fix before switching to visual mode");
          return;
        }
      }
      setMode(newMode);
    },
    [mode, prd, jsonText]
  );

  // Update PRD field
  const updatePrd = useCallback((updates: Partial<Prd>) => {
    setPrd((prev) => ({ ...prev, ...updates }));
    setValidation(null);
  }, []);

  // Add story
  const addStory = useCallback(() => {
    const newStory: Story = {
      id: `story_${Date.now()}`,
      title: "",
      description: "",
      acceptance_criteria: [],
      dependencies: [],
    };
    setPrd((prev) => ({
      ...prev,
      stories: [...prev.stories, newStory],
    }));
    setValidation(null);
  }, []);

  // Update story
  const updateStory = useCallback((storyId: string, updates: Partial<Story>) => {
    setPrd((prev) => ({
      ...prev,
      stories: prev.stories.map((s) =>
        s.id === storyId ? { ...s, ...updates } : s
      ),
    }));
    setValidation(null);
  }, []);

  // Remove story
  const removeStory = useCallback((storyId: string) => {
    setPrd((prev) => ({
      ...prev,
      stories: prev.stories.filter((s) => s.id !== storyId),
    }));
    setValidation(null);
  }, []);

  // Add criterion to story
  const addCriterion = useCallback(
    (storyId: string, type: CriterionType) => {
      const criterion: AcceptanceCriterion = { type };
      setPrd((prev) => ({
        ...prev,
        stories: prev.stories.map((s) =>
          s.id === storyId
            ? { ...s, acceptance_criteria: [...s.acceptance_criteria, criterion] }
            : s
        ),
      }));
      setValidation(null);
    },
    []
  );

  // Update criterion
  const updateCriterion = useCallback(
    (storyId: string, index: number, updates: Partial<AcceptanceCriterion>) => {
      setPrd((prev) => ({
        ...prev,
        stories: prev.stories.map((s) =>
          s.id === storyId
            ? {
                ...s,
                acceptance_criteria: s.acceptance_criteria.map((c, i) =>
                  i === index ? { ...c, ...updates } : c
                ),
              }
            : s
        ),
      }));
      setValidation(null);
    },
    []
  );

  // Remove criterion
  const removeCriterion = useCallback((storyId: string, index: number) => {
    setPrd((prev) => ({
      ...prev,
      stories: prev.stories.map((s) =>
        s.id === storyId
          ? {
              ...s,
              acceptance_criteria: s.acceptance_criteria.filter(
                (_, i) => i !== index
              ),
            }
          : s
      ),
    }));
    setValidation(null);
  }, []);

  // Validate PRD
  const handleValidate = useCallback(async () => {
    if (!onValidate) return;

    setIsValidating(true);
    try {
      const currentPrd = mode === "json" ? JSON.parse(jsonText) : prd;
      const result = await onValidate(currentPrd);
      setValidation(result);
    } catch (e) {
      setValidation({
        valid: false,
        errors: [e instanceof Error ? e.message : "Validation failed"],
        warnings: [],
        estimatedCost: 0,
        modelAssignments: {},
        dependencyOrder: [],
      });
    } finally {
      setIsValidating(false);
    }
  }, [onValidate, mode, jsonText, prd]);

  // Start execution
  const handleStart = useCallback(() => {
    if (!onStart || !validation?.valid) return;
    const currentPrd = mode === "json" ? JSON.parse(jsonText) : prd;
    onStart(currentPrd);
  }, [onStart, validation, mode, jsonText, prd]);

  // Estimate cost (rough calculation)
  const estimatedCost = prd.stories.reduce((sum, story) => {
    const model = story.model || COMPLEXITY_TO_MODEL[story.complexity || "medium"];
    const costPerIter = model === "opus" ? 0.5 : model === "sonnet" ? 0.15 : 0.03;
    return sum + costPerIter * (prd.constraints.max_iterations_per_story / 2);
  }, 0);

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-accent-orange" />
          <span className="text-sm font-medium">PRD Editor</span>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-0.5 p-0.5 bg-muted rounded-md">
          <button
            type="button"
            onClick={() => handleModeChange("visual")}
            className={cn(
              "px-2 py-1 rounded text-[10px] font-medium transition-colors",
              mode === "visual"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Wand2 className="size-3 inline mr-1" />
            Visual
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("json")}
            className={cn(
              "px-2 py-1 rounded text-[10px] font-medium transition-colors",
              mode === "json"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Code2 className="size-3 inline mr-1" />
            JSON
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {mode === "visual" ? (
          <div className="space-y-4">
            {/* Title & Description */}
            <div className="space-y-2">
              <input
                type="text"
                value={prd.title}
                onChange={(e) => updatePrd({ title: e.target.value })}
                placeholder="PRD Title"
                className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent-orange"
              />
              <textarea
                value={prd.description || ""}
                onChange={(e) => updatePrd({ description: e.target.value })}
                placeholder="Description (optional)"
                rows={2}
                className="w-full px-3 py-2 rounded-md border border-border bg-card text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent-orange resize-none"
              />
            </div>

            {/* Stories */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Stories ({prd.stories.length})
                </span>
                <button
                  type="button"
                  onClick={addStory}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-accent-orange hover:bg-accent-orange/10 transition-colors"
                >
                  <Plus className="size-3" />
                  Add Story
                </button>
              </div>

              {prd.stories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-border rounded-lg">
                  <FileText className="size-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No stories yet</p>
                  <button
                    type="button"
                    onClick={addStory}
                    className="mt-2 text-[10px] text-accent-orange hover:underline"
                  >
                    Add first story
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {prd.stories.map((story, index) => (
                    <StoryEditor
                      key={story.id}
                      story={story}
                      index={index}
                      allStories={prd.stories}
                      modelAssignment={validation?.modelAssignments[story.id]}
                      onUpdate={(updates) => updateStory(story.id, updates)}
                      onRemove={() => removeStory(story.id)}
                      onAddCriterion={(type) => addCriterion(story.id, type)}
                      onUpdateCriterion={(idx, updates) =>
                        updateCriterion(story.id, idx, updates)
                      }
                      onRemoveCriterion={(idx) => removeCriterion(story.id, idx)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Constraints */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Constraints
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] text-muted-foreground">
                    Max Workers
                  </label>
                  <select
                    value={prd.constraints.max_workers}
                    onChange={(e) =>
                      updatePrd({
                        constraints: {
                          ...prd.constraints,
                          max_workers: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-2 py-1 rounded border border-border bg-card text-xs"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} worker{n > 1 ? "s" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-muted-foreground">
                    Max Iterations/Story
                  </label>
                  <select
                    value={prd.constraints.max_iterations_per_story}
                    onChange={(e) =>
                      updatePrd({
                        constraints: {
                          ...prd.constraints,
                          max_iterations_per_story: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-2 py-1 rounded border border-border bg-card text-xs"
                  >
                    {[5, 10, 15, 20, 30, 50].map((n) => (
                      <option key={n} value={n}>
                        {n} iterations
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* JSON Mode */
          <div className="space-y-2">
            {jsonError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 text-red-500 text-xs">
                <AlertCircle className="size-3" />
                {jsonError}
              </div>
            )}
            <textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setJsonError(null);
                setValidation(null);
                try {
                  JSON.parse(e.target.value);
                } catch {
                  setJsonError("Invalid JSON");
                }
              }}
              className="w-full h-[400px] px-3 py-2 rounded-md border border-border bg-card font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent-orange resize-none"
              spellCheck={false}
            />
          </div>
        )}

        {/* Validation Results */}
        {validation && (
          <div className="mt-4 space-y-2">
            {validation.errors.length > 0 && (
              <div className="space-y-1">
                {validation.errors.map((error, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 text-red-500 text-xs"
                  >
                    <AlertCircle className="size-3 shrink-0" />
                    {error}
                  </div>
                ))}
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="space-y-1">
                {validation.warnings.map((warning, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 text-amber-500 text-xs"
                  >
                    <AlertCircle className="size-3 shrink-0" />
                    {warning}
                  </div>
                ))}
              </div>
            )}
            {validation.valid && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-500/10 text-green-500 text-xs">
                <CheckCircle2 className="size-3" />
                PRD is valid - ready to start
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{prd.stories.length} stories</span>
          <span>~${estimatedCost.toFixed(2)} est.</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleValidate}
            disabled={isValidating || !prd.title || prd.stories.length === 0}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              "border border-border hover:bg-muted",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isValidating ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3" />
            )}
            Validate
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={!validation?.valid}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              "bg-accent-orange text-white hover:bg-accent-orange/90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            Start Ralph Loop
          </button>
        </div>
      </div>
    </div>
  );
}

// Story Editor Component
interface StoryEditorProps {
  story: Story;
  index: number;
  allStories: Story[];
  modelAssignment?: ModelId;
  onUpdate: (updates: Partial<Story>) => void;
  onRemove: () => void;
  onAddCriterion: (type: CriterionType) => void;
  onUpdateCriterion: (index: number, updates: Partial<AcceptanceCriterion>) => void;
  onRemoveCriterion: (index: number) => void;
}

function StoryEditor({
  story,
  index,
  allStories,
  modelAssignment,
  onUpdate,
  onRemove,
  onAddCriterion,
  onUpdateCriterion,
  onRemoveCriterion,
}: StoryEditorProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showCriterionPicker, setShowCriterionPicker] = useState(false);

  const otherStories = allStories.filter((s) => s.id !== story.id);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Story Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-card">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-muted-foreground"
        >
          {isExpanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </button>
        <span className="text-[10px] font-mono text-muted-foreground">
          #{index + 1}
        </span>
        <input
          type="text"
          value={story.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Story title"
          className="flex-1 bg-transparent text-xs font-medium placeholder:text-muted-foreground focus:outline-none"
        />
        {modelAssignment && (
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[9px] font-medium",
              modelAssignment === "opus"
                ? "bg-purple-500/20 text-purple-400"
                : modelAssignment === "sonnet"
                  ? "bg-blue-500/20 text-blue-400"
                  : "bg-green-500/20 text-green-400"
            )}
          >
            {modelAssignment}
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {/* Story Content */}
      {isExpanded && (
        <div className="px-3 py-2 space-y-3 border-t border-border">
          {/* Description */}
          <textarea
            value={story.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Describe what this story should accomplish..."
            rows={2}
            className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent-orange resize-none"
          />

          {/* Dependencies */}
          <div className="space-y-1">
            <label className="text-[9px] text-muted-foreground">Depends on</label>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value && !story.dependencies.includes(e.target.value)) {
                  onUpdate({
                    dependencies: [...story.dependencies, e.target.value],
                  });
                }
              }}
              className="w-full px-2 py-1 rounded border border-border bg-background text-xs"
            >
              <option value="">Add dependency...</option>
              {otherStories.map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                  disabled={story.dependencies.includes(s.id)}
                >
                  {s.title || `Story ${allStories.indexOf(s) + 1}`}
                </option>
              ))}
            </select>
            {story.dependencies.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {story.dependencies.map((depId) => {
                  const dep = allStories.find((s) => s.id === depId);
                  return (
                    <span
                      key={depId}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[9px]"
                    >
                      {dep?.title || depId}
                      <button
                        type="button"
                        onClick={() =>
                          onUpdate({
                            dependencies: story.dependencies.filter(
                              (d) => d !== depId
                            ),
                          })
                        }
                        className="hover:text-red-400"
                      >
                        <Trash2 className="size-2" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Acceptance Criteria */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[9px] text-muted-foreground">
                Acceptance Criteria ({story.acceptance_criteria.length})
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCriterionPicker(!showCriterionPicker)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-accent-orange hover:bg-accent-orange/10"
                >
                  <Plus className="size-2.5" />
                  Add
                </button>
                {showCriterionPicker && (
                  <div className="absolute right-0 top-full mt-1 z-10 p-1 rounded-md border border-border bg-card shadow-lg">
                    {(Object.keys(CRITERION_ICONS) as CriterionType[]).map(
                      (type) => {
                        const Icon = CRITERION_ICONS[type];
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              onAddCriterion(type);
                              setShowCriterionPicker(false);
                            }}
                            className="flex items-center gap-2 w-full px-2 py-1 rounded text-[10px] hover:bg-muted text-left"
                          >
                            <Icon className="size-3 text-muted-foreground" />
                            {CRITERION_LABELS[type]}
                          </button>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            </div>

            {story.acceptance_criteria.length === 0 ? (
              <p className="text-[9px] text-muted-foreground/60 italic">
                No criteria yet - add tests, file checks, or patterns
              </p>
            ) : (
              <div className="space-y-1">
                {story.acceptance_criteria.map((criterion, idx) => (
                  <CriterionEditor
                    key={idx}
                    criterion={criterion}
                    onUpdate={(updates) => onUpdateCriterion(idx, updates)}
                    onRemove={() => onRemoveCriterion(idx)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Hints */}
          <div className="space-y-1">
            <label className="text-[9px] text-muted-foreground">
              Hints (optional)
            </label>
            <textarea
              value={story.hints?.join("\n") || ""}
              onChange={(e) =>
                onUpdate({
                  hints: e.target.value
                    .split("\n")
                    .filter((h) => h.trim()),
                })
              }
              placeholder="One hint per line..."
              rows={2}
              className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent-orange resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Criterion Editor Component
interface CriterionEditorProps {
  criterion: AcceptanceCriterion;
  onUpdate: (updates: Partial<AcceptanceCriterion>) => void;
  onRemove: () => void;
}

function CriterionEditor({
  criterion,
  onUpdate,
  onRemove,
}: CriterionEditorProps) {
  const Icon = CRITERION_ICONS[criterion.type];

  return (
    <div className="flex items-start gap-2 p-2 rounded border border-border bg-background">
      <Icon className="size-3 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-medium text-muted-foreground">
            {CRITERION_LABELS[criterion.type]}
          </span>
        </div>
        {criterion.type === "test" && (
          <input
            type="text"
            value={criterion.command || ""}
            onChange={(e) => onUpdate({ command: e.target.value })}
            placeholder="bun test src/auth.test.ts"
            className="w-full px-1.5 py-1 rounded border border-border bg-card text-[10px] font-mono placeholder:text-muted-foreground/50 focus:outline-none"
          />
        )}
        {criterion.type === "file_exists" && (
          <input
            type="text"
            value={criterion.path || ""}
            onChange={(e) => onUpdate({ path: e.target.value })}
            placeholder="src/auth/google.ts"
            className="w-full px-1.5 py-1 rounded border border-border bg-card text-[10px] font-mono placeholder:text-muted-foreground/50 focus:outline-none"
          />
        )}
        {criterion.type === "pattern" && (
          <div className="space-y-1">
            <input
              type="text"
              value={criterion.file || ""}
              onChange={(e) => onUpdate({ file: e.target.value })}
              placeholder="File: src/auth/google.ts"
              className="w-full px-1.5 py-1 rounded border border-border bg-card text-[10px] font-mono placeholder:text-muted-foreground/50 focus:outline-none"
            />
            <input
              type="text"
              value={criterion.pattern || ""}
              onChange={(e) => onUpdate({ pattern: e.target.value })}
              placeholder="Pattern: GoogleOAuthProvider"
              className="w-full px-1.5 py-1 rounded border border-border bg-card text-[10px] font-mono placeholder:text-muted-foreground/50 focus:outline-none"
            />
          </div>
        )}
        {criterion.type === "custom" && (
          <textarea
            value={criterion.script || ""}
            onChange={(e) => onUpdate({ script: e.target.value })}
            placeholder="#!/bin/bash\n# Custom verification script"
            rows={2}
            className="w-full px-1.5 py-1 rounded border border-border bg-card text-[10px] font-mono placeholder:text-muted-foreground/50 focus:outline-none resize-none"
          />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors"
      >
        <Trash2 className="size-2.5" />
      </button>
    </div>
  );
}
