import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Tauri expects the output in the dist folder
  distDir: "out",
};

export default nextConfig;
