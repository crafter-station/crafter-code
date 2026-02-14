"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface ResizeDividerProps {
  onResize: (ratio: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  currentRatio: number;
}

export function ResizeDivider({ onResize, containerRef, currentRatio }: ResizeDividerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const startXRef = useRef(0);
  const startRatioRef = useRef(0.5);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const deltaX = e.clientX - startXRef.current;
      const deltaRatio = deltaX / containerRect.width;
      const newRatio = Math.max(0.2, Math.min(0.8, startRatioRef.current + deltaRatio));

      onResize(newRatio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, onResize, containerRef]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startRatioRef.current = currentRatio;
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "w-1 h-full cursor-col-resize transition-colors",
        isDragging
          ? "bg-accent-orange"
          : isHovered
            ? "bg-accent-orange/50"
            : "bg-border",
      )}
    />
  );
}
