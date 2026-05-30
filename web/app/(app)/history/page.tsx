'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { UGCJob } from '@/lib/types';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import { formatRelativeTime } from '@/lib/utils';
import { Trash2 } from 'lucide-react';

export default function HistoryPage() {
  const [jobs, setJobs] = useState<UGCJob[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .listJobs(1)
      .then((r) => setJobs(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // Stop the link navigation when the trash button is clicked. Delete
  // confirmation + the actual call happens here, then we reload the list.
  const onDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this video?')) return;
    await api.deleteJob(id);
    load();
  };

  return (
    <div className="px-6 lg:px-10 pt-10 pb-24">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl lg:text-4xl tracking-[-0.03em]">
          History
        </h1>
        <p className="text-sm text-white/50 mt-1">
          Every ad you&apos;ve generated. Tap any one to see the brief that built it.
        </p>
      </div>

      {loading ? (
        <Skeleton />
      ) : jobs.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {jobs.map((j) => (
            <Link
              key={j.id}
              href={`/history/${j.id}`}
              className="relative aspect-[9/16] rounded-card overflow-hidden border border-white/[0.08] hover:border-white/30 transition group bg-elevated/30 block"
            >
              {j.output_video_url ? (
                <LoopingVideo
                  src={j.output_video_url}
                  poster={j.output_thumbnail_url}
                  className="w-full h-full"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                  <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-accent2 animate-spin mb-3" />
                  <div className="text-xs text-white/50">
                    {j.status === 'failed' ? 'Failed' : 'Processing'}
                  </div>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none">
                <div className="text-[11px] font-semibold truncate">
                  {j.product_name || 'Untitled'}
                </div>
                <div className="text-[10px] text-white/45">
                  {formatRelativeTime(j.created_at)}
                </div>
              </div>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
                <button
                  type="button"
                  onClick={(e) => onDelete(e, j.id)}
                  className="w-7 h-7 rounded-full bg-black/70 backdrop-blur flex items-center justify-center hover:bg-red-500/80"
                  aria-label="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="aspect-[9/16] rounded-card bg-elevated/40 animate-pulse"
        />
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="text-center py-24 max-w-md mx-auto">
      <div className="w-16 h-16 rounded-full bg-elevated mx-auto mb-6 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full bg-brand-gradient" />
      </div>
      <div className="font-bold text-xl mb-2">No videos yet</div>
      <p className="text-sm text-white/55">
        Head to the studio and generate your first ad. Everything you make will appear here.
      </p>
    </div>
  );
}
