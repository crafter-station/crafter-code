import Link from "next/link";

import { Button } from "@crafter-code/ui";

import { TerminalBlock } from "./terminal-block";

export function Hero() {
  return (
    <section className="relative flex min-h-[calc(100svh-4rem)] flex-col justify-center overflow-hidden py-16">
      {/* Background pattern */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-background to-background" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23262626' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: Copy */}
          <div className="flex flex-col justify-center">
            <p className="mb-4 font-mono text-xs uppercase tracking-widest text-accent-orange">
              Agent-first IDE
            </p>
            <h1 className="font-serif text-5xl leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
              <span className="italic text-cream">Engineered</span>
              <br />
              <span className="text-foreground">For Agents.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Crafter Code is a desktop app for running multiple AI agents side
              by side. Works with Claude, Gemini, and any ACP-compatible CLI.
              Multi-turn conversations, real-time streaming.
            </p>
            <p className="mt-4 text-sm text-muted-foreground/70">
              Open source. Built with Tauri + React.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button
                size="lg"
                className="gap-2 bg-cream text-background hover:bg-cream/90"
                asChild
              >
                <Link href="/download">
                  Get Started for Free
                  <span aria-hidden="true">→</span>
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/docs">View Documentation</Link>
              </Button>
            </div>
          </div>

          {/* Right: Terminal Preview */}
          <div className="flex items-center justify-center lg:justify-end">
            <TerminalBlock />
          </div>
        </div>
      </div>
    </section>
  );
}
