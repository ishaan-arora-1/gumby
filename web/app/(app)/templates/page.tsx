'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Blueprint, UGCTemplate } from '@/lib/types';
import { TemplateCard } from '@/components/studio/TemplateCard';
import { BlueprintCard } from '@/components/studio/BlueprintCard';
import {
  type TemplateTarget,
  targetFromBlueprint,
  targetFromCreator,
} from '@/lib/templateTarget';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<UGCTemplate[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Every card hands a normalized target to /studio, which opens the
  // shared preview → input-modal flow. One key, one flow, both kinds.
  const openInStudio = (target: TemplateTarget) => {
    try {
      sessionStorage.setItem('blinkugc:pendingTarget', JSON.stringify(target));
    } catch {}
    router.push('/studio');
  };

  useEffect(() => {
    Promise.allSettled([
      api.listTemplates(1).then((r) => setTemplates(r.data)),
      api.listBlueprints().then((r) => setBlueprints(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <div className="px-6 lg:px-10 pt-10 pb-24">
      {/* Viral templates — one product photo in, that exact video out.
          Picking one hands off to /studio (same sessionStorage pattern as
          the creator cards below) which opens the blueprint modal. */}
      <div className="mb-12">
        <div className="mb-8">
          <h1 className="font-display font-bold text-3xl lg:text-4xl tracking-[-0.03em]">
            Viral templates
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Pick a format, drop your product photo — we make exactly that
            video for your product.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {loading && blueprints.length === 0
            ? [...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-[9/16] rounded-card bg-elevated/40 animate-pulse"
                />
              ))
            : blueprints.map((b) => (
                <BlueprintCard
                  key={b.id}
                  blueprint={b}
                  onUse={(bp) => openInStudio(targetFromBlueprint(bp))}
                />
              ))}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="font-display font-bold text-2xl lg:text-3xl tracking-[-0.03em]">
          Creators
        </h2>
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
                onUse={(tpl) => openInStudio(targetFromCreator(tpl))}
              />
            ))}
      </div>
    </div>
  );
}
