"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@crafter-code/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@crafter-code/ui";
import { Label } from "@crafter-code/ui";
import { Separator } from "@crafter-code/ui";
import { Kbd } from "@crafter-code/ui";

import { useSettingsStore, type Theme } from "@/stores/settings-store";

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen, theme, setTheme } = useSettingsStore();
  const { setTheme: setNextTheme } = useTheme();

  console.log("SettingsDialog render, open:", settingsOpen);

  const handleThemeChange = (value: string) => {
    const newTheme = value as Theme;
    setTheme(newTheme);
    setNextTheme(newTheme);
  };

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            Settings
            <span className="ml-auto flex items-center gap-0.5">
              <Kbd>⌘</Kbd>
              <Kbd>,</Kbd>
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Configure your crafter/code preferences
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-medium">Appearance</h3>
              <p className="text-[10px] text-muted-foreground">
                Customize how crafter/code looks
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="theme" className="flex flex-col gap-0.5">
                <span className="text-xs">Theme</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  Select color scheme
                </span>
              </Label>
              <Select value={theme} onValueChange={handleThemeChange}>
                <SelectTrigger id="theme" className="w-[120px] h-8 text-xs">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light" className="text-xs">
                    <div className="flex items-center gap-2">
                      <Sun className="size-3" />
                      <span>Light</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dark" className="text-xs">
                    <div className="flex items-center gap-2">
                      <Moon className="size-3" />
                      <span>Dark</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="system" className="text-xs">
                    <div className="flex items-center gap-2">
                      <Monitor className="size-3" />
                      <span>System</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div>
              <h3 className="text-xs font-medium">General</h3>
              <p className="text-[10px] text-muted-foreground">
                Application settings
              </p>
            </div>

            <p className="text-[10px] text-muted-foreground italic">
              More settings coming soon...
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
