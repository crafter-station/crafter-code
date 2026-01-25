/**
 * Brand Asset Generator for Crafter Code
 *
 * Generates OG images and favicon using brand colors and logo.
 * Run: bun scripts/generate-assets.ts
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

// Brand colors extracted from globals.css
const BRAND = {
  background: "#0a0a0a",
  foreground: "#fafafa",
  cream: "#f5f0e6",
  orange: "#f97316",
  teal: "#2dd4bf",
  muted: "#737373",
  border: "#262626",
} as const;

// Logo SVG (layered stack icon)
const logoSvg = `
<svg viewBox="0 0 24 24" fill="none" stroke="${BRAND.foreground}" stroke-width="1.5">
  <path d="M12 2L2 7l10 5 10-5-10-5z" />
  <path d="M2 17l10 5 10-5" />
  <path d="M2 12l10 5 10-5" />
</svg>
`;

// Generate OG image SVG (1200x630 for Open Graph)
function generateOgImage(): string {
  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="${BRAND.border}" stroke-width="0.5" opacity="0.3"/>
    </pattern>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#141414"/>
      <stop offset="100%" style="stop-color:${BRAND.background}"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#grad)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>

  <!-- Decorative accent line -->
  <rect x="80" y="180" width="4" height="120" fill="${BRAND.orange}" rx="2"/>

  <!-- Logo icon -->
  <g transform="translate(100, 400)">
    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="${BRAND.foreground}" stroke-width="1.5">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  </g>

  <!-- Brand name -->
  <text x="160" y="440" font-family="monospace" font-size="24" fill="${BRAND.foreground}" font-weight="500">
    crafter/code
  </text>

  <!-- Headline - Serif italic style -->
  <text x="100" y="220" font-family="Georgia, serif" font-size="72" fill="${BRAND.cream}" font-style="italic">
    Engineered
  </text>
  <text x="100" y="300" font-family="Georgia, serif" font-size="72" fill="${BRAND.foreground}">
    For Agents.
  </text>

  <!-- Tagline -->
  <text x="100" y="360" font-family="system-ui, sans-serif" font-size="24" fill="${BRAND.muted}">
    The agent-first IDE for 10-person $100B companies.
  </text>

  <!-- URL badge -->
  <g transform="translate(100, 520)">
    <rect width="200" height="36" rx="18" fill="${BRAND.border}"/>
    <text x="100" y="24" text-anchor="middle" font-family="monospace" font-size="14" fill="${BRAND.foreground}">
      code.crafter.run
    </text>
  </g>

  <!-- Terminal window decoration -->
  <g transform="translate(700, 140)">
    <rect width="420" height="350" rx="12" fill="#141414" stroke="${BRAND.border}" stroke-width="1"/>
    <!-- Window header -->
    <rect width="420" height="40" rx="12" fill="#1a1a1a"/>
    <rect y="28" width="420" height="12" fill="#1a1a1a"/>
    <!-- Traffic lights -->
    <circle cx="24" cy="20" r="6" fill="#ff5f57"/>
    <circle cx="44" cy="20" r="6" fill="#febc2e"/>
    <circle cx="64" cy="20" r="6" fill="#28c840"/>
    <!-- Terminal content -->
    <text x="24" y="80" font-family="monospace" font-size="14" fill="${BRAND.orange}">$</text>
    <text x="44" y="80" font-family="monospace" font-size="14" fill="${BRAND.muted}">bun add -g</text>
    <text x="160" y="80" font-family="monospace" font-size="14" fill="${BRAND.foreground}">crafter-code</text>

    <text x="24" y="120" font-family="monospace" font-size="14" fill="${BRAND.teal}">✓</text>
    <text x="44" y="120" font-family="monospace" font-size="14" fill="${BRAND.muted}">Starting agent session...</text>

    <text x="24" y="160" font-family="monospace" font-size="14" fill="${BRAND.muted}">│</text>
    <text x="44" y="160" font-family="monospace" font-size="13" fill="#fbbf24">Analyzing codebase structure...</text>

    <text x="24" y="200" font-family="monospace" font-size="14" fill="${BRAND.muted}">│</text>
    <text x="44" y="200" font-family="monospace" font-size="13" fill="#fbbf24">Running 3 parallel agents</text>

    <text x="24" y="260" font-family="monospace" font-size="14" fill="${BRAND.teal}">✓</text>
    <text x="44" y="260" font-family="monospace" font-size="14" fill="${BRAND.teal}">Thinking</text>
    <text x="120" y="260" font-family="monospace" font-size="14" fill="${BRAND.teal}">▶</text>
  </g>
</svg>`;
}

// Generate Twitter OG image (1200x600)
function generateTwitterOgImage(): string {
  return `<svg width="1200" height="600" viewBox="0 0 1200 600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="grid2" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${BRAND.border}" stroke-width="0.5" opacity="0.2"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="1200" height="600" fill="${BRAND.background}"/>
  <rect width="1200" height="600" fill="url(#grid2)"/>

  <!-- Center content -->
  <g transform="translate(600, 300)">
    <!-- Logo -->
    <g transform="translate(-24, -180)">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="${BRAND.orange}" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    </g>

    <!-- Brand name -->
    <text x="0" y="-100" text-anchor="middle" font-family="monospace" font-size="28" fill="${BRAND.foreground}" font-weight="600">
      crafter/code
    </text>

    <!-- Headline -->
    <text x="0" y="-20" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="${BRAND.cream}" font-style="italic">
      Agent-first IDE
    </text>

    <!-- Tagline -->
    <text x="0" y="60" text-anchor="middle" font-family="system-ui, sans-serif" font-size="24" fill="${BRAND.muted}">
      Multi-agent orchestration • Skills marketplace • Ralph loops
    </text>

    <!-- URL -->
    <text x="0" y="140" text-anchor="middle" font-family="monospace" font-size="18" fill="${BRAND.orange}">
      code.crafter.run
    </text>
  </g>
</svg>`;
}

// Generate favicon SVG (simple version for conversion)
function generateFaviconSvg(): string {
  return `<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <rect width="48" height="48" rx="8" fill="${BRAND.background}"/>
  <g transform="translate(8, 8)">
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="${BRAND.orange}" stroke-width="2.5">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  </g>
</svg>`;
}

// Simple ICO file generation (basic BMP-based ICO)
// For production, use sharp or a proper ICO generator
function generateIcoFromSvg(): Buffer {
  // This creates a minimal ICO file header
  // For best results, convert the SVG using sharp in a real build
  const svgContent = generateFaviconSvg();

  // Return SVG as buffer for now - in production use sharp to convert
  return Buffer.from(svgContent);
}

async function svgToPng(svg: string, width: number, height: number): Promise<Buffer> {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

async function generateFaviconIco(svg: string): Promise<Buffer> {
  // Generate multiple sizes for ICO
  const sizes = [16, 32, 48];
  const pngBuffers: Buffer[] = [];

  for (const size of sizes) {
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: size },
    });
    const pngData = resvg.render();
    pngBuffers.push(pngData.asPng());
  }

  // For simplicity, just use the 32x32 PNG converted to ICO format
  // A proper ICO would bundle multiple sizes, but browsers handle PNG favicons well
  return pngBuffers[1]; // 32x32
}

async function main() {
  const publicDir = join(process.cwd(), "public");

  // Ensure public directory exists
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
  }

  console.log("🎨 Generating brand assets for Crafter Code...\n");

  // Generate OG image
  const ogSvg = generateOgImage();
  writeFileSync(join(publicDir, "og.svg"), ogSvg);
  const ogPng = await svgToPng(ogSvg, 1200, 630);
  writeFileSync(join(publicDir, "og.png"), ogPng);
  console.log("✓ Generated /public/og.png (1200×630)");

  // Generate Twitter OG image
  const twitterSvg = generateTwitterOgImage();
  writeFileSync(join(publicDir, "og-twitter.svg"), twitterSvg);
  const twitterPng = await svgToPng(twitterSvg, 1200, 600);
  writeFileSync(join(publicDir, "og-twitter.png"), twitterPng);
  console.log("✓ Generated /public/og-twitter.png (1200×600)");

  // Generate favicon
  const faviconSvg = generateFaviconSvg();
  writeFileSync(join(publicDir, "favicon.svg"), faviconSvg);

  // Generate favicon PNG (32x32)
  const faviconPng = await svgToPng(faviconSvg, 32, 32);
  writeFileSync(join(publicDir, "favicon.png"), faviconPng);

  // Generate ICO (using sharp to create proper ICO)
  await sharp(faviconPng)
    .resize(32, 32)
    .toFile(join(publicDir, "favicon.ico"));
  console.log("✓ Generated /public/favicon.ico (32×32)");

  // Generate apple-touch-icon (180x180)
  const appleTouchPng = await svgToPng(faviconSvg, 180, 180);
  writeFileSync(join(publicDir, "apple-touch-icon.png"), appleTouchPng);
  console.log("✓ Generated /public/apple-touch-icon.png (180×180)");

  // Create standalone logo SVG
  const logoStandalone = `<svg width="48" height="48" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="${BRAND.foreground}" stroke-width="1.5">
  <path d="M12 2L2 7l10 5 10-5-10-5z" />
  <path d="M2 17l10 5 10-5" />
  <path d="M2 12l10 5 10-5" />
</svg>`;
  writeFileSync(join(publicDir, "logo.svg"), logoStandalone);
  console.log("✓ Generated /public/logo.svg");

  console.log("\n📋 Brand Colors:");
  console.log(`   Background: ${BRAND.background}`);
  console.log(`   Foreground: ${BRAND.foreground}`);
  console.log(`   Cream:      ${BRAND.cream}`);
  console.log(`   Orange:     ${BRAND.orange}`);
  console.log(`   Teal:       ${BRAND.teal}`);

  console.log("\n✅ Done! All assets saved to /public/");
}

main().catch(console.error);
