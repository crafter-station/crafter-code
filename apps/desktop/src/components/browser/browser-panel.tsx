"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createBrowserView,
  closeBrowserView,
  navigateBrowser,
  resizeBrowserView,
  setBrowserVisible,
  type BrowserBounds,
} from "@/lib/ipc/browser";
import { cn } from "@/lib/utils";

import { BrowserToolbar } from "./browser-toolbar";

interface BrowserPanelProps {
  initialUrl?: string;
  className?: string;
  visible?: boolean;
}

export function BrowserPanel({
  initialUrl = "https://example.com",
  className,
  visible = true,
}: BrowserPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewIdRef = useRef<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(true);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const getBounds = useCallback((): BrowserBounds | null => {
    if (!viewportRef.current) return null;
    const rect = viewportRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!visible) {
      const id = viewIdRef.current;
      if (id) {
        setBrowserVisible(id, false).catch(console.error);
      }
      return () => {
        mountedRef.current = false;
      };
    }

    const initBrowser = async () => {
      if (viewIdRef.current) {
        setBrowserVisible(viewIdRef.current, true).catch(console.error);
        const bounds = getBounds();
        if (bounds) {
          resizeBrowserView(viewIdRef.current, bounds).catch(console.error);
        }
        setIsLoading(false);
        return;
      }

      const bounds = getBounds();
      if (!bounds) return;

      try {
        const viewState = await createBrowserView(initialUrl, bounds);
        if (!mountedRef.current) {
          closeBrowserView(viewState.id).catch(console.error);
          return;
        }
        viewIdRef.current = viewState.id;
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to create browser view:", error);
        if (mountedRef.current) setIsLoading(false);
      }
    };

    initBrowser();

    return () => {
      mountedRef.current = false;
      const id = viewIdRef.current;
      if (id) {
        setBrowserVisible(id, false).catch(console.error);
      }
    };
  }, [getBounds, initialUrl, visible]);

  useEffect(() => {
    if (!visible || !viewIdRef.current || !viewportRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      resizeTimeoutRef.current = setTimeout(() => {
        const bounds = getBounds();
        if (bounds && viewIdRef.current) {
          resizeBrowserView(viewIdRef.current, bounds).catch(console.error);
        }
      }, 100);
    });

    resizeObserver.observe(viewportRef.current);

    return () => {
      resizeObserver.disconnect();
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [isLoading, visible, getBounds]);

  const handleNavigate = async (url: string) => {
    if (!viewIdRef.current) return;

    let finalUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      finalUrl = `https://${url}`;
    }

    try {
      await navigateBrowser(viewIdRef.current, finalUrl);
      setCurrentUrl(finalUrl);
    } catch (error) {
      console.error("Failed to navigate:", error);
    }
  };

  const handleReload = () => {
    if (viewIdRef.current) {
      navigateBrowser(viewIdRef.current, currentUrl).catch(console.error);
    }
  };

  const handleClose = () => {
    const id = viewIdRef.current;
    if (id) {
      closeBrowserView(id)
        .then(() => {
          viewIdRef.current = null;
        })
        .catch(console.error);
    }
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      <BrowserToolbar
        url={currentUrl}
        onNavigate={handleNavigate}
        onClose={handleClose}
        onReload={handleReload}
      />
      <div ref={viewportRef} className="flex-1 relative bg-[#0a0a0a]">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            Loading browser...
          </div>
        )}
      </div>
    </div>
  );
}
