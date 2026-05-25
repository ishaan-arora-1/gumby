'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import { ArrowRight, Sparkles } from 'lucide-react';
import { fetchFeaturedTemplates } from '@/lib/api';

interface Reel {
  src: string;
  poster?: string;
  tag: string;
}

const FALLBACK: Reel[] = [
  { src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', tag: 'Skincare' },
  { src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', tag: 'Beverage' },
  { src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', tag: 'Fitness' },
];

export function Hero() {
  const [reels, setReels] = useState<Reel[]>([]);

  useEffect(() => {
    fetchFeaturedTemplates(6).then((tpls) => {
      const r: Reel[] = tpls
        .filter((t) => t.video_url)
        .slice(0, 3)
        .map((t) => ({
          src: t.video_url,
          poster: t.thumbnail_url,
          tag: t.actor_name || t.name || t.category || 'UGC',
        }));
      // Fill with fallbacks if we don't have 3
      while (r.length < 3) r.push(FALLBACK[r.length] || FALLBACK[0]);
      setReels(r);
    });
  }, []);

  const displayReels = reels.length === 3 ? reels : FALLBACK;

  return (
    <section className="relative min-h-[100svh] pt-32 pb-20 overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-accent1/20 blur-[120px] animate-glow pointer-events-none" />
      <div className="absolute top-40 -right-40 w-[700px] h-[700px] rounded-full bg-accent3/25 blur-[140px] animate-glow pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-accent2/15 blur-[140px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-10 grid lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-pill border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 mb-8 backdrop-blur"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent2" />
            <span>Powered by Kling 3.0 + ElevenLabs</span>
            <span className="text-white/30">·</span>
            <span className="text-gradient font-semibold">Now in beta</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="font-display font-bold leading-[0.9] tracking-[-0.04em] text-[clamp(48px,8vw,112px)]"
          >
            UGC ads that <br />
            <span className="text-gradient">don't feel like ads.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-6 max-w-xl text-lg lg:text-xl text-white/65 leading-relaxed"
          >
            Cast AI creators, write scripts in seconds, ship lip-synced
            videos that look exactly like the real thing.
            <span className="text-white"> No studio. No crew. No excuses.</span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Link href="/login?mode=signup">
              <Button variant="gradient" size="xl" className="text-base">
                Start creating — free
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="#how">
              <Button variant="glass" size="xl">
                Watch a demo
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mt-12 flex items-center gap-6 text-xs text-white/40"
          >
            <div className="flex -space-x-2">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-brand-gradient border-2 border-black"
                  style={{ filter: `hue-rotate(${i * 60}deg)` }}
                />
              ))}
            </div>
            <div>
              <div className="text-white text-sm font-semibold">2,400+ creators</div>
              <div>shipping ads daily</div>
            </div>
          </motion.div>
        </div>

        <div className="lg:col-span-5 z-10 relative">
          <div className="relative h-[560px] lg:h-[640px]">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: -6 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="absolute top-0 left-0 w-[58%] h-[70%] rounded-card overflow-hidden gradient-border shadow-2xl shadow-accent3/20 animate-float"
              style={{ animationDelay: '0s' }}
            >
              <LoopingVideo
                src={displayReels[0].src}
                poster={displayReels[0].poster}
                className="w-full h-full"
              />
              <div className="absolute bottom-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-pill bg-black/60 backdrop-blur border border-white/10">
                {displayReels[0].tag}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotate: 12 }}
              animate={{ opacity: 1, scale: 1, rotate: 8 }}
              transition={{ duration: 0.8, delay: 0.35 }}
              className="absolute top-12 right-0 w-[54%] h-[62%] rounded-card overflow-hidden gradient-border shadow-2xl shadow-accent2/30 animate-float"
              style={{ animationDelay: '1.5s' }}
            >
              <LoopingVideo
                src={displayReels[1].src}
                poster={displayReels[1].poster}
                className="w-full h-full"
              />
              <div className="absolute bottom-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-pill bg-black/60 backdrop-blur border border-white/10">
                {displayReels[1].tag}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
              animate={{ opacity: 1, scale: 1, rotate: -2 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="absolute bottom-0 left-[18%] w-[55%] h-[55%] rounded-card overflow-hidden gradient-border shadow-2xl shadow-accent1/30 animate-float"
              style={{ animationDelay: '3s' }}
            >
              <LoopingVideo
                src={displayReels[2].src}
                poster={displayReels[2].poster}
                className="w-full h-full"
              />
              <div className="absolute bottom-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-pill bg-black/60 backdrop-blur border border-white/10">
                {displayReels[2].tag}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="relative mt-16 max-w-7xl mx-auto px-6 lg:px-10">
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/30 mb-6">
          Trusted by creators at
        </p>
        <div className="flex flex-wrap items-center gap-x-12 gap-y-4 text-white/50 text-lg font-semibold">
          <span>NORDIC&nbsp;LABS</span>
          <span>·</span>
          <span>HALO</span>
          <span>·</span>
          <span>EVERPRESS</span>
          <span>·</span>
          <span>OFF/SCRIPT</span>
          <span>·</span>
          <span>RUNWAY&nbsp;CO</span>
          <span>·</span>
          <span>FIGMENT</span>
        </div>
      </div>
    </section>
  );
}
