'use client';
import { useEffect, useState } from 'react';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import type { UGCTemplate } from '@/lib/types';
import { X, Sparkles } from 'lucide-react';

interface Props {
  template: UGCTemplate;
  onUse: (t: UGCTemplate) => void;
  selected?: boolean;
}

export function TemplateCard({ template, onUse, selected }: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);

  // Tapping a card opens the in-page preview modal. The "Use as template"
  // button inside the modal is the one that actually fires onUse — this
  // way users can watch the clip large before committing to the funnel.
  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className={`group relative text-left aspect-[9/16] rounded-card overflow-hidden border transition-all ${
          selected
            ? 'border-accent2 ring-2 ring-accent2/40'
            : 'border-white/[0.08] hover:border-white/25'
        }`}
      >
        {template.video_url ? (
          <LoopingVideo
            src={template.video_url}
            poster={template.thumbnail_url}
            className="absolute inset-0"
          />
        ) : (
          <div className="absolute inset-0 bg-elevated" />
        )}
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black via-black/70 to-transparent">
          <div className="font-bold text-sm truncate">
            {template.actor_name || template.name}
          </div>
          {template.description && (
            <div className="text-[11px] text-white/55 truncate">
              {template.description}
            </div>
          )}
        </div>
        <div className="absolute top-2 right-2 px-2.5 py-1 rounded-pill bg-black/70 backdrop-blur border border-white/10 text-[10px] font-semibold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition">
          Preview
        </div>
      </button>

      {previewOpen && (
        <TemplatePreviewModal
          template={template}
          onClose={() => setPreviewOpen(false)}
          onUse={() => {
            setPreviewOpen(false);
            onUse(template);
          }}
        />
      )}
    </>
  );
}

function TemplatePreviewModal({
  template,
  onClose,
  onUse,
}: {
  template: UGCTemplate;
  onClose: () => void;
  onUse: () => void;
}) {
  // Esc to dismiss. Also lock body scroll while the modal is open so the
  // background grid doesn't jiggle when the user scrolls inside the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${template.actor_name || template.name} preview`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-8 animate-[fadeIn_0.18s_ease-out]"
      style={{
        // Inline keyframes so we don't have to touch globals.css for one effect.
        // (Tailwind doesn't ship a fadeIn by default.)
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn  { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
      `}</style>

      {/* Close button — outside the video frame, anchored to viewport */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center transition"
      >
        <X className="w-5 h-5" />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative animate-[popIn_0.22s_ease-out]"
      >
        <div className="aspect-[9/16] w-[min(90vw,420px)] max-h-[70vh] sm:max-h-[88vh] rounded-card overflow-hidden bg-black border border-white/10 shadow-2xl shadow-black/60">
          {template.video_url ? (
            <LoopingVideo
              src={template.video_url}
              poster={template.thumbnail_url}
              className="w-full h-full"
              controls={false}
              autoplay
            />
          ) : (
            <div className="w-full h-full bg-elevated" />
          )}

          {/* Soft bottom shade so the floating button always reads */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

          {/* Floating "Use as template" button — bottom-center over the video */}
          <button
            type="button"
            onClick={onUse}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-pill bg-white text-black text-sm font-semibold hover:bg-white/90 active:scale-[0.98] transition shadow-xl shadow-black/40"
          >
            <Sparkles className="w-4 h-4" />
            Use as template
          </button>
        </div>

        {/* Small caption under the video */}
        <div className="mt-4 text-center">
          <div className="text-white font-semibold text-sm">
            {template.actor_name || template.name}
          </div>
          {template.description && (
            <div className="text-white/55 text-xs mt-0.5 max-w-[420px]">
              {template.description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
