'use client';
import { motion } from 'framer-motion';
import { Sparkles, Mic, Wand2, Download } from 'lucide-react';

const STEPS = [
  {
    icon: Sparkles,
    n: '01',
    title: 'Cast your creator',
    body: 'Pick from curated AI creators — Maya, Sienna, Jordan, Kai — or generate your own from a single prompt.',
  },
  {
    icon: Wand2,
    n: '02',
    title: 'Write the script',
    body: 'Drop your product. Our model writes a casual, on-brand script in seconds. Edit till it feels right.',
  },
  {
    icon: Mic,
    n: '03',
    title: 'Generate lip-sync',
    body: 'Kling 3.0 + ElevenLabs render a 5–10s ad where lips, head, and emotion match the audio frame-perfect.',
  },
  {
    icon: Download,
    n: '04',
    title: 'Post everywhere',
    body: 'Export 9:16, 1:1, or 16:9. Drop straight into TikTok, Reels, Shorts, ads, anywhere you sell.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative py-32 px-6 lg:px-10">
      <div className="max-w-7xl mx-auto">
        <div className="mb-20 max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.25em] text-accent2 mb-4 font-semibold">
            How it works
          </p>
          <h2 className="font-display font-bold tracking-[-0.04em] text-[clamp(40px,5vw,72px)] leading-[0.95]">
            From product to <span className="text-gradient">posted ad</span>{' '}
            <br />in under five minutes.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="relative p-7 rounded-card bg-elevated/40 border border-white/[0.06] hover:border-white/15 transition-all hover:-translate-y-1 group"
              >
                <div className="text-[11px] font-semibold tracking-[0.2em] text-white/30 mb-6">
                  {s.n}
                </div>
                <div className="w-11 h-11 rounded-xl bg-brand-gradient flex items-center justify-center mb-5 shadow-lg shadow-accent2/20 group-hover:scale-110 transition-transform">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-bold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-white/55 leading-relaxed">{s.body}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
