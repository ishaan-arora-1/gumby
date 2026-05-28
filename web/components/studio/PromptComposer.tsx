'use client';
import { useState } from 'react';
import { Sparkles, ArrowUp } from 'lucide-react';

interface Props {
  onSubmit: (
    prompt: string,
    opts: { aspectRatio: '9:16' | '1:1' | '16:9'; durationSeconds: 5 | 10 }
  ) => void;
  loading?: boolean;
}

const SUGGESTIONS = [
  '20-year-old skincare creator unboxing serum in her kitchen, daylight',
  'Hype-y fitness creator in a gym holding a protein shake, neon lights',
  'Cozy lifestyle creator on a couch sipping artisan coffee, golden hour',
  'Tech creator at a clean desk holding a sleek gadget, soft studio light',
];

export function PromptComposer({ onSubmit, loading }: Props) {
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [dur, setDur] = useState<5 | 10>(10);

  const submit = () => {
    if (prompt.trim().length < 10) return;
    onSubmit(prompt.trim(), { aspectRatio: aspect, durationSeconds: dur });
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      {/* Gemini-style radial blue glow centered on the composer.
          NOTE: do NOT use a negative z-index here — the AppShell wraps the
          page in an opaque <div class="bg-canvas">, and a negative z-index
          on a descendant escapes into the parent stacking context and gets
          painted behind that background, hiding the glow. The gradient is
          first in source order so the composer naturally paints on top. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[200%] w-[220%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            'radial-gradient(ellipse 50% 50% at center, rgba(59, 130, 246, 0.65) 0%, rgba(37, 99, 235, 0.40) 22%, rgba(30, 58, 138, 0.22) 45%, rgba(15, 23, 42, 0.08) 65%, rgba(0, 0, 0, 0) 80%)',
          filter: 'blur(80px)',
        }}
      />
      <div className="relative rounded-card bg-composer border border-white/[0.08] p-2 shadow-2xl shadow-black/40">
        <div className="bg-composerInner rounded-[14px] p-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Describe the video you want — the creator, the product, the vibe."
            rows={3}
            className="w-full bg-transparent text-[15px] placeholder:text-placeholder resize-none focus:outline-none leading-relaxed"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-1 border-t border-white/5">
            <div className="flex items-center gap-2">
              <div className="flex bg-elevated rounded-pill p-0.5 text-xs">
                {(['9:16', '1:1', '16:9'] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAspect(a)}
                    className={`px-3 h-7 rounded-pill font-semibold transition ${
                      aspect === a
                        ? 'bg-white text-black'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <div className="flex bg-elevated rounded-pill p-0.5 text-xs">
                {([5, 10] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDur(d)}
                    className={`px-3 h-7 rounded-pill font-semibold transition ${
                      dur === d ? 'bg-white text-black' : 'text-white/60'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={submit}
              disabled={loading || prompt.trim().length < 10}
              aria-label="Send"
              className="h-10 w-10 rounded-full bg-white/10 border border-white/15 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/15 active:scale-95 transition"
            >
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 justify-center">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setPrompt(s)}
            className="text-xs px-3 py-1.5 rounded-pill border border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:border-white/25 transition"
          >
            <Sparkles className="w-3 h-3 inline mr-1.5 text-accent2" />
            {s.length > 60 ? s.slice(0, 60) + '…' : s}
          </button>
        ))}
      </div>
    </div>
  );
}
