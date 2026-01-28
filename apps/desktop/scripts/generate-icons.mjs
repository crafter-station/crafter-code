#!/usr/bin/env node
/**
 * Generate high-resolution app icons from SVG source
 * Run: bun run apps/desktop/scripts/generate-icons.mjs
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "../src-tauri/icons");

// High-quality SVG source (1024x1024 viewBox for crisp rendering)
const svgSource = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <!-- Background with rounded corners -->
  <rect width="1024" height="1024" rx="180" fill="#0a0a0a"/>

  <!-- Centered logo -->
  <g transform="translate(170, 170)">
    <svg viewBox="0 0 24 24" width="684" height="684" fill="none" stroke="#f97316" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  </g>
</svg>`;

// Required icon sizes for Tauri
const sizes = {
  // macOS
  "32x32.png": 32,
  "64x64.png": 64,
  "128x128.png": 128,
  "128x128@2x.png": 256,
  "icon.png": 512, // Base icon (will also be used for 512x512)

  // Windows Store
  "Square30x30Logo.png": 30,
  "Square44x44Logo.png": 44,
  "Square71x71Logo.png": 71,
  "Square89x89Logo.png": 89,
  "Square107x107Logo.png": 107,
  "Square142x142Logo.png": 142,
  "Square150x150Logo.png": 150,
  "Square284x284Logo.png": 284,
  "Square310x310Logo.png": 310,
  "StoreLogo.png": 50,
};

async function main() {
  console.log("Generating icons from SVG...\n");

  // Check if resvg-js is available, if not install it temporarily
  let Resvg;
  try {
    const resvgModule = await import("@resvg/resvg-js");
    Resvg = resvgModule.Resvg;
    console.log("Using @resvg/resvg-js for SVG rendering");
  } catch {
    console.log("Installing @resvg/resvg-js...");
    execSync("bun add -d @resvg/resvg-js", {
      cwd: join(__dirname, "../../.."),
      stdio: "inherit"
    });
    const resvgModule = await import("@resvg/resvg-js");
    Resvg = resvgModule.Resvg;
  }

  // Generate PNG at max size (1024x1024) first
  console.log("\nRendering SVG at 1024x1024...");
  const resvg = new Resvg(svgSource, {
    fitTo: { mode: "width", value: 1024 },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  // Save 1024x1024 as source
  const sourcePath = join(iconsDir, "icon-1024.png");
  writeFileSync(sourcePath, pngBuffer);
  console.log(`Created: icon-1024.png (1024x1024)`);

  // Use sharp to resize for other sizes
  const sharp = (await import("sharp")).default;

  for (const [filename, size] of Object.entries(sizes)) {
    const outputPath = join(iconsDir, filename);
    await sharp(pngBuffer)
      .resize(size, size, {
        kernel: sharp.kernel.lanczos3,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .raw() // Convert to raw RGBA
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => {
        return sharp(data, {
          raw: { width: info.width, height: info.height, channels: 4 }
        })
        .png({ compressionLevel: 9, palette: false }) // Force truecolor PNG
        .toFile(outputPath);
      });
    console.log(`Created: ${filename} (${size}x${size})`);
  }

  // Generate .icns for macOS using iconutil
  console.log("\nGenerating macOS .icns...");
  const iconsetDir = join(iconsDir, "icon.iconset");
  if (!existsSync(iconsetDir)) {
    mkdirSync(iconsetDir);
  }

  // macOS iconset requires specific sizes
  const icnsizes = [
    { name: "icon_16x16.png", size: 16 },
    { name: "icon_16x16@2x.png", size: 32 },
    { name: "icon_32x32.png", size: 32 },
    { name: "icon_32x32@2x.png", size: 64 },
    { name: "icon_128x128.png", size: 128 },
    { name: "icon_128x128@2x.png", size: 256 },
    { name: "icon_256x256.png", size: 256 },
    { name: "icon_256x256@2x.png", size: 512 },
    { name: "icon_512x512.png", size: 512 },
    { name: "icon_512x512@2x.png", size: 1024 },
  ];

  for (const { name, size } of icnsizes) {
    const outputPath = join(iconsetDir, name);
    await sharp(pngBuffer)
      .resize(size, size, {
        kernel: sharp.kernel.lanczos3,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha().png({ quality: 100, compressionLevel: 9 })
      .toFile(outputPath);
  }

  // Run iconutil to create .icns
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${join(iconsDir, "icon.icns")}"`, {
      stdio: "inherit",
    });
    console.log("Created: icon.icns");

    // Clean up iconset directory
    execSync(`rm -rf "${iconsetDir}"`, { stdio: "inherit" });
  } catch (e) {
    console.error("Failed to create .icns:", e.message);
  }

  // Generate .ico for Windows using sharp
  console.log("\nGenerating Windows .ico...");
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(
    icoSizes.map(async (size) => {
      return await sharp(pngBuffer)
        .resize(size, size, { kernel: sharp.kernel.lanczos3 })
        .png()
        .toBuffer();
    })
  );

  // Create ICO file manually (ICO format: header + directory entries + image data)
  const icoPath = join(iconsDir, "icon.ico");
  const ico = createIco(icoBuffers, icoSizes);
  writeFileSync(icoPath, ico);
  console.log("Created: icon.ico");

  // Generate iOS icons
  console.log("\nGenerating iOS icons...");
  const iosDir = join(iconsDir, "ios");
  if (!existsSync(iosDir)) {
    mkdirSync(iosDir);
  }

  const iosSizes = [
    { name: "AppIcon-20x20@1x.png", size: 20 },
    { name: "AppIcon-20x20@2x.png", size: 40 },
    { name: "AppIcon-20x20@2x-1.png", size: 40 },
    { name: "AppIcon-20x20@3x.png", size: 60 },
    { name: "AppIcon-29x29@1x.png", size: 29 },
    { name: "AppIcon-29x29@2x.png", size: 58 },
    { name: "AppIcon-29x29@2x-1.png", size: 58 },
    { name: "AppIcon-29x29@3x.png", size: 87 },
    { name: "AppIcon-40x40@1x.png", size: 40 },
    { name: "AppIcon-40x40@2x.png", size: 80 },
    { name: "AppIcon-40x40@2x-1.png", size: 80 },
    { name: "AppIcon-40x40@3x.png", size: 120 },
    { name: "AppIcon-60x60@2x.png", size: 120 },
    { name: "AppIcon-60x60@3x.png", size: 180 },
    { name: "AppIcon-76x76@1x.png", size: 76 },
    { name: "AppIcon-76x76@2x.png", size: 152 },
    { name: "AppIcon-83.5x83.5@2x.png", size: 167 },
    { name: "AppIcon-512@2x.png", size: 1024 },
  ];

  for (const { name, size } of iosSizes) {
    const outputPath = join(iosDir, name);
    await sharp(pngBuffer)
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .ensureAlpha().png({ quality: 100, compressionLevel: 9 })
      .toFile(outputPath);
  }
  console.log(`Created ${iosSizes.length} iOS icons`);

  // Generate Android icons
  console.log("\nGenerating Android icons...");
  const androidDpis = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
  };

  for (const [folder, size] of Object.entries(androidDpis)) {
    const folderPath = join(iconsDir, "android", folder);
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
    }

    // ic_launcher.png
    await sharp(pngBuffer)
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .ensureAlpha().png({ quality: 100 })
      .toFile(join(folderPath, "ic_launcher.png"));

    // ic_launcher_round.png (same as regular for now)
    await sharp(pngBuffer)
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .ensureAlpha().png({ quality: 100 })
      .toFile(join(folderPath, "ic_launcher_round.png"));

    // ic_launcher_foreground.png (larger, for adaptive icons)
    const fgSize = Math.round(size * 1.5);
    await sharp(pngBuffer)
      .resize(fgSize, fgSize, { kernel: sharp.kernel.lanczos3 })
      .ensureAlpha().png({ quality: 100 })
      .toFile(join(folderPath, "ic_launcher_foreground.png"));
  }
  console.log(`Created Android icons for ${Object.keys(androidDpis).length} DPIs`);

  console.log("\n✓ All icons generated successfully!");
}

// Create ICO file from PNG buffers
function createIco(pngBuffers, sizes) {
  const numImages = pngBuffers.length;

  // ICO header: 6 bytes
  // - Reserved: 2 bytes (0)
  // - Type: 2 bytes (1 for ICO)
  // - Count: 2 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type (1 = ICO)
  header.writeUInt16LE(numImages, 4); // Number of images

  // Directory entries: 16 bytes each
  const directorySize = numImages * 16;
  const directory = Buffer.alloc(directorySize);

  let dataOffset = 6 + directorySize;

  for (let i = 0; i < numImages; i++) {
    const size = sizes[i];
    const pngBuffer = pngBuffers[i];
    const entryOffset = i * 16;

    directory.writeUInt8(size >= 256 ? 0 : size, entryOffset + 0); // Width
    directory.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1); // Height
    directory.writeUInt8(0, entryOffset + 2); // Color palette
    directory.writeUInt8(0, entryOffset + 3); // Reserved
    directory.writeUInt16LE(1, entryOffset + 4); // Color planes
    directory.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    directory.writeUInt32LE(pngBuffer.length, entryOffset + 8); // Image size
    directory.writeUInt32LE(dataOffset, entryOffset + 12); // Image offset

    dataOffset += pngBuffer.length;
  }

  return Buffer.concat([header, directory, ...pngBuffers]);
}

main().catch(console.error);
