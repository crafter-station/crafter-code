import { useCallback, useRef, useState } from "react";
import { useAgentStore, type SessionStatus } from "@/stores/agent-store";
import { writeTerminal } from "@/lib/ipc/commands";

interface OrchestratorOptions {
  terminalId: string;
  sessionId: string;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

type StopHookEventType =
  | "exit_attempt"
  | "completion_promise"
  | "max_iterations_reached"
  | "error"
  | "user_cancelled";

// Patterns that indicate a completion promise
const COMPLETION_PATTERNS = [
  "task complete",
  "task completed",
  "successfully completed",
  "finished implementing",
  "implementation complete",
  "all tests passing",
  "ready for review",
  "pr created",
  "pull request created",
  "deployed successfully",
  "build successful",
];

// Patterns that indicate an exit attempt without completion
const EXIT_PATTERNS = [
  "let me know if",
  "feel free to",
  "is there anything else",
  "shall i",
  "would you like me to",
  "i can help with",
  "what would you like",
  "how can i assist",
];

export function useOrchestrator() {
  const { updateSession, getActiveSession } = useAgentStore();
  const [isRunning, setIsRunning] = useState(false);
  const outputBufferRef = useRef<string>("");

  /**
   * Analyze output to detect stop events
   */
  const analyzeOutput = useCallback((output: string): StopHookEventType | null => {
    const outputLower = output.toLowerCase();

    // Check for completion patterns first
    for (const pattern of COMPLETION_PATTERNS) {
      if (outputLower.includes(pattern)) {
        return "completion_promise";
      }
    }

    // Check for exit patterns
    for (const pattern of EXIT_PATTERNS) {
      if (outputLower.includes(pattern)) {
        return "exit_attempt";
      }
    }

    return null;
  }, []);

  /**
   * Create a re-prompt message for exit attempts
   */
  const createReprompt = useCallback(
    (originalPrompt: string, iteration: number): string => {
      return `Your task is not complete. Continue working on: ${originalPrompt}

This is iteration ${iteration + 1}. Do not ask for confirmation or clarification. Complete the task and report when done with a completion statement like 'Task completed' or 'Implementation complete'.`;
    },
    []
  );

  /**
   * Handle terminal output for Ralph loop detection
   */
  const handleOutput = useCallback(
    (data: string, options: OrchestratorOptions) => {
      // Accumulate output
      outputBufferRef.current += data;

      const session = getActiveSession();
      if (!session || session.id !== options.sessionId) return;

      // Only analyze when we have enough output (avoid false positives)
      if (outputBufferRef.current.length < 50) return;

      const eventType = analyzeOutput(outputBufferRef.current);

      if (eventType === "completion_promise") {
        // Agent completed the task
        updateSession(options.sessionId, { status: "completed" });
        setIsRunning(false);
        outputBufferRef.current = "";
        options.onComplete?.();
      } else if (eventType === "exit_attempt") {
        // Agent tried to exit without completion - re-prompt
        if (session.iteration < session.maxIterations) {
          updateSession(options.sessionId, {
            iteration: session.iteration + 1,
          });

          const reprompt = createReprompt(session.prompt, session.iteration);

          // Clear buffer and send re-prompt
          outputBufferRef.current = "";
          writeTerminal(options.terminalId, `\n${reprompt}\n`);
        } else {
          // Max iterations reached
          updateSession(options.sessionId, { status: "completed" });
          setIsRunning(false);
          outputBufferRef.current = "";
        }
      }

      // Trim buffer if it gets too large
      if (outputBufferRef.current.length > 10000) {
        outputBufferRef.current = outputBufferRef.current.slice(-5000);
      }
    },
    [analyzeOutput, createReprompt, getActiveSession, updateSession]
  );

  /**
   * Start an agent session
   */
  const startSession = useCallback(
    async (options: OrchestratorOptions) => {
      const session = getActiveSession();
      if (!session || session.id !== options.sessionId) return;

      setIsRunning(true);
      outputBufferRef.current = "";

      updateSession(options.sessionId, {
        status: "running",
        terminalId: options.terminalId,
      });

      // Send initial prompt to terminal
      const command = `claude "${session.prompt}"\n`;
      await writeTerminal(options.terminalId, command);
    },
    [getActiveSession, updateSession]
  );

  /**
   * Stop the current session
   */
  const stopSession = useCallback(
    (sessionId: string, status: SessionStatus = "cancelled") => {
      updateSession(sessionId, { status });
      setIsRunning(false);
      outputBufferRef.current = "";
    },
    [updateSession]
  );

  /**
   * Pause the current session
   */
  const pauseSession = useCallback(
    (sessionId: string) => {
      updateSession(sessionId, { status: "paused" });
      setIsRunning(false);
    },
    [updateSession]
  );

  /**
   * Resume a paused session
   */
  const resumeSession = useCallback(
    async (options: OrchestratorOptions) => {
      const session = getActiveSession();
      if (!session || session.id !== options.sessionId) return;

      setIsRunning(true);
      updateSession(options.sessionId, { status: "running" });

      // Send continue prompt
      const continuePrompt = `Continue with the task: ${session.prompt}\n`;
      await writeTerminal(options.terminalId, continuePrompt);
    },
    [getActiveSession, updateSession]
  );

  return {
    isRunning,
    startSession,
    stopSession,
    pauseSession,
    resumeSession,
    handleOutput,
  };
}
