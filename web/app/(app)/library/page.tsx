'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { UGCCreatorJob } from '@/lib/types';
import { LoopingVideo } from '@/components/ui/LoopingVideo';

export default function LibraryPage() {
  const [clips, setClips] = useState<UGCCreatorJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .myLibrary(1)
      .then((r) => setClips(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-6 lg:px-10 pt-10 pb-24">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl lg:text-4xl tracking-[-0.03em]">
          Library
        </h1>
        <p className="text-sm text-white/50 mt-1">
          Your generated creators. Reuse them anytime.
        </p>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="aspect-[9/16] rounded-card bg-elevated/40 animate-pulse"
            />
          ))}
        </div>
      ) : clips.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {clips.map((c) => (
            <div
              key={c.id}
              className="relative aspect-[9/16] rounded-card overflow-hidden border border-white/[0.08] hover:border-white/25 transition group"
            >
              {c.video_url && (
                <LoopingVideo
                  src={c.video_url}
                  poster={c.thumbnail_url}
                  className="w-full h-full"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black to-transparent">
                <div className="text-[11px] text-white/70 line-clamp-2">
                  {c.prompt}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-24 max-w-md mx-auto">
      <div className="w-16 h-16 rounded-full bg-elevated mx-auto mb-6 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full bg-brand-gradient" />
      </div>
      <div className="font-bold text-xl mb-2">Library's empty</div>
      <p className="text-sm text-white/55">
        Generate a creator in studio and it'll live here.
      </p>
    </div>
  );
}
