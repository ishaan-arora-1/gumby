import type { Blueprint, UGCTemplate } from './types';

/**
 * Normalized shape both template kinds collapse to, so the preview modal
 * and the input modal don't care whether the source was a curated
 * blueprint (one-photo viral format) or a featured-creator row. The
 * gallery mixes both; this is the seam that unifies their flow.
 */
export interface TemplateTarget {
  kind: 'blueprint' | 'creator';
  id: string;
  name: string;
  /** Show the script + captions inputs? Silent product-shot blueprints = false. */
  talking: boolean;
  durationSeconds: number;
  aspectRatio: '9:16' | '16:9' | '1:1';
  /** Looping preview clip shown before "Use as template". */
  videoUrl?: string | null;
  posterUrl?: string | null;
  /** Creator-only: the fixed on-camera person composited into the scene. */
  creatorImageUrl?: string | null;
  /** Creator-only extras used to seed the script generator's voice. */
  sampleScript?: string;
  setting?: string;
}

function normalizeAspect(a?: string): '9:16' | '16:9' | '1:1' {
  return a === '16:9' || a === '1:1' ? a : '9:16';
}

export function targetFromBlueprint(b: Blueprint): TemplateTarget {
  return {
    kind: 'blueprint',
    id: b.id,
    name: b.name,
    talking: b.creator_speaks,
    durationSeconds: b.duration_seconds,
    aspectRatio: normalizeAspect(b.aspect_ratio),
    videoUrl: b.preview_video_url,
    posterUrl: b.preview_poster_url,
  };
}

export function targetFromCreator(t: UGCTemplate): TemplateTarget {
  const creatorImg = t.thumbnail_url || t.actor_avatar_url || '';
  return {
    kind: 'creator',
    id: t.id,
    name: t.actor_name || t.name,
    // Featured creators are always talking-head ads.
    talking: true,
    durationSeconds: t.duration_seconds && t.duration_seconds >= 8 ? 10 : (t.duration_seconds || 10),
    aspectRatio: normalizeAspect(t.aspect_ratio),
    videoUrl: t.video_url,
    posterUrl: t.thumbnail_url,
    creatorImageUrl: creatorImg,
    sampleScript: t.sample_script,
    setting: t.setting,
  };
}

export const creditsForDuration = (s: number) => (s >= 13 ? 150 : s >= 8 ? 100 : 50);

/**
 * Curated front-of-grid order for the mixed template gallery, shared by web
 * and iOS. Blueprints are keyed by their id; featured creators by their
 * lowercased actor name (that's how the product refers to them, and it
 * survives DB re-seeds better than a UUID). Anything not listed keeps its
 * existing stable (hash) order after these.
 */
export const TEMPLATE_PRIORITY: string[] = [
  'podcast-plug',    // 1  Podcast Clip
  'ava',             // 2  MENA / the outfit check → Ava "Clothing Try-On"
  'fit-check',       // 3  Fit Check
  'handheld-hype',   // 4  Handheld Hype
  'unboxing-asmr',   // 5  ASMR Unboxing
  'kiara',           // 6  Kiara "Wardrobe styling"
  'golden-hour-pov', // 7  Golden Hour POV
  'riya',            // 8  Riya
  'anika',           //    Anika
  'neev',            //    Niamh → Neev "Fashion drop reveal"
];

export function templatePriorityKey(
  kind: 'blueprint' | 'creator',
  id: string,
  actorName?: string
): string {
  return kind === 'creator' ? (actorName || '').trim().toLowerCase() : id;
}

export function templateRank(key: string): number {
  const i = TEMPLATE_PRIORITY.indexOf(key);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}
