'use client';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import type { UGCTemplate } from '@/lib/types';

interface Props {
  template: UGCTemplate;
  onUse: (t: UGCTemplate) => void;
  selected?: boolean;
}

export function TemplateCard({ template, onUse, selected }: Props) {
  return (
    <button
      onClick={() => onUse(template)}
      className={`group relative text-left aspect-[9/16] rounded-card overflow-hidden border transition-all ${
        selected
          ? 'border-accent2 ring-2 ring-accent2/40'
          : 'border-white/[0.08] hover:border-white/25'
      }`}
    >
      {template.video_url ? (
        <LoopingVideo
          src={template.video_url}
          poster={template.thumbnail_url}
          className="absolute inset-0"
        />
      ) : (
        <div className="absolute inset-0 bg-elevated" />
      )}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black via-black/70 to-transparent">
        <div className="font-bold text-sm truncate">
          {template.actor_name || template.name}
        </div>
        {template.description && (
          <div className="text-[11px] text-white/55 truncate">
            {template.description}
          </div>
        )}
      </div>
      <div className="absolute top-2 right-2 px-2.5 py-1 rounded-pill bg-black/70 backdrop-blur border border-white/10 text-[10px] font-semibold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition">
        Use
      </div>
    </button>
  );
}
