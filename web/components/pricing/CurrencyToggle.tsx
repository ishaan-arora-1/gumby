'use client';
import { cn } from '@/lib/utils';

export type Currency = 'INR' | 'USD';

/**
 * Two-pill currency switcher used on both /pricing (in-app) and the
 * landing page's pricing section. We render BOTH options when packs
 * support both — there's no point showing the toggle if the user has
 * no choice.
 *
 * The "USD" tile carries a tiny PayPal hint because that's the actual
 * reason a non-Indian visitor would want USD — Razorpay's PayPal
 * method is USD-only, and PayPal is what most non-India buyers will
 * recognize on the checkout sheet.
 */
export function CurrencyToggle({
  value,
  onChange,
}: {
  value: Currency;
  onChange: (c: Currency) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Currency"
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1"
    >
      <Pill active={value === 'INR'} onClick={() => onChange('INR')}>
        <span>🇮🇳</span>
        <span>INR</span>
      </Pill>
      <Pill active={value === 'USD'} onClick={() => onChange('USD')}>
        <span>🌐</span>
        <span>USD</span>
        <span className="ml-1 text-[9px] uppercase tracking-[0.18em] opacity-70">
          PayPal
        </span>
      </Pill>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition',
        active
          ? 'bg-white text-[#080808] shadow-[0_4px_14px_rgba(0,0,0,0.35)]'
          : 'text-white/70 hover:text-white hover:bg-white/[0.04]'
      )}
    >
      {children}
    </button>
  );
}

/**
 * Picks the sensible default currency for the visitor based on browser
 * locale. Indian visitors get INR; everyone else gets USD. The toggle
 * still lets either side switch.
 */
export function defaultCurrencyForLocale(): Currency {
  return isLikelyIndia() ? 'INR' : 'USD';
}

/**
 * Best-effort detection for whether a visitor is in India. Looks at
 * `navigator.language(s)` and the Intl timezone. Not foolproof (VPNs,
 * browsers set to en-US on Indian devices) but accurate enough to
 * route the right pricing UI to the right user. Returns null on SSR.
 *
 * This is the single source of truth for the geo-gate that drives:
 *   - /pricing showing INR Razorpay checkout vs the "international
 *     payments coming next week" early-access card
 *   - The landing PricingSection banner
 */
export function isLikelyIndia(): boolean | null {
  if (typeof navigator === 'undefined') return null;
  const langs = [
    navigator.language || '',
    ...(navigator.languages || []),
  ].map((s) => s.toLowerCase());
  if (langs.some((l) => l.includes('-in') || l === 'hi' || l === 'ta' || l === 'te')) {
    return true;
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return true;
  } catch {}
  return false;
}
