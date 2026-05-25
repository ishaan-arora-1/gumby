'use client';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-black/70 backdrop-blur-xl border-b border-white/5'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-sm text-white/70">
          <Link href="#features" className="hover:text-white transition">Features</Link>
          <Link href="#templates" className="hover:text-white transition">Creators</Link>
          <Link href="#how" className="hover:text-white transition">How it works</Link>
          <Link href="#pricing" className="hover:text-white transition">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/studio">
              <Button variant="gradient" size="md">Open Studio →</Button>
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden sm:block">
                <Button variant="ghost" size="md">Sign in</Button>
              </Link>
              <Link href="/login?mode=signup">
                <Button variant="gradient" size="md">Start free</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
