import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy — Blinkugc',
  description:
    'Our policy on refunds and cancellations for credit purchases on Blinkugc.',
};

export default function RefundPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16 md:py-24">
      <article className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="text-sm text-white/60 hover:text-white transition"
        >
          ← Back to Blinkugc
        </Link>

        <h1 className="mt-8 text-4xl md:text-5xl font-semibold tracking-tight">
          Refund &amp; Cancellation Policy
        </h1>
        <p className="mt-3 text-sm text-white/50">Last updated: 2 June 2026</p>

        <div className="mt-12 space-y-10 text-white/80 leading-relaxed">
          <p>
            This Refund &amp; Cancellation Policy explains how payments work on
            the Blinkugc website, app, and related services (the
            &ldquo;Service&rdquo;). By making a purchase you agree to this
            policy.
          </p>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              1. No Refunds
            </h2>
            <p className="mt-4">
              All payments made on Blinkugc are final. We do not offer refunds
              for any purchase, in whole or in part. Once a payment is
              completed, it is non-refundable.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              2. No Cancellations
            </h2>
            <p className="mt-4">
              Purchases cannot be cancelled once a payment has been made. Credits
              are added to your account immediately after a successful payment,
              and that transaction cannot be reversed.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              3. Digital Credits
            </h2>
            <p className="mt-4">
              Blinkugc sells credits, a digital good that is delivered instantly
              and consumed when you generate content. Because credits are
              digital and used up on generation, they are non-returnable and
              non-refundable.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              4. Your Statutory Rights
            </h2>
            <p className="mt-4">
              Nothing in this policy limits any rights you may have under
              applicable law that cannot be waived. Where the law requires us to
              provide a remedy, we will comply with that requirement.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">5. Contact</h2>
            <p className="mt-4">
              Questions about this policy or a specific charge? Email{' '}
              <a
                href="mailto:support@blinkugc.com"
                className="text-white underline"
              >
                support@blinkugc.com
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 text-sm text-white/40 flex gap-6">
          <Link href="/" className="hover:text-white transition">
            Home
          </Link>
          <Link href="/terms" className="hover:text-white transition">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-white transition">
            Privacy Policy
          </Link>
        </div>
      </article>
    </main>
  );
}
