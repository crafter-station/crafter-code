const testimonials = [
  {
    quote:
      "Finally an IDE that understands agents are the future. I can run 3 Claude sessions overnight and wake up to PRs ready for review.",
    author: "Alex Chen",
    role: "Founder, Stealth Startup",
  },
  {
    quote:
      "The skills marketplace is a game-changer. Installing best practices from Vercel and Supabase with one command? Yes please.",
    author: "Maria Santos",
    role: "Staff Engineer, Series B",
  },
  {
    quote:
      "We shipped our MVP in 2 weeks using Ralph loops. The iterative approach just works. Our 4-person team moves faster than most 40-person teams.",
    author: "James Wilson",
    role: "CTO, YC W26",
  },
  {
    quote:
      "Multi-agent orchestration is what I've been waiting for. Crafter Code makes it feel like I have a team of AI engineers.",
    author: "Sarah Kim",
    role: "Solo Founder",
  },
  {
    quote:
      "The real-time diff view is incredible. Watching agents refactor code in real-time is both terrifying and beautiful.",
    author: "David Park",
    role: "Principal Engineer",
  },
];

export function Testimonials() {
  return (
    <section className="border-t border-border bg-card/30 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16">
          <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-accent-orange">
            <span className="inline-block h-2 w-2 rounded-full bg-accent-orange" />
            Testimonials
          </p>
          <h2 className="font-serif text-4xl italic text-cream sm:text-5xl">
            Loved by
            <br />
            <span className="not-italic text-foreground">
              high-agency builders.
            </span>
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.author}
              className="flex flex-col rounded-lg border border-border bg-background p-6"
            >
              <blockquote className="flex-1 font-serif text-sm italic leading-relaxed text-foreground/90">
                "{testimonial.quote}"
              </blockquote>
              <div className="mt-4 border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground">
                  — {testimonial.author}
                </p>
                <p className="text-xs text-muted-foreground">
                  {testimonial.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
