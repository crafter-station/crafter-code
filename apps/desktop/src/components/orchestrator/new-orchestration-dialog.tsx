"use client";

import { useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@crafter-code/ui";
import { Users } from "lucide-react";

import { createOrchestratorSession } from "@/lib/ipc/orchestrator";

import { useOrchestratorStore } from "@/stores/orchestrator-store";

interface NewOrchestrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSessionCreated?: (sessionId: string) => void;
}

export function NewOrchestrationDialog({
  open,
  onOpenChange,
  onSessionCreated,
}: NewOrchestrationDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("opus");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setSession } = useOrchestratorStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const session = await createOrchestratorSession(prompt, model);
      setSession(session);
      onSessionCreated?.(session.id);
      setPrompt("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-accent-orange" />
            New Agent Fleet
          </DialogTitle>
          <DialogDescription>
            Describe a complex task. The orchestrator will break it down and
            spawn parallel workers to complete it efficiently.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prompt">Task Description</Label>
            <Textarea
              id="prompt"
              placeholder="e.g., Refactor the authentication system to use Clerk, update all components, and write tests..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[120px] resize-none"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Lead Agent Model</Label>
            <Select value={model} onValueChange={setModel} disabled={isLoading}>
              <SelectTrigger id="model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opus">
                  Claude Opus 4.5 (Best for planning)
                </SelectItem>
                <SelectItem value="sonnet">Claude Sonnet 4</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The lead agent plans the work. Workers will use models suited to
              their tasks.
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!prompt.trim() || isLoading}>
              {isLoading ? "Planning..." : "Launch Fleet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
