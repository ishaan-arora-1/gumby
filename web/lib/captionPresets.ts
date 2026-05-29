/**
 * Caption style presets — MIRROR of backend/src/services/captionPresets.js.
 * If you change one, change the other. The shape is identical; the only
 * reason this isn't fetched from the backend is that the studio form
 * shows a live preview while the user types (zero-latency render).
 *
 * The fontFile names must also exist under web/public/fonts/ so the
 * preview can render with the same glyphs that libass will burn in.
 */

export interface CaptionPreset {
  id: string;
  label: string;
  description: string;
  font: string;          // CSS font-family (also exact name in the .ttf)
  fontFile: string;      // file under web/public/fonts/
  fontSize: number;      // px, in the 1080-wide design canvas
  fillHex: string;
  outlineHex: string;
  outlineWidthPx: number;
  shadowHex: string;
  shadowAlpha: number;
  shadowDyPx: number;
  positionYRatio: number;
  popFromPct: number;
  popPeakPct: number;
  popSettlePct: number;
  popInMs: number;
  popSettleMs: number;
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: 'bold',
    label: 'Bold',
    description: 'White & punchy. The default UGC look.',
    font: 'Roboto Black',
    fontFile: 'Roboto-Black.ttf',
    fontSize: 72,
    fillHex: '#FFFFFF',
    outlineHex: '#000000',
    outlineWidthPx: 4,
    shadowHex: '#000000',
    shadowAlpha: 0.5,
    shadowDyPx: 2,
    positionYRatio: 0.76,
    popFromPct: 85,
    popPeakPct: 106,
    popSettlePct: 100,
    popInMs: 80,
    popSettleMs: 80,
  },
  {
    id: 'hype',
    label: 'Hype',
    description: 'Tall & loud. Viral TikTok energy.',
    font: 'Anton',
    fontFile: 'Anton-Regular.ttf',
    fontSize: 96,
    fillHex: '#FFFFFF',
    outlineHex: '#000000',
    outlineWidthPx: 5,
    shadowHex: '#000000',
    shadowAlpha: 0.5,
    shadowDyPx: 3,
    positionYRatio: 0.76,
    popFromPct: 80,
    popPeakPct: 112,
    popSettlePct: 100,
    popInMs: 90,
    popSettleMs: 100,
  },
  {
    id: 'clean',
    label: 'Clean',
    description: 'Smaller, no shadow. Editorial restraint.',
    font: 'Roboto Black',
    fontFile: 'Roboto-Black.ttf',
    fontSize: 56,
    fillHex: '#FFFFFF',
    outlineHex: '#000000',
    outlineWidthPx: 2,
    shadowHex: '#000000',
    shadowAlpha: 0,
    shadowDyPx: 0,
    positionYRatio: 0.78,
    popFromPct: 92,
    popPeakPct: 102,
    popSettlePct: 100,
    popInMs: 60,
    popSettleMs: 60,
  },
];

export const DEFAULT_CAPTION_PRESET_ID = 'bold';

export function getCaptionPreset(id: string | null | undefined): CaptionPreset {
  if (id) {
    const found = CAPTION_PRESETS.find((p) => p.id === id);
    if (found) return found;
  }
  return CAPTION_PRESETS.find((p) => p.id === DEFAULT_CAPTION_PRESET_ID)!;
}
