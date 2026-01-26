"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

import { cn } from "@/lib/utils";
import {
  spawnTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
  onTerminalOutput,
} from "@/lib/ipc/commands";

interface TerminalProps {
  cwd?: string;
  className?: string;
  onReady?: (terminalId: string) => void;
  onData?: (data: string) => void;
}

export function Terminal({ cwd, className, onReady, onData }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

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
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Spawn PTY
    const initPty = async () => {
      try {
        const { cols, rows } = xterm;
        const id = await spawnTerminal(cols, rows, cwd);
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

        setIsReady(true);
        onReady?.(id);

        return unlisten;
      } catch (error) {
        console.error("Failed to spawn terminal:", error);
        xterm.write(`\r\n\x1b[31mFailed to spawn terminal: ${error}\x1b[0m\r\n`);
      }
    };

    const cleanupPromise = initPty();

    return () => {
      cleanupPromise?.then((unlisten) => unlisten?.());
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [cwd, onReady, onData]);

  // Handle resize
  const handleResize = useCallback(() => {
    if (!fitAddonRef.current || !xtermRef.current || !terminalId) return;

    fitAddonRef.current.fit();
    const { cols, rows } = xtermRef.current;
    resizeTerminal(terminalId, cols, rows);
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
      className={cn("h-full w-full bg-[#0d0d0d]", className)}
    />
  );
}
