import Link from "next/link";

const footerLinks = {
  Product: [
    { label: "Download", href: "/download" },
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Skills", href: "#skills" },
  ],
  Resources: [
    { label: "Documentation", href: "/docs" },
    { label: "Quickstart", href: "/docs/quickstart" },
    { label: "Skills Marketplace", href: "/skills" },
    { label: "Changelog", href: "/changelog" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Careers", href: "/careers" },
    { label: "Contact", href: "/contact" },
  ],
  Community: [
    { label: "GitHub", href: "https://github.com/crafter-station/crafter-code" },
    { label: "Discord", href: "https://discord.gg/crafterstation" },
    { label: "X (Twitter)", href: "https://x.com/crafterstation" },
    { label: "YouTube", href: "https://youtube.com/@crafterstation" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-6">
          {/* Logo and status */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-8 w-8"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              <span className="font-mono text-lg font-medium tracking-tight">
                crafter/code
              </span>
            </Link>
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-accent-teal" />
              <span className="text-sm text-muted-foreground">
                All Systems Operational
              </span>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Built by{" "}
              <Link
                href="https://crafterstation.com"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Crafter Station
              </Link>
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="mb-4 font-medium text-foreground">{category}</h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 md:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Crafter Station. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
