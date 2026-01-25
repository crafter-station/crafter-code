import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Crafter Code - Agent-first IDE",
  description:
    "The agent-first IDE for 10-person $100B companies. Track multiple AI agent sessions, real-time codebase changes, and skills marketplace.",
  openGraph: {
    title: "Crafter Code - Agent-first IDE",
    description:
      "Orchestrate multiple AI agents with full visibility. Track what they build. Ship while you sleep.",
    url: "https://code.crafter.run",
    siteName: "Crafter Code",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Crafter Code - Agent-first IDE",
    description:
      "Orchestrate multiple AI agents with full visibility. Track what they build. Ship while you sleep.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
