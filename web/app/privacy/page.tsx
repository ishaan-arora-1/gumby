import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Blinkugc',
  description:
    'How Blinkugc collects, uses, and shares information when you use the app.',
};

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-white/50">Last updated: 29 May 2026</p>

        <div className="prose-blinkugc mt-12 space-y-10 text-white/80 leading-relaxed">
          <p>
            This Privacy Policy describes how Blinkugc (&ldquo;we&rdquo;,
            &ldquo;our&rdquo;, or &ldquo;the app&rdquo;) collects, uses, and
            shares information when you use our iOS application, website, and
            related backend services.
          </p>
          <p>
            If you have questions, contact us at{' '}
            <a
              href="mailto:support@blinkugc.com"
              className="text-white underline"
            >
              support@blinkugc.com
            </a>
            .
          </p>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              1. Information We Collect
            </h2>
            <p className="mt-4">
              <strong className="text-white">Account information.</strong> When
              you sign in with Apple or Google, we receive a unique user
              identifier, your email address, and (if you choose to share it)
              your name and profile photo. We store this so that your account,
              videos, and chat history persist across sessions and devices.
            </p>
            <p className="mt-4">
              <strong className="text-white">
                Content you create or upload.
              </strong>{' '}
              Product photos, inspiration images, prompts, scripts, voice
              selections, and any text you enter while generating videos. We
              store this content so that the app can generate UGC videos for
              you and so you can return to your work later.
            </p>
            <p className="mt-4">
              <strong className="text-white">Generated content.</strong>{' '}
              AI-generated videos, images, and audio that the app produces on
              your behalf.
            </p>
            <p className="mt-4">
              <strong className="text-white">Usage and diagnostic data.</strong>{' '}
              Crash reports and basic diagnostic information used to keep the
              app stable. This is not linked to advertising identifiers and is
              not used for tracking.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              2. Information We Do Not Collect
            </h2>
            <ul className="mt-4 list-disc pl-6 space-y-2">
              <li>We do not collect your precise location.</li>
              <li>We do not collect contacts, calendar entries, or health data.</li>
              <li>We do not include third-party advertising SDKs.</li>
              <li>
                We do not use the App Tracking Transparency framework, because
                we do not track you across apps and websites owned by other
                companies.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              3. How We Use Information
            </h2>
            <ul className="mt-4 list-disc pl-6 space-y-2">
              <li>
                To operate the core functionality of the app: generating
                videos, lip-sync, voice previews, and saving your drafts.
              </li>
              <li>To authenticate you and keep your session secure.</li>
              <li>To diagnose crashes and improve reliability.</li>
              <li>To respond to your support requests.</li>
            </ul>
            <p className="mt-4">
              We do not sell your personal information, and we do not use your
              content to train third-party advertising or marketing models.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              4. Third-Party Processors
            </h2>
            <p className="mt-4">
              We rely on the following service providers to operate the app.
              Each acts as a data processor on our behalf:
            </p>
            <ul className="mt-4 list-disc pl-6 space-y-2">
              <li>
                <strong className="text-white">Apple, Inc.</strong> — Sign in
                with Apple authentication.
              </li>
              <li>
                <strong className="text-white">Google LLC</strong> — Sign in
                with Google authentication (optional).
              </li>
              <li>
                <strong className="text-white">Supabase, Inc.</strong> —
                Authentication, PostgreSQL database, and object storage for
                your account data and generated videos.
              </li>
              <li>
                <strong className="text-white">FAL.ai</strong> — AI inference
                (ElevenLabs voice synthesis, Kling video generation, SYNC
                lip-sync). Your prompts and uploaded images are sent to FAL.ai
                for the sole purpose of generating output for you.
              </li>
              <li>
                <strong className="text-white">OpenAI, L.L.C.</strong> — Script
                generation from your product descriptions. Prompts are sent to
                OpenAI only when you choose to generate a script.
              </li>
              <li>
                <strong className="text-white">Google Gemini</strong> —
                Secondary AI inference.
              </li>
            </ul>
            <p className="mt-4">
              These providers process the minimum data needed to perform their
              service and are bound by their own privacy commitments.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              5. Data Retention
            </h2>
            <p className="mt-4">
              We retain your account data and generated content until you
              delete your account. You can delete your account at any time from
              inside the app by opening the sidebar, tapping your profile
              avatar, and selecting <strong>Delete account</strong>. Deleting
              your account permanently removes your videos, drafts, chat
              history, and authentication record from our systems.
            </p>
            <p className="mt-4">
              Crash and diagnostic logs are retained for up to 90 days.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              6. Children&rsquo;s Privacy
            </h2>
            <p className="mt-4">
              Blinkugc is not directed at children under 13, and we do not
              knowingly collect personal information from children under 13. If
              you believe a child has provided us personal information, contact
              us and we will delete it.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              7. Your Rights
            </h2>
            <p className="mt-4">
              Depending on where you live, you may have the right to access,
              correct, export, or delete the personal data we hold about you.
              To exercise any of these rights, email{' '}
              <a
                href="mailto:support@blinkugc.com"
                className="text-white underline"
              >
                support@blinkugc.com
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              8. International Transfers
            </h2>
            <p className="mt-4">
              Your data may be processed in countries other than the one in
              which you live, including the United States. We rely on
              industry-standard safeguards (including Standard Contractual
              Clauses where applicable) to protect your information during
              these transfers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">9. Security</h2>
            <p className="mt-4">
              We use HTTPS for all network communication, store authentication
              tokens in the iOS Keychain, and rely on Supabase Row-Level
              Security to isolate your data from other users. No method of
              transmission or storage is 100% secure, but we work to protect
              your data using industry-standard practices.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">
              10. Changes to This Policy
            </h2>
            <p className="mt-4">
              We may update this Privacy Policy from time to time. When we make
              material changes, we will update the &ldquo;Last updated&rdquo;
              date above and, if appropriate, notify you in the app.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-white">11. Contact</h2>
            <p className="mt-4">
              Blinkugc
              <br />
              Email:{' '}
              <a
                href="mailto:support@blinkugc.com"
                className="text-white underline"
              >
                support@blinkugc.com
              </a>
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
        </div>
      </article>
    </main>
  );
}
