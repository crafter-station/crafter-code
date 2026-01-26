"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";

const tabs = ["Terminal", "VS Code, Cursor, Windsurf"];

export function TerminalBlock() {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("bun add -g crafter-code");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-card">
      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map((tab, index) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(index)}
            className={cn(
              "px-4 py-3 font-mono text-sm transition-colors",
              activeTab === index
                ? "bg-background text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 0 ? (
          <div className="space-y-4">
            {/* Install command */}
            <div className="flex items-center justify-between rounded-md border border-border bg-background px-4 py-3">
              <code className="font-mono text-sm">
                <span className="text-accent-orange">{">"}</span>{" "}
                <span className="text-muted-foreground">bun add -g</span>{" "}
                <span className="text-foreground">crafter-code</span>
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-accent-teal" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Agent output */}
            <div className="space-y-2 rounded-md border-l-2 border-accent-orange/50 pl-4">
              <p className="font-mono text-sm text-yellow-400">
                Starting agent session...
              </p>
              <p className="font-mono text-sm text-muted-foreground">
                https://code.crafter.run/session/a1b2c3d4
              </p>
              <p className="font-mono text-sm text-muted-foreground">
                Analyzing codebase structure...
              </p>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-accent-teal" />
              <span className="font-mono text-sm text-accent-teal">
                Thinking
              </span>
              <span className="animate-pulse text-accent-teal">▶</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="font-mono text-sm text-muted-foreground">
              Install from the extension marketplace:
            </p>
            <code className="block rounded-md border border-border bg-background px-4 py-3 font-mono text-sm">
              ext install crafter-station.crafter-code
            </code>
            <p className="text-sm text-muted-foreground">
              Or search for "Crafter Code" in your editor's extensions panel.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
