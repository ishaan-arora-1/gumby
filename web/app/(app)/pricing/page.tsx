'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Sparkles, Mail } from 'lucide-react';
import { api, STATIC_PACK_FALLBACK, type CreditPack } from '@/lib/api';
import { buyPack, formatMoney } from '@/lib/razorpay';
import { isLikelyIndia } from '@/components/pricing/CurrencyToggle';
import { cn } from '@/lib/utils';

/**
 * In-app pricing page.
 *
 * Geo-gated for v1 launch:
 *   - India  → INR Razorpay checkout, full flow
 *   - rest   → "International payments coming next week" early-access
 *              card with a mailto: support link
 *
 * When PayPal-via-Razorpay verification clears we'll flip the gate off
 * and the USD/PayPal path lights up automatically — all that infrastructure
 * (USD packs, checkout endpoint, webhook handler) is already wired in.
 */
const SUPPORT_EMAIL = 'support@blinkugc.com';

export default function InAppPricingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/studio';

  // `null` while SSR / before the locale check runs. We render a skeleton
  // until we know which UI to show — flashing the wrong one for a frame
  // would feel broken.
  const [isIndia, setIsIndia] = useState<boolean | null>(null);
  const [packs, setPacks] = useState<CreditPack[]>(STATIC_PACK_FALLBACK);
  const [balance, setBalance] = useState<number | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    setIsIndia(isLikelyIndia());
  }, []);

  useEffect(() => {
    api.listCreditPacks().then((r) => setPacks(r.data)).catch(() => {});
    refreshBalance();
  }, []);

  const refreshBalance = () =>
    api.getCreditBalance().then((r) => setBalance(r.data.balance)).catch(() => {});

  const onBuy = async (packId: string) => {
    setBuyingId(packId);
    setMsg(null);
    const result = await buyPack(packId, 'INR');
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
  if (isIndia === null) {
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

  // ---------- International early-access view ----------
  if (!isIndia) {
    return <InternationalEarlyAccessView />;
  }

  // ---------- India: full Razorpay INR checkout ----------
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
        <div className="text-right">
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
          const perCredit = p.price_paise / 100 / p.credits;
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
                  {formatMoney(p.price_paise, 'INR')}
                </div>
              </div>
              <div className="text-[12px] text-white/45 mb-5">
                {p.credits.toLocaleString()} credits · ₹{perCredit.toFixed(2)}/credit
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
                disabled={!!buyingId}
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
        Payments processed by Razorpay in INR. UPI, cards, netbanking, wallets.
        One-time charge — no subscription.
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

// ---------- International early-access view ----------

function InternationalEarlyAccessView() {
  const subject = encodeURIComponent('Early access — international credits');
  const body = encodeURIComponent(
    "Hey Blink UGC team,\n\nI'd love to buy credits but I'm outside India. " +
    "Can you set me up with early access?\n\nThanks!"
  );
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

  return (
    <div className="px-6 lg:px-10 pt-20 pb-24 max-w-2xl mx-auto">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#ff2e3f]/15 mb-6">
          <Mail className="w-6 h-6 text-[#ff2e3f]" />
        </div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-white/45 mb-3">
          International payments
        </div>
        <h1 className="font-display font-bold text-3xl lg:text-4xl tracking-[-0.03em] mb-4">
          Coming next week.
        </h1>
        <p className="text-[15px] text-white/65 leading-relaxed max-w-md mx-auto mb-8">
          USD checkout is in final verification with our processor. For special early
          access, drop us a line and we&apos;ll get you set up directly.
        </p>

        <a
          href={mailto}
          className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-pill bg-white text-black font-semibold text-[15px] hover:bg-white/90 transition"
        >
          <Mail className="w-4 h-4" />
          Email {SUPPORT_EMAIL}
        </a>

        <div className="mt-12 rounded-card border border-white/[0.08] bg-elevated/20 p-6 text-left">
          <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-3">
            What&apos;s coming
          </div>
          <ul className="space-y-2.5 text-[14px] text-white/75">
            <Feature>USD checkout via PayPal and international cards</Feature>
            <Feature>Same four pack tiers, USD-priced</Feature>
            <Feature>One-time charge — no subscription</Feature>
            <Feature>Credits land instantly, never expire</Feature>
          </ul>
        </div>
      </div>
    </div>
  );
}
