import { Nav } from '@/components/landing/Nav';
import { Hero } from '@/components/landing/Hero';
import { Stats } from '@/components/landing/Stats';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { ReelShowcase } from '@/components/landing/ReelShowcase';
import { FeatureGrid } from '@/components/landing/FeatureGrid';
import { Pricing } from '@/components/landing/Pricing';
import { BigCTA } from '@/components/landing/BigCTA';
import { Footer } from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <main className="bg-black text-white">
      <Nav />
      <Hero />
      <Stats />
      <HowItWorks />
      <ReelShowcase />
      <FeatureGrid />
      <Pricing />
      <BigCTA />
      <Footer />
    </main>
  );
}
