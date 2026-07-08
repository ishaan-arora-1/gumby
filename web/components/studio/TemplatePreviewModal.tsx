'use client';
import { useEffect, useState } from 'react';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import type { TemplateTarget } from '@/lib/templateTarget';
import { X, Sparkles, Volume2, VolumeX, User, Box } from 'lucide-react';

interface Props {
  target: TemplateTarget;
  onClose: () => void;
  onUse: () => void;
}

/**
 * Unified template preview — one flow for every card (blueprint or
 * featured creator). Plays the looping example clip (muted by default so
 * autoplay is allowed; a speaker button unmutes on a user gesture), and
 * "Use as template" hands off to the input modal.
 */
export function TemplatePreviewModal({ target, onClose, onUse }: Props) {
  // Audio ON by default — the user opened this to see and hear the template.
  // If the browser blocks unmuted autoplay, LoopingVideo falls back to muted
  // and calls onAutoMuted so the speaker icon stays truthful.
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const hasVideo = !!target.videoUrl;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${target.name} preview`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-8 animate-[fadeIn_0.18s_ease-out]"
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn  { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
      `}</style>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition"
      >
        <X className="w-5 h-5" />
      </button>

      <div onClick={(e) => e.stopPropagation()} className="relative animate-[popIn_0.22s_ease-out]">
        <div className="relative aspect-[9/16] w-[min(90vw,420px)] max-h-[70vh] sm:max-h-[88vh] rounded-card overflow-hidden bg-black border border-white/10 shadow-2xl shadow-black/60">
          {hasVideo ? (
            <LoopingVideo
              src={target.videoUrl!}
              poster={target.posterUrl || undefined}
              className="w-full h-full"
              muted={muted}
              autoplay
              onAutoMuted={() => setMuted(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-center px-6 bg-elevated">
              {target.kind === 'creator' ? (
                <User className="w-8 h-8 text-white/30" />
              ) : (
                <Box className="w-8 h-8 text-white/30" />
              )}
              <div className="text-sm text-white/50">Preview coming soon</div>
            </div>
          )}

          {/* Speaker toggle — only meaningful when there's a video */}
          {hasVideo && (
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="absolute top-3 left-3 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 border border-white/15 text-white flex items-center justify-center transition"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

          <button
            type="button"
            onClick={onUse}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-pill bg-white text-black text-sm font-semibold hover:bg-white/90 active:scale-[0.98] transition shadow-xl shadow-black/40"
          >
            <Sparkles className="w-4 h-4" />
            Use as template
          </button>
        </div>

        <div className="mt-4 text-center">
          <div className="text-white font-semibold text-sm">{target.name}</div>
        </div>
      </div>
    </div>
  );
}
