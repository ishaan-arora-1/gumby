'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { ArrowRight } from 'lucide-react';

export function BigCTA() {
  return (
    <section className="relative py-32 px-6 lg:px-10 overflow-hidden">
      <div className="absolute inset-0 bg-brand-gradient-radial opacity-30" />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="relative max-w-5xl mx-auto text-center"
      >
        <h2 className="font-display font-bold tracking-[-0.04em] text-[clamp(48px,7vw,108px)] leading-[0.9]">
          Ship the ad. <br />
          <span className="text-gradient">Then ship ten more.</span>
        </h2>
        <p className="mt-8 max-w-xl mx-auto text-lg text-white/65">
          Your first generation is free. No credit card. No call. Just
          press the button.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link href="/login?mode=signup">
            <Button variant="gradient" size="xl">
              Get started — free
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/studio">
            <Button variant="outline" size="xl">
              See the studio
            </Button>
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
