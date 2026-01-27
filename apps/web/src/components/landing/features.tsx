import { Layers, MessageSquare, Terminal, Zap } from "lucide-react";

const features = [
  {
    icon: Layers,
    title: "Multi-Agent Sessions",
    description:
      "Run Claude, Gemini, or any ACP-compatible agent side by side. See all activity in one view.",
  },
  {
    icon: Zap,
    title: "Real-time Streaming",
    description:
      "Watch responses stream in real-time. Tool calls, diffs, and completions as they happen.",
  },
  {
    icon: MessageSquare,
    title: "Multi-turn Conversations",
    description:
      "Keep CLI agents alive between prompts. Follow-up naturally like a real conversation.",
  },
  {
    icon: Terminal,
    title: "ACP Protocol",
    description:
      "Built on the Agent Client Protocol. Works with any ACP-compatible CLI out of the box.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-t border-border py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16">
          <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent-orange">
            <span className="inline-block h-2 w-2 rounded-full bg-accent-orange" />
            Key Features
          </p>
          <h2 className="font-serif text-4xl italic text-cream sm:text-5xl">
            Built for the
            <br />
            <span className="not-italic text-foreground">AI-native era.</span>
          </h2>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div key={feature.title} className="group">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card transition-colors group-hover:border-accent-orange/50">
                <feature.icon className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-accent-orange" />
              </div>
              <h3 className="mb-2 text-lg font-medium text-foreground">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
