'use client';
import { api, type CheckoutOrder } from './api';

/**
 * Razorpay Checkout helpers.
 *
 * Flow:
 *   1. Client calls `api.createCheckout(packId)` → backend creates a
 *      Razorpay Order and returns its id + the public KEY_ID.
 *   2. We dynamically inject the Razorpay Checkout JS snippet (once per
 *      session) and call `new window.Razorpay({...}).open()`.
 *   3. User pays inside Razorpay's hosted iframe; Razorpay PostMessages
 *      success back to us AND fires a server-to-server webhook to our
 *      backend. The webhook is what credits the user — the client
 *      `handler` is purely for UX.
 *
 * We deliberately do NOT credit on client confirmation — that would be
 * trivially spoofable.
 */
declare global {
  interface Window {
    Razorpay?: new (opts: any) => { open: () => void; on: (e: string, cb: any) => void };
  }
}

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function ensureScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.Razorpay) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Razorpay script failed')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Razorpay script failed'));
    document.body.appendChild(s);
  });
}

export interface BuyResult {
  status: 'paid' | 'dismissed' | 'failed';
  paymentId?: string;
  orderId?: string;
  error?: string;
}

/**
 * One-shot helper used by the /pricing buttons.
 *   buyPack('creator', 'INR') → opens Razorpay → resolves with the user's
 *                               outcome. The actual credit grant happens
 *                               in the webhook regardless of what the
 *                               client says, so the `paid` resolution is
 *                               just a UX cue ("go to your studio, credits
 *                               should land in a few seconds").
 *
 * Currency selects which payment menu Razorpay shows:
 *   - 'INR' → UPI, Indian cards, netbanking, wallets
 *   - 'USD' → International cards + PayPal (if enabled on the Razorpay
 *             account). Razorpay's PayPal integration is USD-only.
 */
export async function buyPack(
  packId: string,
  currency: 'INR' | 'USD' = 'INR'
): Promise<BuyResult> {
  let order: CheckoutOrder;
  try {
    const res = await api.createCheckout(packId, currency);
    order = res.data;
  } catch (err: any) {
    return { status: 'failed', error: err?.message || 'Could not start checkout' };
  }

  try {
    await ensureScript();
  } catch (err: any) {
    return { status: 'failed', error: err?.message || 'Razorpay failed to load' };
  }

  return new Promise<BuyResult>((resolve) => {
    if (!window.Razorpay) {
      resolve({ status: 'failed', error: 'Razorpay unavailable' });
      return;
    }

    const rzp = new window.Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: 'Create UGC',
      description: `${order.pack.label} — ${order.pack.credits.toLocaleString()} credits`,
      prefill: {
        name: order.user.name || '',
        email: order.user.email || '',
      },
      notes: {
        pack_id: order.pack.id,
        user_id: order.user.id,
      },
      theme: { color: '#ff2e3f' },
      handler: (resp: any) => {
        resolve({
          status: 'paid',
          paymentId: resp?.razorpay_payment_id,
          orderId: resp?.razorpay_order_id,
        });
      },
      modal: {
        ondismiss: () => resolve({ status: 'dismissed' }),
      },
    });

    rzp.on('payment.failed', (resp: any) => {
      resolve({
        status: 'failed',
        error: resp?.error?.description || 'Payment failed',
      });
    });

    rzp.open();
  });
}

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatUSD(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Money formatter for either currency. Uses the appropriate locale so
 * the thousands separators look native (₹13,500 vs $13,500 work fine
 * but ₹1,80,000 vs $180,000 differ).
 */
export function formatMoney(minorUnits: number | null | undefined, currency: 'INR' | 'USD'): string {
  if (minorUnits == null) return '—';
  return currency === 'USD' ? formatUSD(minorUnits) : formatINR(minorUnits);
}
