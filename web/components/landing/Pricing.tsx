'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const PLANS = [
  {
    name: 'Starter',
    price: 'Free',
    sub: 'Try it out',
    features: [
      '5 generations / month',
      'All curated creators',
      '720p exports',
      'Watermarked',
    ],
    cta: 'Start free',
    featured: false,
  },
  {
    name: 'Creator',
    price: '$39',
    sub: 'per month',
    features: [
      '100 generations / month',
      'Generate custom creators',
      '1080p exports, no watermark',
      'Save to library',
      'Priority queue',
    ],
    cta: 'Start 7-day trial',
    featured: true,
  },
  {
    name: 'Brand',
    price: '$199',
    sub: 'per month',
    features: [
      'Unlimited generations',
      '4K exports',
      'Team seats (5)',
      'Brand-locked custom creators',
      'API access',
      'Priority support',
    ],
    cta: 'Talk to sales',
    featured: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-20 text-center max-w-3xl mx-auto">
          <p className="text-[11px] uppercase tracking-[0.25em] text-accent2 mb-4 font-semibold">
            Pricing
          </p>
          <h2 className="font-display font-bold tracking-[-0.04em] text-[clamp(40px,5vw,72px)] leading-[0.95]">
            Cheaper than a single{' '}
            <span className="text-gradient">UGC creator brief.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {PLANS.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={`relative p-8 rounded-card border ${
                p.featured
                  ? 'border-transparent bg-gradient-to-b from-accent1/20 via-accent2/10 to-accent3/10 ring-1 ring-accent2/40'
                  : 'border-white/[0.08] bg-elevated/30'
              } flex flex-col`}
            >
              {p.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-pill bg-brand-gradient text-[10px] font-bold uppercase tracking-widest">
                  Most popular
                </div>
              )}
              <div className="text-sm text-white/60 mb-1">{p.name}</div>
              <div className="flex items-baseline gap-2 mb-1">
                <div className="font-display font-bold text-5xl tracking-tight">
                  {p.price}
                </div>
                <div className="text-white/50 text-sm">{p.sub}</div>
              </div>
              <ul className="my-8 space-y-3 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-white/75">
                    <Check className="w-4 h-4 mt-0.5 text-accent2 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/login?mode=signup">
                <Button
                  variant={p.featured ? 'gradient' : 'outline'}
                  size="lg"
                  className="w-full"
                >
                  {p.cta}
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
