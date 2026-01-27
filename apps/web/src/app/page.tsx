import {
  CTA,
  Features,
  Footer,
  Header,
  Hero,
  Pricing,
  SkillsSection,
} from "@/components/landing";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <Features />
        <SkillsSection />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
