"use client";

import { useState } from "react";
import { Zap } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crafter-code/ui";
import { useAgentStore } from "@/stores/agent-store";

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSessionCreated?: (sessionId: string) => void;
}

export function NewSessionDialog({
  open,
  onOpenChange,
  onSessionCreated,
}: NewSessionDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [maxIterations, setMaxIterations] = useState("10");
  const [model, setModel] = useState("claude-sonnet-4");

  const { createSession, projectPath } = useAgentStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const session = createSession(prompt, Number.parseInt(maxIterations, 10));
    onSessionCreated?.(session.id);
    setPrompt("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-5 text-accent-orange" />
            New Agent Session
          </DialogTitle>
          <DialogDescription>
            Start a new AI agent session. The agent will work until it completes
            the task or reaches the max iterations.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prompt">Task Prompt</Label>
            <Textarea
              id="prompt"
              placeholder="Describe what you want the agent to do..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[100px] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude-sonnet-4">Claude Sonnet 4</SelectItem>
                  <SelectItem value="claude-opus-4-5">Claude Opus 4.5</SelectItem>
                  <SelectItem value="claude-haiku-3-5">Claude Haiku 3.5</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="iterations">Max Iterations</Label>
              <Select value={maxIterations} onValueChange={setMaxIterations}>
                <SelectTrigger id="iterations">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {projectPath && (
            <div className="text-xs text-muted-foreground">
              Working directory:{" "}
              <code className="bg-muted px-1 py-0.5 rounded">
                {projectPath}
              </code>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!prompt.trim()}>
              Start Session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
