"use client";

import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useDeepLink } from "@/hooks/use-deep-link";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const initialize = useAuthStore((s) => s.initialize);
  const isLoaded = useAuthStore((s) => s.isLoaded);

  useDeepLink();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin h-6 w-6 border-2 border-accent-orange rounded-full border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
