'use client';
import Link from 'next/link';
import { Coins, X } from 'lucide-react';

/**
 * Modal shown when the studio's "Generate" call fails with HTTP 402
 * (insufficient_credits). Tells the user exactly what they need and
 * routes them to /pricing with a `?next` query so they bounce back to
 * the studio after purchase.
 */
export function InsufficientCreditsModal({
  open,
  required,
  balance,
  onClose,
}: {
  open: boolean;
  required: number;
  balance: number;
  onClose: () => void;
}) {
  if (!open) return null;
  const shortfall = Math.max(0, required - balance);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-card bg-bg border border-white/10 p-7 relative"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mb-4">
          <Coins className="w-5 h-5 text-amber-300" />
        </div>

        <h2 className="font-display font-bold text-2xl tracking-tight mb-2">
          You&apos;re out of credits.
        </h2>
        <p className="text-sm text-white/65 leading-relaxed mb-5">
          This video needs <b className="text-white">{required} credits</b> and your balance is{' '}
          <b className="text-white">{balance}</b>. Top up to keep going — credits never expire and the
          smallest pack starts at ₹500.
        </p>

        {shortfall > 0 && (
          <div className="rounded-btn bg-white/5 border border-white/10 px-4 py-3 mb-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Shortfall</div>
            <div className="font-display font-bold text-xl tabular-nums">
              {shortfall} credits
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Link
            href={`/pricing?next=${encodeURIComponent('/studio')}`}
            className="flex-1 h-11 rounded-pill bg-white text-black font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-white/90 transition"
          >
            Buy credits
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-5 rounded-pill border border-white/15 text-white/70 text-sm font-semibold hover:text-white hover:bg-white/5 transition"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
