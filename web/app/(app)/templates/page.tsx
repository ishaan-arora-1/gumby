'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { UGCTemplate } from '@/lib/types';
import { TemplateCard } from '@/components/studio/TemplateCard';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<UGCTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    api
      .listTemplates(1)
      .then((r) => setTemplates(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-6 lg:px-10 pt-10 pb-24">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl lg:text-4xl tracking-[-0.03em]">
          Creators
        </h1>
        <p className="text-sm text-white/50 mt-1">
          Curated AI creators to cast in your ads.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {loading
          ? [...Array(10)].map((_, i) => (
              <div
                key={i}
                className="aspect-[9/16] rounded-card bg-elevated/40 animate-pulse"
              />
            ))
          : templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onUse={() => router.push('/studio')}
              />
            ))}
      </div>
    </div>
  );
}
