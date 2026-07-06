'use client';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import type { Blueprint } from '@/lib/types';
import { User, Box, Clapperboard } from 'lucide-react';

interface Props {
  blueprint: Blueprint;
  onUse: (b: Blueprint) => void;
}

const creditsFor = (seconds: number) =>
  seconds >= 13 ? 150 : seconds >= 8 ? 100 : 50;

/**
 * Gallery card for a blueprint template. Once preview videos are rendered
 * (scripts/generate-blueprint-previews.js) the card autoplays the example
 * clip; until then it shows a designed gradient cover so the gallery still
 * looks intentional, not broken.
 */
export function BlueprintCard({ blueprint, onUse }: Props) {
  const [c1, c2] = blueprint.accent;
  return (
    <button
      type="button"
      onClick={() => onUse(blueprint)}
      className="group relative text-left aspect-[9/16] rounded-card overflow-hidden border border-white/[0.08] hover:border-white/30 transition-all"
    >
      {blueprint.preview_video_url ? (
        <LoopingVideo
          src={blueprint.preview_video_url}
          poster={blueprint.preview_poster_url || undefined}
          className="absolute inset-0"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 90% at 20% 0%, ${c1}55 0%, transparent 60%), radial-gradient(120% 100% at 90% 100%, ${c2}66 0%, transparent 65%), #0b0b0e`,
          }}
        >
          <Clapperboard
            className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-10 h-10 opacity-25 group-hover:opacity-50 transition"
            style={{ color: c1 }}
          />
        </div>
      )}

      {/* Format badge */}
      <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-pill bg-black/60 backdrop-blur border border-white/10 text-[10px] font-semibold uppercase tracking-wider text-white/80">
        {blueprint.has_creator ? (
          <User className="w-3 h-3" />
        ) : (
          <Box className="w-3 h-3" />
        )}
        {blueprint.has_creator ? 'Creator' : 'Product shot'}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black via-black/75 to-transparent">
        <div className="font-bold text-sm truncate">{blueprint.name}</div>
        <div className="text-[11px] text-white/55 line-clamp-2 leading-snug mt-0.5">
          {blueprint.tagline}
        </div>
        <div className="mt-1.5 text-[10px] font-semibold text-white/45 uppercase tracking-wider">
          {blueprint.duration_seconds}s · {creditsFor(blueprint.duration_seconds)} credits
        </div>
      </div>

      <div className="absolute top-2 right-2 px-2.5 py-1 rounded-pill bg-white text-black text-[10px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition">
        Use
      </div>
    </button>
  );
}
