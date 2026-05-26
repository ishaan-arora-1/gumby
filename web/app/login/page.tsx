'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import Link from 'next/link';
import { Mail, Lock, User as UserIcon, ArrowLeft, CheckCircle2, Send } from 'lucide-react';

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'signup'>(
    params.get('mode') === 'signup' ? 'signup' : 'signin'
  );
  const {
    signInWithEmail,
    signUpWithEmail,
    signInWithMagicLink,
    signInWithGoogle,
    resendConfirmation,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await signUpWithEmail(email, password, name);
        if (needsConfirmation) {
          setAwaitingConfirm(true);
        } else {
          router.push('/studio');
        }
      } else {
        await signInWithEmail(email, password);
        router.push('/studio');
      }
    } catch (e: any) {
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('not confirmed') || msg.includes('email not confirmed')) {
        setAwaitingConfirm(true);
        setErr('');
      } else if (msg.includes('invalid login')) {
        setErr("Email or password isn't right.");
      } else {
        setErr(e?.message || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!email) {
      setErr('Enter your email above.');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await resendConfirmation(email);
      setInfo('Confirmation email re-sent. Check your inbox (and spam).');
    } catch (e: any) {
      setErr(e?.message || 'Could not resend');
    } finally {
      setLoading(false);
    }
  };

  const continueWithGoogle = async () => {
    setErr('');
    setInfo('');
    setLoading(true);
    try {
      await signInWithGoogle('/studio');
      // The browser will navigate away to Google. If we end up here without
      // navigating, the redirect was suppressed (e.g. popup blocker).
    } catch (e: any) {
      setErr(e?.message || 'Could not start Google sign-in');
      setLoading(false);
    }
  };

  const sendMagicLink = async () => {
    if (!email) {
      setErr('Enter your email above.');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      await signInWithMagicLink(email);
      setInfo('Magic link sent. Check your inbox.');
    } catch (e: any) {
      setErr(e?.message || 'Could not send magic link');
    } finally {
      setLoading(false);
    }
  };

  if (awaitingConfirm) {
    return (
      <main className="min-h-screen bg-authBg relative overflow-hidden flex items-center justify-center px-6">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-accent1/20 blur-[140px]" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-accent3/25 blur-[160px]" />
        <Link
          href="/"
          className="absolute top-6 left-6 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <div className="relative w-full max-w-md">
          <div className="flex justify-center mb-10">
            <Logo size={36} />
          </div>
          <div className="glass rounded-card p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-brand-gradient mx-auto mb-6 flex items-center justify-center">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <h1 className="font-display font-bold text-2xl tracking-tight mb-2">
              Check your inbox
            </h1>
            <p className="text-sm text-white/60 mb-6">
              We sent a confirmation link to{' '}
              <span className="text-white font-semibold">{email}</span>. Click it,
              then come back here to sign in.
            </p>
            {info && (
              <div className="mb-4 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-btn px-4 py-3 flex items-center gap-2 justify-center">
                <CheckCircle2 className="w-4 h-4" /> {info}
              </div>
            )}
            {err && (
              <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-btn px-4 py-3">
                {err}
              </div>
            )}
            <div className="space-y-2">
              <Button
                variant="gradient"
                size="lg"
                onClick={resend}
                disabled={loading}
                className="w-full"
              >
                <Send className="w-4 h-4" /> Resend email
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  setAwaitingConfirm(false);
                  setMode('signin');
                  setInfo('');
                  setErr('');
                }}
                className="w-full"
              >
                Back to sign in
              </Button>
            </div>
            <p className="mt-6 text-xs text-white/40">
              Already confirmed? Switch back and sign in normally.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-authBg relative overflow-hidden flex items-center justify-center px-6">
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-accent1/20 blur-[140px]" />
      <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-accent3/25 blur-[160px]" />

      <Link
        href="/"
        className="absolute top-6 left-6 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="relative w-full max-w-md">
        <div className="flex justify-center mb-10">
          <Logo size={36} />
        </div>

        <div className="glass rounded-card p-8">
          <h1 className="font-display font-bold text-3xl tracking-tight mb-1">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-sm text-white/55 mb-8">
            {mode === 'signup'
              ? 'Start shipping UGC ads today.'
              : 'Sign in to continue creating.'}
          </p>

          <button
            type="button"
            onClick={continueWithGoogle}
            disabled={loading}
            className="w-full h-12 mb-4 rounded-btn bg-white text-black font-semibold text-sm flex items-center justify-center gap-3 hover:bg-white/90 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            <GoogleGlyph />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-white/40 uppercase tracking-wider">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-12 pl-11 pr-4 rounded-btn bg-elevated border border-white/10 focus:border-accent2/60 focus:outline-none text-sm placeholder:text-white/30"
                />
              </div>
            )}
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="email"
                placeholder="you@brand.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 pl-11 pr-4 rounded-btn bg-elevated border border-white/10 focus:border-accent2/60 focus:outline-none text-sm placeholder:text-white/30"
              />
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="password"
                placeholder="Password (8+ chars)"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 pl-11 pr-4 rounded-btn bg-elevated border border-white/10 focus:border-accent2/60 focus:outline-none text-sm placeholder:text-white/30"
              />
            </div>
            {err && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-btn px-4 py-3">
                {err}
              </div>
            )}
            {info && (
              <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-btn px-4 py-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {info}
              </div>
            )}
            <Button
              type="submit"
              variant="gradient"
              size="lg"
              className="w-full mt-2"
              disabled={loading}
            >
              {loading
                ? 'Please wait…'
                : mode === 'signup'
                ? 'Create account'
                : 'Sign in'}
            </Button>
          </form>

          {mode === 'signin' && (
            <button
              onClick={sendMagicLink}
              disabled={loading}
              className="mt-3 w-full text-xs text-white/60 hover:text-white"
            >
              Or email me a magic link →
            </button>
          )}

          <div className="mt-6 text-center text-sm text-white/55">
            {mode === 'signup' ? (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => {
                    setMode('signin');
                    setErr('');
                    setInfo('');
                  }}
                  className="text-white hover:text-accent2 font-semibold"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                New here?{' '}
                <button
                  onClick={() => {
                    setMode('signup');
                    setErr('');
                    setInfo('');
                  }}
                  className="text-white hover:text-accent2 font-semibold"
                >
                  Create an account
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-white/30 mt-6">
          By continuing you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
