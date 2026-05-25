'use client';
import { motion } from 'framer-motion';
import {
  Zap,
  Users,
  Brain,
  Layers,
  Maximize2,
  Mic2,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Users,
    title: 'A roster of AI creators',
    body: 'Diverse, expressive talent. Pick a face that fits your brand — or generate a brand-new one from text.',
    span: 'md:col-span-2 md:row-span-2',
    accent: true,
  },
  {
    icon: Mic2,
    title: 'Studio-grade voice',
    body: 'ElevenLabs voices fine-tuned per creator — emotion lands, never sounds robotic.',
  },
  {
    icon: Brain,
    title: 'Scripts that convert',
    body: 'GPT-4o trained on viral UGC patterns — first-person, hooky, casual.',
  },
  {
    icon: Maximize2,
    title: '9:16, 1:1, 16:9',
    body: 'One generation, every aspect ratio. Repurpose to every channel without re-shooting.',
    span: 'md:col-span-2',
  },
  {
    icon: Layers,
    title: 'Iterate without losing work',
    body: 'Stack drafts in studio. Tweak, regenerate, compare side-by-side.',
  },
  {
    icon: Zap,
    title: '60-second renders',
    body: 'Behind the scenes: Kling 3.0 Pro on FAL infra. Generations are fast.',
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="relative py-32 px-6 lg:px-10">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-accent3/10 blur-[140px] pointer-events-none" />
      <div className="relative max-w-7xl mx-auto">
        <div className="mb-20 max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.25em] text-accent2 mb-4 font-semibold">
            Built for builders
          </p>
          <h2 className="font-display font-bold tracking-[-0.04em] text-[clamp(40px,5vw,72px)] leading-[0.95]">
            Every tool you need.{' '}
            <span className="text-gradient">Nothing you don't.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 auto-rows-[200px] gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className={`relative p-7 rounded-card border border-white/[0.06] hover:border-white/15 transition-all overflow-hidden group ${
                  f.accent
                    ? 'bg-gradient-to-br from-accent1/15 via-accent2/10 to-accent3/15'
                    : 'bg-elevated/40'
                } ${f.span ?? ''}`}
              >
                <div className="relative z-10 flex flex-col h-full">
                  <Icon
                    className={`w-7 h-7 mb-5 ${
                      f.accent ? 'text-white' : 'text-accent2'
                    }`}
                  />
                  <h3 className="font-bold text-xl mb-2">{f.title}</h3>
                  <p className="text-sm text-white/55 leading-relaxed max-w-md">
                    {f.body}
                  </p>
                </div>
                {f.accent && (
                  <div className="absolute -bottom-20 -right-20 w-72 h-72 rounded-full bg-brand-gradient opacity-30 blur-3xl group-hover:opacity-50 transition-opacity" />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
