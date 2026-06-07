'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Sparkles } from 'lucide-react';
import { api, STATIC_PACK_FALLBACK, type CreditPack } from '@/lib/api';
import { buyPack, formatMoney } from '@/lib/razorpay';
import {
  CurrencyToggle,
  defaultCurrencyForLocale,
  type Currency,
} from '@/components/pricing/CurrencyToggle';
import { cn } from '@/lib/utils';

/**
 * In-app pricing page. Anyone can buy:
 *   - Indian visitors default to INR (UPI / cards / netbanking / wallets)
 *   - everyone else defaults to USD (PayPal + international cards via
 *     Razorpay)
 * The currency toggle lets either side switch. The USD path rides the same
 * Razorpay order → checkout → webhook pipeline as INR.
 */
export default function InAppPricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/studio';

  // `null` during SSR / before the locale check runs — render a skeleton
  // until we know which currency to default to so we don't flash the wrong
  // prices for a frame.
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [packs, setPacks] = useState<CreditPack[]>(STATIC_PACK_FALLBACK);
  const [balance, setBalance] = useState<number | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    setCurrency(defaultCurrencyForLocale());
  }, []);

  useEffect(() => {
    api.listCreditPacks().then((r) => setPacks(r.data)).catch(() => {});
    refreshBalance();
  }, []);

  const refreshBalance = () =>
    api.getCreditBalance().then((r) => setBalance(r.data.balance)).catch(() => {});

  const onBuy = async (packId: string) => {
    if (!currency) return;
    setBuyingId(packId);
    setMsg(null);
    const result = await buyPack(packId, currency);
    if (result.status === 'paid') {
      setMsg({
        kind: 'success',
        text: 'Payment received — your credits should appear in a few seconds.',
      });
      const start = Date.now();
      const prev = balance ?? 0;
      const poll = async () => {
        if (Date.now() - start > 12000) {
          router.push(next);
          return;
        }
        try {
          const r = await api.getCreditBalance();
          if (r.data.balance > prev) {
            setBalance(r.data.balance);
            setTimeout(() => router.push(next), 800);
            return;
          }
        } catch {}
        setTimeout(poll, 1500);
      };
      poll();
    } else if (result.status === 'dismissed') {
      setMsg({ kind: 'info', text: 'Checkout cancelled.' });
    } else {
      setMsg({ kind: 'error', text: result.error || 'Payment failed. Please try again.' });
    }
    setBuyingId(null);
  };

  // ---------- Loading skeleton ----------
  if (currency === null) {
    return (
      <div className="px-6 lg:px-10 pt-16 pb-24 max-w-6xl mx-auto">
        <div className="h-8 w-40 rounded bg-elevated/40 animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-72 rounded-card bg-elevated/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // ---------- Checkout (INR or USD) ----------
  return (
    <div className="px-6 lg:px-10 pt-12 pb-24 max-w-6xl mx-auto">
      <div className="mb-10 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-2">
            Buy credits
          </div>
          <h1 className="font-display font-bold text-3xl lg:text-4xl tracking-[-0.03em]">
            Top up your studio.
          </h1>
          <p className="text-sm text-white/55 mt-2 max-w-xl">
            5-second video = 50 credits. 10-second video = 100 credits.
            Bigger packs land at a per-credit discount. Credits never expire.
          </p>
        </div>
        <div className="w-full text-left sm:w-auto sm:text-right">
          <div className="mb-3 flex sm:justify-end">
            <CurrencyToggle value={currency} onChange={setCurrency} />
          </div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">
            Current balance
          </div>
          <div className="font-display font-bold text-3xl tracking-tight tabular-nums">
            {balance === null ? '—' : balance.toLocaleString()}
          </div>
          <div className="text-[11px] text-white/40">credits</div>
        </div>
      </div>

      {msg && (
        <div
          className={cn(
            'mb-6 rounded-card border px-5 py-4 text-sm',
            msg.kind === 'success' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
            msg.kind === 'error' && 'border-red-500/40 bg-red-500/10 text-red-300',
            msg.kind === 'info' && 'border-white/10 bg-white/5 text-white/80'
          )}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {packs.map((p) => {
          // Minor units in the selected currency (paise for INR, cents for
          // USD). A pack with no USD price (`price_cents` null) simply can't
          // be bought in USD — we disable its button in that case.
          const minor = currency === 'USD' ? p.price_cents : p.price_paise;
          const available = minor != null;
          const perCredit = available ? minor! / 100 / p.credits : 0;
          const perCreditLabel = currency === 'USD'
            ? `$${perCredit.toFixed(2)}/credit`
            : `₹${perCredit.toFixed(2)}/credit`;
          const featured = p.id === 'creator';
          const isLoading = buyingId === p.id;
          return (
            <div
              key={p.id}
              className={cn(
                'relative rounded-card border p-6 flex flex-col',
                featured
                  ? 'border-transparent bg-gradient-to-b from-[#ff2e3f]/15 via-white/[0.02] to-white/[0.02] ring-1 ring-[#ff2e3f]/50'
                  : 'border-white/[0.08] bg-elevated/30'
              )}
            >
              {featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-pill bg-[#ff2e3f] text-[10px] font-bold uppercase tracking-widest">
                  Most popular
                </div>
              )}

              <div className="text-sm text-white/60 mb-2">{p.label}</div>
              <div className="flex items-baseline gap-2 mb-1">
                <div className="font-display font-bold text-4xl tracking-tight tabular-nums">
                  {formatMoney(minor, currency)}
                </div>
              </div>
              <div className="text-[12px] text-white/45 mb-5">
                {p.credits.toLocaleString()} credits · {perCreditLabel}
              </div>

              <div className="text-[13px] leading-[1.5] text-white/75 mb-6 min-h-[40px]">
                {p.blurb}
              </div>

              <ul className="text-[13px] space-y-2 mb-6 text-white/75 flex-1">
                <Feature>{Math.floor(p.credits / 50)} × 5-second videos</Feature>
                <Feature>{Math.floor(p.credits / 100)} × 10-second videos</Feature>
                <Feature>Captions included</Feature>
                <Feature>Credits never expire</Feature>
              </ul>

              <button
                type="button"
                onClick={() => onBuy(p.id)}
                disabled={!!buyingId || !available}
                className={cn(
                  'h-11 rounded-pill text-[14px] font-semibold inline-flex items-center justify-center gap-2 transition',
                  featured
                    ? 'bg-[#ff2e3f] text-white hover:bg-[#e11d2b] shadow-[0_10px_30px_rgba(225,29,43,0.35)]'
                    : 'bg-white text-black hover:bg-white/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isLoading ? (
                  <>
                    <div className="w-3 h-3 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                    Opening checkout…
                  </>
                ) : !available ? (
                  <>Not available in USD</>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Buy {p.label}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-[12px] text-white/40 mt-10 max-w-xl mx-auto leading-relaxed">
        {currency === 'USD'
          ? 'Payments processed by Razorpay in USD — PayPal and international cards. One-time charge — no subscription.'
          : 'Payments processed by Razorpay in INR — UPI, cards, netbanking, wallets. One-time charge — no subscription.'}
      </p>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" />
      <span>{children}</span>
    </li>
  );
}
