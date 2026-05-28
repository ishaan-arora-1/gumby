'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowUpRight,
  FileText,
  Mail,
  Globe,
  Info,
  LogOut,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const APP_VERSION = '1.0';
const SUPPORT_EMAIL = 'support@blinkugc.com';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const initial = (user.user_metadata?.full_name || user.email || 'U')
    .trim()
    .charAt(0)
    .toUpperCase();
  const displayName =
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email ||
    'Signed in';

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);
    try {
      await api.deleteAccount();
      await signOut();
      router.push('/');
    } catch (e) {
      setIsDeleting(false);
      setError(
        e instanceof Error ? e.message : 'Could not delete your account.'
      );
    }
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10 md:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="mb-10">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Account
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Manage your Blinkugc account, review legal documents, or sign out.
          </p>
        </header>

        {/* Account card */}
        <Section>
          <div className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-base font-semibold">
              {user.user_metadata?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.user_metadata.avatar_url as string}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <span>{initial}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-medium truncate">
                {displayName}
              </div>
              {user.email && (
                <div className="text-sm text-white/50 truncate">
                  {user.email}
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Legal */}
        <SectionLabel>Legal</SectionLabel>
        <Section>
          <Row
            href="/privacy"
            icon={<FileText className="w-4 h-4" />}
            label="Privacy Policy"
            external
          />
          <Divider />
          <Row
            href="/terms"
            icon={<ShieldCheck className="w-4 h-4" />}
            label="Terms of Service"
            external
          />
        </Section>

        {/* Support */}
        <SectionLabel>Support</SectionLabel>
        <Section>
          <Row
            href={`mailto:${SUPPORT_EMAIL}`}
            icon={<Mail className="w-4 h-4" />}
            label="Contact support"
            detail={SUPPORT_EMAIL}
            external
          />
          <Divider />
          <Row
            href="https://blinkugc.com"
            icon={<Globe className="w-4 h-4" />}
            label="Website"
            detail="blinkugc.com"
            external
          />
        </Section>

        {/* About */}
        <SectionLabel>About</SectionLabel>
        <Section>
          <div className="flex items-center gap-3 px-5 py-4">
            <span className="text-white/50">
              <Info className="w-4 h-4" />
            </span>
            <span className="text-sm">Version</span>
            <span className="ml-auto text-sm text-white/50 tabular-nums">
              {APP_VERSION}
            </span>
          </div>
        </Section>

        {/* Danger zone */}
        <div className="mt-8 grid gap-3">
          <button
            onClick={async () => {
              await signOut();
              router.push('/');
            }}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-white/[0.04] border border-white/10 text-sm font-medium hover:bg-white/[0.07] transition"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-medium hover:bg-red-500/15 transition"
          >
            <Trash2 className="w-4 h-4" />
            Delete account
          </button>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-400 text-center">{error}</p>
        )}
      </div>

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => !isDeleting && setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#111] border border-white/10 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Delete account?</h2>
            <p className="mt-3 text-sm text-white/60 leading-relaxed">
              This permanently deletes your Blinkugc account and all of your
              videos, drafts, and chat history. This action cannot be undone.
            </p>
            <p className="mt-4 text-xs text-white/50">
              Type <span className="font-mono text-white">DELETE</span> to
              confirm.
            </p>
            <input
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              placeholder="DELETE"
              className="mt-2 w-full h-11 rounded-lg bg-white/[0.04] border border-white/10 px-3 text-sm outline-none focus:border-white/30"
              disabled={isDeleting}
            />
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 h-11 rounded-lg bg-white/[0.04] border border-white/10 text-sm font-medium hover:bg-white/[0.07] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting || deleteText !== 'DELETE'}
                className={cn(
                  'flex-1 h-11 rounded-lg text-sm font-medium transition',
                  isDeleting || deleteText !== 'DELETE'
                    ? 'bg-red-500/20 text-red-300/60 cursor-not-allowed'
                    : 'bg-red-500 text-white hover:bg-red-600'
                )}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-8 mb-2 px-1 text-[11px] font-semibold tracking-wider text-white/40 uppercase">
      {children}
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/10 overflow-hidden">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-white/5 ml-12" />;
}

function Row({
  href,
  icon,
  label,
  detail,
  external,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  detail?: string;
  external?: boolean;
}) {
  const cls =
    'flex items-center gap-3 px-5 py-4 hover:bg-white/[0.03] transition';

  if (external) {
    return (
      <a
        href={href}
        target={href.startsWith('mailto:') ? '_self' : '_blank'}
        rel="noopener noreferrer"
        className={cls}
      >
        <span className="text-white/50">{icon}</span>
        <span className="text-sm">{label}</span>
        {detail && (
          <span className="ml-auto text-xs text-white/45 truncate max-w-[50%]">
            {detail}
          </span>
        )}
        <ArrowUpRight className="w-3.5 h-3.5 text-white/40 ml-2 shrink-0" />
      </a>
    );
  }

  return (
    <Link href={href} className={cls}>
      <span className="text-white/50">{icon}</span>
      <span className="text-sm">{label}</span>
      {detail && (
        <span className="ml-auto text-xs text-white/45 truncate max-w-[50%]">
          {detail}
        </span>
      )}
      <ArrowUpRight className="w-3.5 h-3.5 text-white/40 ml-2 shrink-0" />
    </Link>
  );
}
