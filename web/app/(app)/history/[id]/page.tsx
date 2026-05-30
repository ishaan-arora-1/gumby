'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { UGCJob } from '@/lib/types';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import { formatRelativeTime } from '@/lib/utils';
import { ArrowLeft, Trash2, Download } from 'lucide-react';
import { getCaptionPreset } from '@/lib/captionPresets';

/**
 * History detail — opens when a user taps a tile on /history.
 *
 *   ┌───────────────────────────────────────────────┐
 *   │  [video]                                      │
 *   │                                               │
 *   │  ── Details ──                                │
 *   │  Creator      …                               │
 *   │  Product      …                               │
 *   │  Script       …                               │
 *   │  Scene        …                               │
 *   │  Settings     duration / captions / preset    │
 *   └───────────────────────────────────────────────┘
 *
 * Everything is read-only — no edits here. To remake a variant, the
 * user goes back to /studio and fills the form fresh.
 */
export default function HistoryDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [job, setJob] = useState<UGCJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getJob(id)
      .then((r) => setJob(r.data))
      .catch((e: any) => setError(e?.message || 'Could not load this video'))
      .finally(() => setLoading(false));
  }, [id]);

  const onDelete = async () => {
    if (!job) return;
    if (!confirm('Delete this video? This cannot be undone.')) return;
    await api.deleteJob(job.id);
    router.replace('/history');
  };

  // Browsers ignore the HTML download attribute on cross-origin URLs
  // (Supabase storage is cross-origin), so we fetch as a blob and
  // trigger save off a same-origin blob: URL — same trick we use on
  // the studio result screen.
  const onDownload = async () => {
    if (!job?.output_video_url || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(job.output_video_url, { mode: 'cors', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const filename = (() => {
        try {
          const u = new URL(job.output_video_url!);
          const last = u.pathname.split('/').pop() || '';
          if (last.includes('.')) return last;
        } catch {}
        return `blink-ugc-${job.id}.mp4`;
      })();
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      window.open(job.output_video_url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <DetailSkeleton />;
  if (error || !job) return <DetailError message={error || 'Not found'} />;

  const snapshot = (job.template_snapshot ?? {}) as Record<string, any>;
  const isTemplate = !!job.template_id;
  const creatorLabel = isTemplate
    ? snapshot.actor_name || snapshot.name || 'Template creator'
    : snapshot.actor_name || 'Creator description';

  // These fields aren't in the typed UGCJob interface, but the backend
  // returns them on the row. Pull them via a loose cast.
  const j = job as any;
  const videoDescription: string | undefined = j.video_description;
  const videoDuration: number | undefined = j.video_duration;
  const userTweaks: string | undefined = snapshot.user_tweaks || undefined;
  const userEthnicity: string | undefined = snapshot.user_ethnicity || undefined;
  const captionsEnabled: boolean = snapshot.captions_enabled !== false;
  const captionPresetId: string | undefined = snapshot.caption_preset || undefined;
  const captionPresetLabel = captionsEnabled
    ? getCaptionPreset(captionPresetId ?? null).label
    : 'Off';

  return (
    <div className="px-6 lg:px-10 pt-8 pb-24 max-w-5xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/history"
          className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          History
        </Link>
        <div className="flex items-center gap-2">
          {job.output_video_url && (
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading}
              className="h-9 px-3 rounded-pill bg-white text-black text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {downloading ? (
                <>
                  <div className="w-3 h-3 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                  Downloading…
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" /> Download
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete"
            className="h-9 px-3 rounded-pill border border-white/10 text-white/60 text-xs font-semibold inline-flex items-center gap-1.5 hover:border-red-500/50 hover:text-red-400 transition"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>

      {/* Title */}
      <div className="mb-6">
        <h1 className="font-display font-bold text-3xl tracking-[-0.03em]">
          {job.product_name || 'Untitled ad'}
        </h1>
        <p className="text-sm text-white/45 mt-1">
          Generated {formatRelativeTime(job.created_at)}
          {videoDuration ? ` · ${videoDuration}s` : ''}
          {isTemplate ? ' · Template mode' : ' · Direct prompt'}
        </p>
      </div>

      {/* Video on top */}
      <div className="mx-auto max-w-sm">
        <div className="aspect-[9/16] rounded-card overflow-hidden bg-black border border-white/10">
          {job.output_video_url ? (
            <LoopingVideo
              src={job.output_video_url}
              poster={job.output_thumbnail_url}
              controls
              autoplay
              className="w-full h-full"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-accent2 animate-spin mb-3" />
              <div className="text-xs text-white/60">
                {job.status === 'failed' ? job.error || 'Failed' : 'Still rendering…'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Form recap */}
      <div className="mt-10">
        <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-3">
          The brief
        </div>
        <div className="space-y-3">
          <DetailRow label={isTemplate ? 'Template' : 'Creator'} value={creatorLabel} />
          {!isTemplate && userEthnicity && (
            <DetailRow label="Ethnicity" value={userEthnicity} />
          )}
          {isTemplate && userTweaks && (
            <DetailRow label="Creator tweaks" value={userTweaks} multiline />
          )}
          {job.product_name && (
            <DetailRow label="Product" value={job.product_name} />
          )}
          {job.product_description && (
            <DetailRow label="Product details" value={job.product_description} multiline />
          )}
          {job.product_image_url && (
            <DetailRow
              label="Product image"
              value={
                <div className="w-24 h-24 rounded-btn overflow-hidden border border-white/10 bg-elevated mt-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={job.product_image_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              }
              raw
            />
          )}
          {job.script && (
            <DetailRow label="Script" value={job.script} multiline />
          )}
          {videoDescription && (
            <DetailRow label="Scene" value={videoDescription} multiline />
          )}
          <DetailRow
            label="Captions"
            value={captionsEnabled ? `On · ${captionPresetLabel}` : 'Off'}
          />
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  multiline,
  raw,
}: {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
  raw?: boolean;
}) {
  return (
    <div className="rounded-card bg-studio border border-white/[0.06] p-5">
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-1.5">
        {label}
      </div>
      {raw ? (
        value
      ) : (
        <div
          className={
            multiline
              ? 'text-[14px] leading-[1.55] text-white/85 whitespace-pre-wrap break-words'
              : 'text-[14px] text-white/90'
          }
        >
          {value}
        </div>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="px-6 lg:px-10 pt-8 pb-24 max-w-5xl mx-auto">
      <div className="h-6 w-24 rounded bg-elevated/40 animate-pulse mb-8" />
      <div className="h-9 w-64 rounded bg-elevated/40 animate-pulse mb-6" />
      <div className="mx-auto max-w-sm">
        <div className="aspect-[9/16] rounded-card bg-elevated/40 animate-pulse" />
      </div>
      <div className="mt-10 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 rounded-card bg-elevated/30 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function DetailError({ message }: { message: string }) {
  return (
    <div className="px-6 lg:px-10 pt-20 pb-24 text-center max-w-md mx-auto">
      <h1 className="font-display font-bold text-2xl mb-2">Something went wrong</h1>
      <p className="text-sm text-white/55 mb-6">{message}</p>
      <Link
        href="/history"
        className="inline-flex items-center gap-2 h-10 px-5 rounded-pill border border-white/15 text-sm font-semibold hover:bg-white/5 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to history
      </Link>
    </div>
  );
}
