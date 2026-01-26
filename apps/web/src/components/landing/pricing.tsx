import { Button } from "@crafter-code/ui";
import { Check } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Free",
    price: "$0",
    description: "For individual developers getting started.",
    features: [
      "Single agent session",
      "Basic skills access",
      "Community support",
      "5 sessions/day",
    ],
    cta: "Get Started",
    href: "/download",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    description: "For serious builders who ship fast.",
    features: [
      "Unlimited agent sessions",
      "Multi-agent orchestration",
      "All skills access",
      "Usage analytics",
      "Priority support",
      "Ralph loops built-in",
    ],
    cta: "Start Pro Trial",
    href: "/signup?plan=pro",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$99",
    period: "/seat/month",
    description: "For teams building the future.",
    features: [
      "Everything in Pro",
      "Shared workspace",
      "Team analytics",
      "Admin controls",
      "SSO with Clerk",
      "Dedicated support",
    ],
    cta: "Contact Sales",
    href: "/contact",
    highlighted: false,
  },
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
            Simple pricing.
            <br />
            <span className="not-italic text-foreground">No surprises.</span>
          </h2>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "relative flex flex-col rounded-lg border p-8",
                tier.highlighted
                  ? "border-accent-orange bg-accent-orange/5"
                  : "border-border bg-card"
              )}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-accent-orange px-3 py-1 text-xs font-medium text-background">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-medium text-foreground">
                  {tier.name}
                </h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground">
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span className="text-sm text-muted-foreground">
                      {tier.period}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {tier.description}
                </p>
              </div>

              <ul className="mb-8 flex-1 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-teal" />
                    <span className="text-sm text-muted-foreground">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                variant={tier.highlighted ? "default" : "outline"}
                className={cn(
                  "w-full",
                  tier.highlighted &&
                    "bg-accent-orange text-background hover:bg-accent-orange/90"
                )}
                asChild
              >
                <Link href={tier.href}>{tier.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
