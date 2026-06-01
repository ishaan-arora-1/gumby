import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Reliably download a generated video.
 *
 * Our videos are served from Supabase Storage signed URLs, which are
 * cross-origin to the app. The old approach (fetch → blob → <a download>)
 * silently fails on mobile Safari (it opens a viewer instead of saving) and
 * depends on CORS. Instead we lean on Supabase's `download` query param: it
 * makes Storage respond with `Content-Disposition: attachment`, which forces
 * a real "save" in every browser — including mobile — via a plain anchor
 * navigation, no CORS fetch required.
 */
export function downloadVideo(url: string, filename?: string) {
  try {
    const u = new URL(url);
    // `download=<name>` (empty value = keep original name). Works alongside
    // the existing `?token=` query on signed URLs.
    u.searchParams.set('download', filename ?? '');
    const a = document.createElement('a');
    a.href = u.toString();
    if (filename) a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // Last-resort fallback: open the raw URL so the user isn't stuck.
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}
