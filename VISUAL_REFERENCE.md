# Visual Style Reference - Crafter Code

> Based on Amp Code and Factory.ai design language

---

## 1. Core Aesthetic

**Style Name:** **Dark Terminal Elegance**

**Design Philosophy:** Premium developer tools deserve premium design - combining editorial sophistication with terminal authenticity to create a sense of frontier technology.

**Key Influences:**
- Editorial/Magazine typography (Amp's italic serif headlines)
- Terminal/CLI interfaces (monospace code blocks, command prompts)
- Architectural photography backgrounds (geometric patterns, depth)
- Linear/Vercel minimal dark UI patterns

---

## 2. Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| **Deep Black** | `#0a0a0a` | Primary background |
| **Warm Black** | `#141414` | Card backgrounds, elevated surfaces |
| **Charcoal** | `#1a1a1a` | Secondary backgrounds |
| **Muted Gray** | `#737373` | Secondary text, borders |
| **Light Gray** | `#a3a3a3` | Body text |
| **Off White** | `#fafafa` | Headlines, primary text |
| **Cream/Warm White** | `#f5f0e6` | Accent headlines (Amp style) |
| **Orange Accent** | `#f97316` | CTAs, status indicators, links |
| **Teal Accent** | `#2dd4bf` | Secondary accent, success states |
| **Yellow Code** | `#fbbf24` | Code syntax highlighting |

**Total Colors:** 10 core colors (minimal, intentional palette)

---

## 3. Typography System

### Headlines
- **Primary:** Serif italic display font (like Playfair Display Italic or similar editorial serif)
- **Weight:** Regular to Medium
- **Scale:** 64-96px for hero, 32-48px for section headers
- **Style:** Elegant italics for key phrases, creating editorial tension

### Body Text
- **Family:** Sans-serif (Inter, Geist Sans)
- **Weight:** Regular 400, Medium 500
- **Size:** 16-18px
- **Line Height:** 1.6-1.7
- **Color:** Muted gray (`#a3a3a3`) for secondary, white for emphasis

### Monospace/Code
- **Family:** Geist Mono, JetBrains Mono
- **Usage:** Terminal blocks, dates, labels, technical content
- **Size:** 14px
- **Weight:** Regular
- **Styling:** ALL CAPS for labels (e.g., "INSTALL AMP", "NEWS")

### Hierarchy Structure
```
1. Hero Headline (serif italic) - 72-96px
2. Section Label (mono, caps) - 12-14px
3. Section Headline (serif italic) - 36-48px
4. Body Large (sans) - 18-20px
5. Body (sans) - 16px
6. Caption/Date (mono) - 12-14px
```

---

## 4. Key Design Elements

### Background Treatments
- **Architectural imagery:** Subtle, dark geometric backgrounds (columns, arches)
- **Opacity overlay:** 60-80% dark overlay on background images
- **Subtle gradient:** Very slight radial gradients from center
- **Wave/line patterns:** Animated or static geometric line art (Footer area)

### Terminal Blocks
```
┌─────────────────────────────────────────┐
│  Tabs: [Terminal] [VS Code, Cursor...]  │
├─────────────────────────────────────────┤
│  │ Catch up on the very cool effect...  │
│  │ https://ampcode.com/threads/...      │
│                                         │
│  ✓ Thinking ▶                          │
└─────────────────────────────────────────┘
```
- Border: 1px subtle gray
- Tab system for context switching
- Yellow/orange for highlighted text
- Vertical accent line (left border highlight)

### Status Indicators
- **Orange dot** (`●`) before labels: "● KEY FEATURES", "● FOOTER"
- Used to mark sections and draw attention

### News/Changelog Layout
```
DATE (mono)      │  HEADLINE (serif italic)
JANUARY 15, 2026 │  Tab, Tab, Dead
                 │  We're removing Amp Tab...
```
- Vertical divider line
- Two-column asymmetric layout
- Date in monospace, headline in serif italic

### Testimonials
- Italic serif for quotes
- Attribution with em-dash: `— Author Name`
- Grid layout, 4-5 columns on desktop
- Light weight, elegant reading experience

### CTAs
- **Primary:** White/cream background, dark text, arrow icon
- **Secondary:** Outlined, subtle border
- **Style:** `Get Started for Free →`
- **Padding:** Generous (16-20px vertical, 24-32px horizontal)

### Footer
- Multi-column link grid
- Logo + status indicator ("All Systems Operational")
- Muted colors throughout
- Theme switcher (Dark/Light/System)

---

## 5. Visual Concept

### Conceptual Bridge
The design bridges **editorial sophistication** (serif italics, testimonial layouts, clean typography) with **developer credibility** (terminal blocks, monospace labels, CLI commands). This creates a sense of:

- **Authority:** "This is a serious tool"
- **Elegance:** "This is beautifully crafted"
- **Frontier:** "This is cutting-edge technology"

### Element Relationships
1. **Serif headlines + Monospace labels** = Technical elegance
2. **Dark background + Cream accents** = Premium without being cold
3. **Terminal UI + Editorial layout** = Developer-first but design-conscious
4. **Architectural backgrounds + Minimal UI** = Depth without clutter

### Ideal Use Cases
- Developer tools and IDEs
- AI/ML products
- CLI and terminal applications
- Technical documentation sites
- B2B SaaS with developer focus

---

## 6. Implementation Notes for Crafter Code

### Fonts to Use
```bash
# Install from Google Fonts or use Next.js font optimization
- Playfair Display (italic) or Libre Baskerville (italic) for headlines
- Geist Sans for body
- Geist Mono for code/labels
```

### Tailwind Config Additions
```js
colors: {
  background: '#0a0a0a',
  surface: '#141414',
  border: '#262626',
  muted: '#737373',
  foreground: '#fafafa',
  cream: '#f5f0e6',
  accent: {
    orange: '#f97316',
    teal: '#2dd4bf',
  }
}
```

### Key Components Needed
1. `<HeroSection />` - Serif headline + terminal preview
2. `<TerminalBlock />` - Tabbed code/terminal display
3. `<NewsSection />` - Date | Headline two-column layout
4. `<TestimonialGrid />` - Quote cards with attribution
5. `<Footer />` - Multi-column with status indicator
6. `<SectionLabel />` - Orange dot + mono caps label

---

## 7. Crafter Code Specific Adaptations

### Hero Copy
```
Engineered
For Agents.

Crafter Code is the agent-first IDE that lets you
orchestrate multiple AI sessions with full visibility.

Track what they build. Ship while you sleep.
```

### Section Ideas
1. **Install** - `bun add crafter-code` terminal block
2. **Multi-Agent** - Split pane visualization
3. **Skills Marketplace** - Leaderboard/grid of skills
4. **Ralph Method** - Iterative loop visualization
5. **Testimonials** - Quotes from early users
6. **Pricing** - Free / Pro / Team tiers

### Unique Differentiator Visual
- Show multiple terminal panes running agents simultaneously
- Real-time file diff visualization
- Skills being installed with one command
