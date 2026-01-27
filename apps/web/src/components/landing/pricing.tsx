import Link from "next/link";

import { Button } from "@crafter-code/ui";
import { Check } from "lucide-react";

const features = [
  "Unlimited agent sessions",
  "Multi-agent side by side",
  "Real-time streaming",
  "Multi-turn conversations",
  "ACP protocol support",
  "Claude, Gemini, and more",
  "Desktop app (macOS)",
  "Open source (MIT)",
];

export function Pricing() {
  return (
    <section id="pricing" className="border-t border-border py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <p className="mb-4 font-mono text-xs uppercase tracking-widest text-accent-orange">
            Pricing
          </p>
          <h2 className="font-serif text-4xl italic text-cream sm:text-5xl">
            Free and
            <br />
            <span className="not-italic text-foreground">open source.</span>
          </h2>
        </div>

        <div className="mx-auto max-w-md">
          <div className="relative flex flex-col rounded-lg border border-accent-orange bg-accent-orange/5 p-8">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="rounded-full bg-accent-orange px-3 py-1 text-xs font-medium text-background">
                Forever Free
              </span>
            </div>

            <div className="mb-6 text-center">
              <h3 className="text-lg font-medium text-foreground">
                Crafter Code
              </h3>
              <div className="mt-2 flex items-baseline justify-center gap-1">
                <span className="text-4xl font-bold text-foreground">$0</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                No limits. No accounts. Just download and run.
              </p>
            </div>

            <ul className="mb-8 grid grid-cols-2 gap-3">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-teal" />
                  <span className="text-sm text-muted-foreground">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>

            <Button
              className="w-full bg-accent-orange text-background hover:bg-accent-orange/90"
              asChild
            >
              <Link href="/download">Download for macOS</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
