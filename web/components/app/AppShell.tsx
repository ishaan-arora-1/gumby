'use client';
import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { useAuth } from '@/lib/auth-context';
import { Sparkles, Film, Folder, LogOut, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/studio', label: 'Studio', icon: Sparkles },
  { href: '/templates', label: 'Creators', icon: Users },
  { href: '/library', label: 'Library', icon: Folder },
  { href: '/videos', label: 'My videos', icon: Film },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-accent2 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-white flex">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-white/5 bg-bg p-4">
        <div className="px-2 py-3 mb-2">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = path === n.href || path.startsWith(n.href + '/');
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm font-medium transition',
                  active
                    ? 'bg-elevated text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-4 h-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="pt-4 border-t border-white/5 mt-4">
          <div className="px-3 py-2 text-xs text-white/45 truncate">
            {user.email}
          </div>
          <button
            onClick={async () => {
              await signOut();
              router.push('/');
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm text-white/60 hover:text-white hover:bg-white/5"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-black/80 backdrop-blur border-b border-white/5 px-4 flex items-center justify-between">
        <Logo />
        <button
          onClick={async () => {
            await signOut();
            router.push('/');
          }}
          className="text-white/60"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-black/90 backdrop-blur border-t border-white/5 flex">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = path === n.href || path.startsWith(n.href + '/');
          return (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium',
                active ? 'text-white' : 'text-white/45'
              )}
            >
              <Icon className="w-5 h-5" />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
