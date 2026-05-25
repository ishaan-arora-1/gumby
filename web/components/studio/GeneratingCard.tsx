'use client';
import { useEffect, useState } from 'react';

const TIPS = [
  'Casting your creator…',
  'Lighting the scene…',
  'Dialling in their expression…',
  'Coloring the frame…',
  'Polishing the cut…',
  'Almost there…',
];

interface Props {
  serverProgress?: number;
  estimatedSeconds?: number;
  label?: string;
}

export function GeneratingCard({
  serverProgress,
  estimatedSeconds = 60,
  label = 'Generating',
}: Props) {
  const [tip, setTip] = useState(0);
  const [t, setT] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setT((x) => x + 1), 1000);
    const j = setInterval(() => setTip((x) => (x + 1) % TIPS.length), 3500);
    return () => {
      clearInterval(i);
      clearInterval(j);
    };
  }, []);

  // asymptotic curve (approaches 95)
  const synth = Math.min(95, 100 * (1 - Math.exp(-t / (estimatedSeconds * 0.5))));
  const progress = Math.max(synth, serverProgress ?? 0);

  return (
    <div className="relative aspect-[9/16] max-w-xs mx-auto rounded-card overflow-hidden bg-studio border border-white/[0.08]">
      <div className="absolute inset-0 bg-brand-gradient-radial opacity-20 animate-glow" />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
        <div className="w-12 h-12 rounded-full bg-brand-gradient flex items-center justify-center mb-6 animate-pulse">
          <div className="w-4 h-4 rounded-full bg-white" />
        </div>
        <div className="font-bold text-lg mb-1">{label}</div>
        <div className="text-sm text-white/55 mb-6 min-h-[20px]">
          {TIPS[tip]}
        </div>
        <div className="w-full h-1.5 rounded-pill bg-white/10 overflow-hidden">
          <div
            className="h-full bg-brand-gradient transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 text-xs text-white/40 tabular-nums">
          {Math.round(progress)}%
        </div>
      </div>
    </div>
  );
}
