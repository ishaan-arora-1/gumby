'use client';
import { motion } from 'framer-motion';

const STATS = [
  { value: '60s', label: 'Average render time' },
  { value: '5×', label: 'More creative tests per week' },
  { value: '$0', label: 'Studio + actor cost' },
  { value: '∞', label: 'Iterations per idea' },
];

export function Stats() {
  return (
    <section className="relative py-24 px-6 lg:px-10 border-y border-white/5">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-y-12">
        {STATS.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="text-center md:text-left"
          >
            <div className="font-display font-bold text-gradient text-[clamp(48px,6vw,84px)] leading-none tracking-[-0.04em]">
              {s.value}
            </div>
            <div className="mt-2 text-sm text-white/50">{s.label}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
