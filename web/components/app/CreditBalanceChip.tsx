'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { Coins, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Compact credit balance pill rendered in the sidebar footer. Refreshes
 * on every route change and on the custom `blinkugc:credits-changed`
 * window event (dispatched by /studio after a job kicks off and by
 * /pricing after a purchase).
 *
 * Collapsed sidebar shrinks to a coin icon with the number; full sidebar
 * shows label + a "+" button that goes to /pricing.
 */
export function CreditBalanceChip({ collapsed }: { collapsed: boolean }) {
  const [balance, setBalance] = useState<number | null>(null);
  const path = usePathname();

  const refresh = () =>
    api.getCreditBalance().then((r) => setBalance(r.data.balance)).catch(() => {});

  useEffect(() => { refresh(); }, [path]);
  useEffect(() => {
    const onCh = () => refresh();
    window.addEventListener('blinkugc:credits-changed', onCh);
    return () => window.removeEventListener('blinkugc:credits-changed', onCh);
  }, []);

  if (collapsed) {
    return (
      <Link
        href="/pricing"
        title={balance == null ? 'Credits' : `${balance} credits — top up`}
        className="flex items-center justify-center px-2 py-2.5 rounded-btn text-white/70 hover:text-white hover:bg-white/5 transition"
      >
        <Coins className="w-4 h-4" />
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-btn bg-white/[0.04] border border-white/10">
      <Coins className="w-3.5 h-3.5 text-amber-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 leading-none">
          Credits
        </div>
        <div
          className={cn(
            'text-[14px] font-semibold tabular-nums leading-tight',
            balance != null && balance < 50 ? 'text-amber-300' : 'text-white'
          )}
        >
          {balance == null ? '—' : balance.toLocaleString()}
        </div>
      </div>
      <Link
        href="/pricing"
        title="Buy credits"
        aria-label="Buy credits"
        className="w-6 h-6 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 transition shrink-0"
      >
        <Plus className="w-3 h-3" />
      </Link>
    </div>
  );
}
