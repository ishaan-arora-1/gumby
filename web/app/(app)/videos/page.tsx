'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { UGCJob } from '@/lib/types';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import { formatRelativeTime } from '@/lib/utils';
import { Download, Trash2 } from 'lucide-react';

export default function VideosPage() {
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

  const onDelete = async (id: string) => {
    if (!confirm('Delete this video?')) return;
    await api.deleteJob(id);
    load();
  };

  return (
    <div className="px-6 lg:px-10 pt-10 pb-24">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl lg:text-4xl tracking-[-0.03em]">
          My videos
        </h1>
        <p className="text-sm text-white/50 mt-1">All your generated ads.</p>
      </div>

      {loading ? (
        <Skeleton />
      ) : jobs.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {jobs.map((j) => (
            <div
              key={j.id}
              className="relative aspect-[9/16] rounded-card overflow-hidden border border-white/[0.08] hover:border-white/25 transition group bg-elevated/30"
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
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black via-black/60 to-transparent">
                <div className="text-[11px] font-semibold truncate">
                  {j.product_name || 'Untitled'}
                </div>
                <div className="text-[10px] text-white/45">
                  {formatRelativeTime(j.created_at)}
                </div>
              </div>
              {j.output_video_url && (
                <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition">
                  <a
                    href={j.output_video_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-7 h-7 rounded-full bg-black/70 backdrop-blur flex items-center justify-center hover:bg-black"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => onDelete(j.id)}
                    className="w-7 h-7 rounded-full bg-black/70 backdrop-blur flex items-center justify-center hover:bg-red-500/80"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
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
        Head to the studio and generate your first ad.
      </p>
    </div>
  );
}
