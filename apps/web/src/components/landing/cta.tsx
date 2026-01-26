import { Button } from "@crafter-code/ui";
import Link from "next/link";

export function CTA() {
  return (
    <section className="border-t border-border py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-12 md:p-16">
          {/* Background pattern */}
          <div className="absolute inset-0 -z-10 opacity-30">
            <svg
              className="h-full w-full"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <pattern
                  id="wave-pattern"
                  x="0"
                  y="0"
                  width="100"
                  height="100"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M0 50 Q25 30 50 50 T100 50"
                    stroke="currentColor"
                    strokeWidth="0.5"
                    fill="none"
                    className="text-border"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#wave-pattern)" />
            </svg>
          </div>

          <div className="max-w-2xl">
            <h2 className="font-serif text-4xl text-foreground sm:text-5xl">
              Ready to build the
              <br />
              <span className="italic text-cream">software of the future?</span>
            </h2>
            <p className="mt-6 text-lg text-muted-foreground">
              Join thousands of developers building with AI agents. Start free,
              scale when you're ready.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button
                size="lg"
                className="gap-2 bg-foreground text-background hover:bg-foreground/90"
                asChild
              >
                <Link href="/download">
                  Start Building
                  <span aria-hidden="true">→</span>
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/docs/quickstart">Quickstart Guide</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
