'use client';
import { useState } from 'react';
import { Sparkles, ArrowUp } from 'lucide-react';

interface Props {
  onSubmit: (prompt: string) => void;
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

  const submit = () => {
    if (prompt.trim().length < 10) return;
    onSubmit(prompt.trim());
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="rounded-card bg-composer border border-white/[0.08] p-2 shadow-2xl shadow-black/40">
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
          <div className="flex items-center justify-end pt-3 mt-1 border-t border-white/5">
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
