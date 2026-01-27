"use client";

import dynamic from "next/dynamic";

const Workspace = dynamic(
  () =>
    import("@/components/workspace/workspace").then((mod) => mod.Workspace),
  { ssr: false },
);

export default function Home() {
  return <Workspace />;
}
