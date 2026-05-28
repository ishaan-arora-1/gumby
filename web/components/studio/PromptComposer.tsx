'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Sparkles, Send } from 'lucide-react';

interface Props {
  onSubmit: (prompt: string, opts: { aspectRatio: '9:16' | '1:1' | '16:9'; durationSeconds: 5 | 10 }) => void;
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
  const [dur, setDur] = useState<5 | 10>(5);

  const submit = () => {
    if (prompt.trim().length < 6) return;
    onSubmit(prompt.trim(), { aspectRatio: aspect, durationSeconds: dur });
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-card bg-composer border border-white/[0.08] p-2 shadow-2xl shadow-black/40">
        <div className="bg-composerInner rounded-[14px] p-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your creator. Who are they, where are they, what's the vibe?"
            rows={3}
            className="w-full bg-transparent text-[15px] placeholder:text-placeholder resize-none focus:outline-none leading-relaxed"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-1 border-t border-white/5">
            <div className="flex items-center gap-2">
              {/* Aspect */}
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
              {/* Duration */}
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
              disabled={loading || prompt.trim().length < 6}
              className="h-10 w-10 rounded-full bg-brand-gradient flex items-center justify-center shadow-lg shadow-accent2/30 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition"
            >
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-white" />
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
