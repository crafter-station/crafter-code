import { Badge } from "@crafter-code/ui";

const topSkills = [
  { name: "vercel-react-best-practices", author: "vercel-labs", installs: "46.2K" },
  { name: "web-design-guidelines", author: "vercel-labs", installs: "35.2K" },
  { name: "remotion-best-practices", author: "remotion-dev", installs: "30.1K" },
  { name: "frontend-design", author: "anthropics", installs: "13.0K" },
  { name: "supabase-postgres", author: "supabase", installs: "3.6K" },
  { name: "better-auth", author: "better-auth", installs: "3.4K" },
  { name: "expo-deployment", author: "expo", installs: "2.3K" },
  { name: "stripe-best-practices", author: "stripe", installs: "352" },
];

export function SkillsSection() {
  return (
    <section id="skills" className="border-t border-border bg-card/50 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Left: Copy */}
          <div>
            <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent-orange">
              <span className="inline-block h-2 w-2 rounded-full bg-accent-orange" />
              Skills Ecosystem
            </p>
            <h2 className="font-serif text-4xl italic text-cream sm:text-5xl">
              One command.
              <br />
              <span className="not-italic text-foreground">Infinite capabilities.</span>
            </h2>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              Skills are reusable capabilities for AI agents. Install them to enhance
              your agents with access to procedural knowledge from top companies.
            </p>
            <div className="mt-8 rounded-lg border border-border bg-background p-4">
              <code className="font-mono text-sm">
                <span className="text-accent-orange">$</span>{" "}
                <span className="text-muted-foreground">npx skills add</span>{" "}
                <span className="text-foreground">vercel-labs/agent-skills</span>
              </code>
            </div>
          </div>

          {/* Right: Skills list */}
          <div className="rounded-lg border border-border bg-background p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Top Skills
              </h3>
              <Badge variant="secondary" className="font-mono text-xs">
                24,298 total
              </Badge>
            </div>
            <div className="space-y-3">
              {topSkills.map((skill, index) => (
                <div
                  key={skill.name}
                  className="flex items-center justify-between rounded-md border border-border/50 bg-card/50 px-4 py-3 transition-colors hover:border-border"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-mono text-sm text-foreground">
                        {skill.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {skill.author}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-sm text-muted-foreground">
                    {skill.installs}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
