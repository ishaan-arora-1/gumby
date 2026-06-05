import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Support — Blinkugc',
  description:
    'Get help with Blinkugc: contact support, account and sign-in, credits and purchases, refunds, and account deletion.',
};

export default function SupportPage() {
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
          Support
        </h1>
        <p className="mt-3 text-sm text-white/50">
          We&rsquo;re here to help you create.
        </p>

        <div className="prose-blinkugc mt-12 space-y-10 text-white/80 leading-relaxed">
          <p>
            Need a hand with Blinkugc? The fastest way to reach us is by email.
            We read every message and typically reply within 1&ndash;2 business
            days.
          </p>
          <p>
            Email us at{' '}
            <a
              href="mailto:support@blinkugc.com"
              className="text-white underline"
            >
              support@blinkugc.com
            </a>
            . To help us resolve your issue quickly, include the email address
            on your account and a short description of what happened (a
            screenshot helps too).
          </p>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              Getting started
            </h2>
            <p className="mt-4">
              Blinkugc turns your product into a creator-style video ad in a few
              steps: choose an AI creator, add your product details, pick a
              voice and script, and generate. Your finished videos are saved to
              your history so you can revisit or reuse them anytime.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              Account &amp; sign-in
            </h2>
            <p className="mt-4">
              You can sign in with Apple or Google. If you&rsquo;re having
              trouble signing in, make sure you&rsquo;re using the same method
              you originally signed up with, then email us if the problem
              continues.
            </p>
            <p className="mt-4">
              To delete your account, open the app, tap your profile avatar in
              the sidebar, and select <strong>Delete account</strong>. This
              permanently removes your videos, drafts, and history.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              Credits &amp; purchases
            </h2>
            <p className="mt-4">
              Generating videos uses credits. In the iOS app, credits are
              purchased through Apple In-App Purchase and are charged to your
              Apple Account. Your balance and purchase history live on your
              device.
            </p>
            <p className="mt-4">
              If you reinstall the app or set up a new device, open the credits
              screen and tap <strong>Restore Purchases</strong> to recover any
              purchase that didn&rsquo;t finish delivering.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">Refunds</h2>
            <p className="mt-4">
              Purchases made in the iOS app are processed by Apple. To request a
              refund for an In-App Purchase, visit{' '}
              <a
                href="https://reportaproblem.apple.com"
                className="text-white underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                reportaproblem.apple.com
              </a>{' '}
              and sign in with your Apple Account. For purchases made on our
              website, see our{' '}
              <Link href="/refund" className="text-white underline">
                Refund Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              Still need help?
            </h2>
            <p className="mt-4">
              Email{' '}
              <a
                href="mailto:support@blinkugc.com"
                className="text-white underline"
              >
                support@blinkugc.com
              </a>{' '}
              and we&rsquo;ll get back to you as soon as we can.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 text-sm text-white/40 flex gap-6">
          <Link href="/" className="hover:text-white transition">
            Home
          </Link>
          <Link href="/privacy" className="hover:text-white transition">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-white transition">
            Terms of Service
          </Link>
        </div>
      </article>
    </main>
  );
}
