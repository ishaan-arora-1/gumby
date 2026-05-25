'use client';
import { useEffect, useState } from 'react';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import { motion } from 'framer-motion';
import { fetchFeaturedTemplates } from '@/lib/api';

const FALLBACK = [
  { src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', name: 'Maya', niche: 'Beauty & skincare' },
  { src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', name: 'Sienna', niche: 'Fashion & lifestyle' },
  { src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', name: 'Jordan', niche: 'Tech & gadgets' },
  { src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', name: 'Kai', niche: 'Fitness & supplements' },
  { src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', name: 'Rae', niche: 'Wellness & creators' },
  { src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4', name: 'Theo', niche: 'Food & beverage' },
];

interface Reel {
  src: string;
  poster?: string;
  name: string;
  niche: string;
}

export function ReelShowcase() {
  const [reels, setReels] = useState<Reel[]>(FALLBACK);

  useEffect(() => {
    fetchFeaturedTemplates(8).then((tpls) => {
      const r: Reel[] = tpls
        .filter((t) => t.video_url)
        .map((t) => ({
          src: t.video_url,
          poster: t.thumbnail_url,
          name: t.actor_name || t.name || 'Creator',
          niche: t.description || t.category || 'AI creator',
        }));
      if (r.length > 0) {
        // Top up with fallbacks if backend returned fewer than 6
        while (r.length < 6) r.push(FALLBACK[r.length % FALLBACK.length]);
        setReels(r);
      }
    });
  }, []);

  return (
    <section id="templates" className="relative py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 mb-16">
        <p className="text-[11px] uppercase tracking-[0.25em] text-accent2 mb-4 font-semibold">
          The roster
        </p>
        <h2 className="font-display font-bold tracking-[-0.04em] text-[clamp(40px,5vw,72px)] leading-[0.95] max-w-4xl">
          Faces your audience{' '}
          <span className="text-gradient">already trusts.</span>
        </h2>
        <p className="mt-6 max-w-xl text-lg text-white/55">
          Curated AI creators across every niche. Or generate a brand-new face
          from a single prompt — they're yours, exclusively.
        </p>
      </div>

      <div className="relative">
        <div className="flex gap-4 px-6 lg:px-10 overflow-x-auto no-scrollbar snap-x snap-mandatory">
          {reels.map((r, i) => (
            <motion.div
              key={r.name + i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="flex-shrink-0 w-[260px] sm:w-[300px] snap-start"
            >
              <div className="relative aspect-[9/16] rounded-card overflow-hidden gradient-border group cursor-pointer">
                <LoopingVideo
                  src={r.src}
                  poster={r.poster}
                  className="w-full h-full"
                />
                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black via-black/70 to-transparent">
                  <div className="font-bold text-lg">{r.name}</div>
                  <div className="text-xs text-white/60">{r.niche}</div>
                </div>
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-pill bg-black/70 backdrop-blur border border-white/10 text-[10px] font-semibold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition">
                  Use creator
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
