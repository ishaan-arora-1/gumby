'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import type { UGCJob } from '@/lib/types';
import { formatRelativeTime, cn } from '@/lib/utils';

/**
 * ChatGPT/Claude-style "Recents" list shown inline in the AppShell
 * sidebar below the main nav. Pulls the user's most recent UGC
 * generations and renders each as a compact tappable row that opens
 * the history detail page.
 *
 * Refetches on every route change (so newly-generated videos appear
 * after the user navigates away from /studio) and also on the custom
 * `blinkugc:job-list-changed` window event, which any page can
 * dispatch to force an immediate refresh (e.g. after a delete).
 */
export function SidebarRecents({ collapsed }: { collapsed: boolean }) {
  const [jobs, setJobs] = useState<UGCJob[] | null>(null);
  const path = usePathname();

  const refresh = () => {
    api
      .listJobs(1)
      .then((r) => setJobs((r.data || []).slice(0, 12)))
      .catch(() => setJobs([]));
  };

  useEffect(() => {
    refresh();
  }, [path]);

  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener('blinkugc:job-list-changed', onChanged);
    return () => window.removeEventListener('blinkugc:job-list-changed', onChanged);
  }, []);

  // Collapsed sidebar hides recents entirely — there's no room for
  // legible product names at 72px wide.
  if (collapsed) return null;

  return (
    <div className="mt-5 pt-5 border-t border-white/5">
      <div className="px-2 mb-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-semibold">
          Recents
        </span>
      </div>

      {jobs === null ? (
        <SkeletonRows />
      ) : jobs.length === 0 ? (
        <div className="px-2 text-[11px] text-white/35 leading-snug">
          No generations yet.
        </div>
      ) : (
        <div className="space-y-px">
          {jobs.map((j) => (
            <RecentRow key={j.id} job={j} active={path === `/history/${j.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecentRow({ job, active }: { job: UGCJob; active: boolean }) {
  const title = job.product_name?.trim() || 'Untitled';
  return (
    <Link
      href={`/history/${job.id}`}
      title={title}
      className={cn(
        'flex items-center gap-3 px-2 py-2 rounded-btn transition',
        active
          ? 'bg-elevated text-white'
          : 'text-white/80 hover:text-white hover:bg-white/[0.04]'
      )}
    >
      <div className="w-9 h-9 rounded-md overflow-hidden bg-elevated/50 shrink-0 ring-1 ring-white/10">
        {job.output_thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={job.output_thumbnail_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          // Subtle placeholder for rendering / failed jobs — keeps the
          // row alignment consistent without showing a broken thumbnail.
          <div className="w-full h-full bg-gradient-to-br from-white/[0.04] to-transparent" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium leading-tight">
          {title}
        </div>
        <div className="text-[11px] text-white/40 truncate mt-1 leading-none">
          {formatRelativeTime(job.created_at)}
        </div>
      </div>
    </Link>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-1">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-[52px] rounded-btn bg-elevated/40 animate-pulse" />
      ))}
    </div>
  );
}
