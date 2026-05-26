'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/ui/Logo';

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const next = params.get('next') || '/studio';

      const oauthError =
        params.get('error_description') || params.get('error');
      if (oauthError) {
        if (!cancelled) setError(oauthError);
        return;
      }

      try {
        const code = params.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Implicit flow: detectSessionInUrl already populated the session.
          // Wait briefly for it.
          await supabase.auth.getSession();
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('Could not establish a session. Please try again.');
        }

        if (!cancelled) router.replace(next);
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : 'Sign-in could not be completed.';
        if (!cancelled) setError(msg);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <main className="min-h-screen bg-authBg flex items-center justify-center px-6">
      <div className="text-center">
        <div className="flex justify-center mb-8">
          <Logo size={36} />
        </div>
        {error ? (
          <>
            <h1 className="text-xl font-semibold mb-2">Sign-in failed</h1>
            <p className="text-sm text-white/60 max-w-sm mx-auto mb-6">
              {error}
            </p>
            <button
              onClick={() => router.replace('/login')}
              className="text-sm text-white hover:text-accent2 underline"
            >
              Back to sign in
            </button>
          </>
        ) : (
          <p className="text-sm text-white/60">Signing you in…</p>
        )}
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-authBg flex items-center justify-center">
          <p className="text-sm text-white/60">Signing you in…</p>
        </main>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
