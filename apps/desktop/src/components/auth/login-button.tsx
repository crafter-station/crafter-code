"use client";

import { LogIn, LogOut } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

interface LoginButtonProps {
  className?: string;
}

export function LoginButton({ className }: LoginButtonProps) {
  const { isAuthenticated, user, login, logout } = useAuthStore();

  if (isAuthenticated && user) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <img
          src={user.imageUrl}
          alt={user.firstName || "User"}
          className="h-5 w-5 rounded-full"
        />
        <span className="text-[11px] text-muted-foreground truncate max-w-[100px]">
          {user.firstName || user.email}
        </span>
        <button
          type="button"
          onClick={logout}
          className="p-1 rounded hover:bg-muted transition-colors"
          title="Sign out"
        >
          <LogOut className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={login}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] bg-accent-orange/10 text-accent-orange hover:bg-accent-orange/20 transition-colors",
        className
      )}
    >
      <LogIn className="h-3 w-3" />
      Sign in
    </button>
  );
}
