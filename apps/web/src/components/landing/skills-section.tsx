import { Badge } from "@crafter-code/ui";

const supportedAgents = [
  {
    name: "Claude Code",
    command: "claude",
    status: "Supported",
    description: "Anthropic's CLI",
  },
  {
    name: "Gemini CLI",
    command: "gemini",
    status: "Supported",
    description: "Google's CLI",
  },
  {
    name: "Codex CLI",
    command: "codex",
    status: "Coming Soon",
    description: "OpenAI's CLI",
  },
  {
    name: "Custom Agent",
    command: "your-cli",
    status: "ACP Compatible",
    description: "Any ACP agent",
  },
];

export function SkillsSection() {
  return (
    <section id="agents" className="border-t border-border bg-card/50 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Left: Copy */}
          <div>
            <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent-orange">
              <span className="inline-block h-2 w-2 rounded-full bg-accent-orange" />
              Supported Agents
            </p>
            <h2 className="font-serif text-4xl italic text-cream sm:text-5xl">
              Your CLI.
              <br />
              <span className="not-italic text-foreground">Our interface.</span>
            </h2>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              Crafter Code auto-detects CLI agents on your system. Just have
              them installed and we'll handle the rest via the Agent Client
              Protocol.
            </p>
            <div className="mt-8 rounded-lg border border-border bg-background p-4">
              <code className="font-mono text-sm">
                <span className="text-accent-orange">$</span>{" "}
                <span className="text-muted-foreground">brew install</span>{" "}
                <span className="text-foreground">claude gemini</span>
              </code>
            </div>
          </div>

          {/* Right: Agents list */}
          <div className="rounded-lg border border-border bg-background p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Available Agents
              </h3>
              <Badge variant="secondary" className="font-mono text-xs">
                ACP v1
              </Badge>
            </div>
            <div className="space-y-3">
              {supportedAgents.map((agent) => (
                <div
                  key={agent.name}
                  className="flex items-center justify-between rounded-md border border-border/50 bg-card/50 px-4 py-3 transition-colors hover:border-border"
                >
                  <div className="flex items-center gap-3">
                    <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      {agent.command}
                    </code>
                    <div>
                      <p className="font-mono text-sm text-foreground">
                        {agent.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {agent.description}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      agent.status === "Supported" ? "default" : "secondary"
                    }
                    className="font-mono text-xs"
                  >
                    {agent.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
