"use client";

import { useEffect, useRef } from "react";

import { useBrowserStore } from "@/stores/browser-store";
import { BrowserPanel } from "@/components/browser/browser-panel";
import { SessionColumns } from "@/components/orchestrator/session-columns";
import { ResizeDivider } from "./resize-divider";

interface MainWorkspaceProps {
  showSidebar: boolean;
  onToggleSidebar: () => void;
  visible?: boolean;
}

export function MainWorkspace({
  showSidebar,
  onToggleSidebar,
  visible = true,
}: MainWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const splitRatio = useBrowserStore((s) => s.splitRatio);
  const setSplitRatio = useBrowserStore((s) => s.setSplitRatio);

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden">
      <div
        style={{ width: `${splitRatio * 100}%` }}
        className="overflow-hidden"
      >
        <SessionColumns
          showSidebar={showSidebar}
          onToggleSidebar={onToggleSidebar}
        />
      </div>

      <ResizeDivider
        onResize={(ratio) => {
          setSplitRatio(ratio);
        }}
        containerRef={containerRef}
        currentRatio={splitRatio}
      />

      <div
        style={{ width: `${(1 - splitRatio) * 100}%` }}
        className="overflow-hidden"
      >
        <BrowserPanel initialUrl="https://docs.clerk.com" visible={visible} />
      </div>
    </div>
  );
}
