"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { WorkerSession, Model } from "@/stores/orchestrator-store";

interface WorkerTimelineProps {
  workers: Array<WorkerSession & { sessionPrompt?: string }>;
  className?: string;
}

const MODEL_COLORS: Record<Model, { bar: string; text: string }> = {
  opus: { bar: "fill-purple-500", text: "text-purple-500" },
  sonnet: { bar: "fill-accent-orange", text: "text-accent-orange" },
  haiku: { bar: "fill-sky-500", text: "text-sky-500" },
};

const STATUS_OPACITY: Record<string, string> = {
  running: "opacity-100",
  completed: "opacity-80",
  failed: "opacity-50",
  cancelled: "opacity-30",
  pending: "opacity-20",
};

export function WorkerTimeline({ workers, className }: WorkerTimelineProps) {
  const { rows, timeRange, now } = useMemo(() => {
    const now = Date.now();

    const withTimes = workers
      .filter((w) => w.startedAt || w.createdAt)
      .map((w) => ({
        ...w,
        start: w.startedAt ?? w.createdAt,
        end: w.endedAt ?? (w.status === "running" ? now : w.updatedAt),
      }));

    if (withTimes.length === 0) {
      return { rows: [], timeRange: { min: now - 60_000, max: now }, now };
    }

    const min = Math.min(...withTimes.map((w) => w.start));
    const max = Math.max(...withTimes.map((w) => w.end), now);

    return {
      rows: withTimes,
      timeRange: { min, max: max + (max - min) * 0.05 },
      now,
    };
  }, [workers]);

  if (rows.length === 0) {
    return (
      <div className={cn("rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground", className)}>
        No timeline data yet. Start agents to see their activity.
      </div>
    );
  }

  const LABEL_WIDTH = 80;
  const ROW_HEIGHT = 28;
  const PADDING = 4;
  const svgHeight = rows.length * ROW_HEIGHT + PADDING * 2;
  const duration = timeRange.max - timeRange.min;

  const timeMarks = getTimeMarks(timeRange.min, timeRange.max);

  return (
    <div className={cn("rounded-lg border overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <svg
          width="100%"
          viewBox={`0 0 600 ${svgHeight + 20}`}
          className="min-w-[400px]"
        >
          {timeMarks.map((mark) => {
            const x =
              LABEL_WIDTH +
              ((mark.time - timeRange.min) / duration) * (600 - LABEL_WIDTH);
            return (
              <g key={mark.time}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={svgHeight}
                  className="stroke-border"
                  strokeWidth={0.5}
                  strokeDasharray="2,2"
                />
                <text
                  x={x}
                  y={svgHeight + 14}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[8px]"
                >
                  {mark.label}
                </text>
              </g>
            );
          })}

          {rows.map((worker, i) => {
            const y = PADDING + i * ROW_HEIGHT;
            const barStart =
              LABEL_WIDTH +
              ((worker.start - timeRange.min) / duration) *
                (600 - LABEL_WIDTH);
            const barEnd =
              LABEL_WIDTH +
              ((worker.end - timeRange.min) / duration) * (600 - LABEL_WIDTH);
            const barWidth = Math.max(barEnd - barStart, 2);
            const colors = MODEL_COLORS[worker.model] || MODEL_COLORS.sonnet;
            const opacity = STATUS_OPACITY[worker.status] || "opacity-100";

            return (
              <g key={worker.id}>
                <text
                  x={LABEL_WIDTH - 6}
                  y={y + ROW_HEIGHT / 2 + 3}
                  textAnchor="end"
                  className={cn("text-[9px] font-mono", colors.text)}
                >
                  {worker.model}
                </text>
                <rect
                  x={barStart}
                  y={y + 4}
                  width={barWidth}
                  height={ROW_HEIGHT - 8}
                  rx={3}
                  className={cn(colors.bar, opacity)}
                />
                {worker.status === "running" && (
                  <rect
                    x={barEnd - 4}
                    y={y + 4}
                    width={4}
                    height={ROW_HEIGHT - 8}
                    rx={2}
                    className={cn(colors.bar, "animate-pulse")}
                  />
                )}
                <title>
                  {worker.task} ({worker.status}) - $
                  {worker.costUsd.toFixed(4)}
                </title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function getTimeMarks(
  min: number,
  max: number,
): Array<{ time: number; label: string }> {
  const durationMs = max - min;
  const marks: Array<{ time: number; label: string }> = [];

  let intervalMs: number;
  if (durationMs < 60_000) intervalMs = 10_000;
  else if (durationMs < 300_000) intervalMs = 30_000;
  else if (durationMs < 3_600_000) intervalMs = 300_000;
  else intervalMs = 1_800_000;

  const start = Math.ceil(min / intervalMs) * intervalMs;
  for (let t = start; t <= max; t += intervalMs) {
    const d = new Date(t);
    const label =
      intervalMs < 60_000
        ? `${d.getMinutes()}:${d.getSeconds().toString().padStart(2, "0")}`
        : `${d.getHours()}:${d.getMinutes().toString().padStart(2, "0")}`;
    marks.push({ time: t, label });
  }

  return marks;
}
