import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Blinkugc — AI UGC Video Ads',
  description:
    'Blinkugc turns any product into a creator-style UGC video ad in minutes. Pick an AI creator, add your product, and generate a lip-synced ad ready to post.',
};

export default function MarketingPage() {
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
          Create UGC video ads with AI
        </h1>
        <p className="mt-3 text-sm text-white/50">
          No camera. No actors. No editing timeline.
        </p>

        <div className="prose-blinkugc mt-12 space-y-10 text-white/80 leading-relaxed">
          <p>
            Blinkugc turns your product into a high-converting, creator-style
            video ad in minutes. Pick from a library of AI creators &mdash; or
            generate your own &mdash; tell us about your product, choose a
            voice, and Blinkugc produces a lip-synced UGC ad you can post to
            your store and social channels.
          </p>

          <section>
            <h2 className="text-2xl font-semibold text-white">How it works</h2>
            <ul className="mt-4 list-disc pl-6 space-y-2">
              <li>
                <strong className="text-white">Choose a creator.</strong> Browse
                ready-to-use AI actors, or describe and generate a brand-new
                one.
              </li>
              <li>
                <strong className="text-white">Add your product.</strong> A
                name, a short description, and a photo if you have one.
              </li>
              <li>
                <strong className="text-white">Pick a voice and script.</strong>{' '}
                Write your own or let AI draft a natural, on-brand script.
              </li>
              <li>
                <strong className="text-white">Generate.</strong> Blinkugc
                handles the voiceover, lip-sync, and final cut automatically.
              </li>
              <li>
                <strong className="text-white">Download and share.</strong> Save
                your video and post it anywhere.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">Why Blinkugc</h2>
            <ul className="mt-4 list-disc pl-6 space-y-2">
              <li>Authentic UGC look and feel that performs in the feed.</li>
              <li>
                Built for ads &mdash; made for product and brand promotion, not
                generic clips.
              </li>
              <li>Go from idea to finished ad in minutes, not days.</li>
              <li>
                Tweak the creator, script, or product and regenerate instantly.
              </li>
              <li>Clean, auto-styled captions to boost watch time.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              Made for founders, creators, and brands
            </h2>
            <p className="mt-4">
              Whether you&rsquo;re a solo founder validating a product, a
              creator producing ads at scale, or a growing brand that needs
              fresh content every week, Blinkugc gives you an endless roster of
              AI creators ready to sell your product.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">Get started</h2>
            <p className="mt-4">
              Start creating at{' '}
              <Link href="/" className="text-white underline">
                blinkugc.com
              </Link>{' '}
              or download Blinkugc on the App Store.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 text-sm text-white/40 flex gap-6">
          <Link href="/" className="hover:text-white transition">
            Home
          </Link>
          <Link href="/support" className="hover:text-white transition">
            Support
          </Link>
          <Link href="/privacy" className="hover:text-white transition">
            Privacy Policy
          </Link>
        </div>
      </article>
    </main>
  );
}
