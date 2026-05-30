'use client';
import { ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { SidebarRecents } from '@/components/app/SidebarRecents';
import { useAuth } from '@/lib/auth-context';
import { Sparkles, History as HistoryIcon, LogOut, Users, PanelLeft, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/studio', label: 'Studio', icon: Sparkles },
  { href: '/templates', label: 'Creators', icon: Users },
  { href: '/history', label: 'History', icon: HistoryIcon },
];

const SIDEBAR_KEY = 'gumby:sidebarCollapsed';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_KEY);
      if (v === '1') setCollapsed(true);
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  // Tapping the Blink UGC logo always means "take me back to a fresh
  // studio". On any other route we just navigate to /studio. When the
  // user is already on /studio (which often has stale state — a
  // generated video showing, a template picked) a same-route push is a
  // no-op, so we additionally dispatch an event the StudioPage listens
  // for and uses to reset its internal state to the welcome step.
  const onLogoClick = () => {
    if (path.startsWith('/studio')) {
      window.dispatchEvent(new Event('blinkugc:fresh-studio'));
    } else {
      router.push('/studio');
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-accent2 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-white flex">
      {/* Sidebar — sticky so it stays pinned to the viewport while main scrolls */}
      <aside
        className={cn(
          'hidden md:flex flex-col border-r border-white/5 bg-bg p-4 transition-[width] duration-200',
          'sticky top-0 h-screen shrink-0 self-start',
          collapsed ? 'w-[72px]' : 'w-60'
        )}
      >
        <div
          className={cn(
            'flex items-center mb-2 py-3',
            collapsed ? 'justify-center' : 'justify-between -ml-1'
          )}
        >
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-2 rounded-btn text-white/60 hover:text-white hover:bg-white/5 transition"
          >
            <PanelLeft className="w-5 h-5" />
          </button>
          {!collapsed && <Logo onClick={onLogoClick} size={26} />}
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = path === n.href || path.startsWith(n.href + '/');
            return (
              <Link
                key={n.href}
                href={n.href}
                title={collapsed ? n.label : undefined}
                className={cn(
                  'flex items-center rounded-btn text-sm font-medium transition',
                  collapsed
                    ? 'justify-center px-2 py-2.5'
                    : 'gap-3 px-3 py-2.5',
                  active
                    ? 'bg-elevated text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{n.label}</span>}
              </Link>
            );
          })}

          {/* ChatGPT-style inline list of recent generations. Refetches
              on every route change and on the 'blinkugc:job-list-changed'
              window event. Hides itself when the sidebar is collapsed. */}
          <SidebarRecents collapsed={collapsed} />
        </nav>
        <div className="pt-4 border-t border-white/5 mt-4 space-y-1">
          <Link
            href="/settings"
            title={collapsed ? 'Account' : undefined}
            className={cn(
              'w-full flex items-center rounded-btn text-sm transition',
              path === '/settings'
                ? 'bg-elevated text-white'
                : 'text-white/60 hover:text-white hover:bg-white/5',
              collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
            )}
          >
            <SettingsIcon className="w-4 h-4 shrink-0" />
            {!collapsed && (
              <span className="flex flex-col items-start min-w-0">
                <span>Account</span>
                {user.email && (
                  <span className="text-[11px] text-white/40 truncate max-w-[140px]">
                    {user.email}
                  </span>
                )}
              </span>
            )}
          </Link>
          <button
            onClick={async () => {
              await signOut();
              router.push('/');
            }}
            title={collapsed ? 'Sign out' : undefined}
            className={cn(
              'w-full flex items-center rounded-btn text-sm text-white/60 hover:text-white hover:bg-white/5 transition',
              collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
            )}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-black/80 backdrop-blur border-b border-white/5 px-4 flex items-center justify-between">
        <Logo href="/studio" size={28} />
        <Link href="/settings" className="text-white/60" aria-label="Account">
          <SettingsIcon className="w-4 h-4" />
        </Link>
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
