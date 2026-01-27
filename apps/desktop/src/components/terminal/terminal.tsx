"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FitAddon as FitAddonType } from "@xterm/addon-fit";
import type { Terminal as XTermType } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import {
  killTerminal,
  onTerminalOutput,
  resizeTerminal,
  spawnTerminal,
  writeTerminal,
} from "@/lib/ipc/commands";
import { cn } from "@/lib/utils";

interface TerminalProps {
  cwd?: string;
  className?: string;
  onReady?: (terminalId: string) => void;
  onData?: (data: string) => void;
}

export function Terminal({ cwd, className, onReady, onData }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTermType | null>(null);
  const fitAddonRef = useRef<FitAddonType | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize terminal with dynamic imports
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    let mounted = true;

    const initTerminal = async () => {
      // Dynamic imports for browser-only modules
      const [{ Terminal: XTerm }, { FitAddon }, { WebLinksAddon }] =
        await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
          import("@xterm/addon-web-links"),
        ]);

      // CSS is imported at the top level

      if (!mounted || !terminalRef.current) return;

      const xterm = new XTerm({
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: "bar",
        theme: {
          background: "#0d0d0d",
          foreground: "#e4e4e7",
          cursor: "#f97316",
          cursorAccent: "#0d0d0d",
          selectionBackground: "#f9731640",
          black: "#0a0a0a",
          red: "#ef4444",
          green: "#22c55e",
          yellow: "#fbbf24",
          blue: "#3b82f6",
          magenta: "#a855f7",
          cyan: "#2dd4bf",
          white: "#fafafa",
          brightBlack: "#404040",
          brightRed: "#f87171",
          brightGreen: "#4ade80",
          brightYellow: "#fcd34d",
          brightBlue: "#60a5fa",
          brightMagenta: "#c084fc",
          brightCyan: "#5eead4",
          brightWhite: "#ffffff",
        },
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      xterm.loadAddon(fitAddon);
      xterm.loadAddon(webLinksAddon);

      xterm.open(terminalRef.current);

      xtermRef.current = xterm;
      fitAddonRef.current = fitAddon;
      setIsLoading(false);

      // Delay initial fit to let layout stabilize
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!mounted) return;

      fitAddon.fit();

      // Spawn PTY
      try {
        const { cols, rows } = xterm;
        const id = await spawnTerminal(cols, rows, cwd);
        if (!mounted) return;

        setTerminalId(id);

        // Listen for output
        const unlisten = await onTerminalOutput(id, (data) => {
          xterm.write(data);
          onData?.(data);
        });

        // Handle user input
        xterm.onData((data) => {
          writeTerminal(id, data);
        });

        onReady?.(id);

        return unlisten;
      } catch (error) {
        console.error("Failed to spawn terminal:", error);
        xterm.write(
          `\r\n\x1b[31mFailed to spawn terminal: ${error}\x1b[0m\r\n`,
        );
      }
    };

    const cleanupPromise = initTerminal();

    return () => {
      mounted = false;
      cleanupPromise?.then((unlisten) => unlisten?.());
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
      fitAddonRef.current = null;
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [cwd, onReady, onData]);

  // Handle resize with debounce
  const handleResize = useCallback(() => {
    if (!fitAddonRef.current || !xtermRef.current || !terminalId) return;

    // Clear previous timeout
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }

    // Debounce resize
    resizeTimeoutRef.current = setTimeout(() => {
      if (!fitAddonRef.current || !xtermRef.current) return;

      fitAddonRef.current.fit();
      const { cols, rows } = xtermRef.current;
      resizeTerminal(terminalId, cols, rows);
    }, 100);
  }, [terminalId]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [handleResize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (terminalId) {
        killTerminal(terminalId);
      }
    };
  }, [terminalId]);

  return (
    <div
      ref={terminalRef}
      className={cn("h-full w-full bg-[#0d0d0d] overflow-hidden", className)}
    >
      {isLoading && (
        <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
          Loading terminal...
        </div>
      )}
    </div>
  );
}
