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
  // Optional block-style fields. When `boxBgHex` is set the preview/render
  // switches from outline mode to an opaque rectangle behind the text.
  boxBgHex?: string;
  boxBgAlpha?: number;     // 0..1, default 1
  boxPaddingPx?: number;   // horizontal/vertical padding inside the box
  // Italic flag (orthogonal to outline/block style). Browser/font synthesizes
  // italic from the regular Roboto Black file — we don't ship a separate
  // italic .ttf.
  italic?: boolean;
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

  // --- Outline variants ---
  {
    id: 'yellow',
    label: 'Yellow',
    description: 'Bright yellow text, black outline. MrBeast / YouTube auto-caption energy.',
    font: 'Roboto Black',
    fontFile: 'Roboto-Black.ttf',
    fontSize: 72,
    fillHex: '#FACC15',
    outlineHex: '#000000',
    outlineWidthPx: 5,
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
    id: 'italic_bold',
    label: 'Italic',
    description: 'Bold white text in italic — leans forward for energy.',
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
    italic: true,
  },

  // --- Block / box variants ---
  {
    id: 'block_black',
    label: 'Block Black',
    description: 'White text on a solid black box. Classic TV-news subtitle.',
    font: 'Roboto Black',
    fontFile: 'Roboto-Black.ttf',
    fontSize: 64,
    fillHex: '#FFFFFF',
    outlineHex: '#000000',
    outlineWidthPx: 0,
    shadowHex: '#000000',
    shadowAlpha: 0,
    shadowDyPx: 0,
    positionYRatio: 0.76,
    popFromPct: 90,
    popPeakPct: 104,
    popSettlePct: 100,
    popInMs: 70,
    popSettleMs: 70,
    boxBgHex: '#000000',
    boxBgAlpha: 0.85,
    boxPaddingPx: 10,
  },
  {
    id: 'block_blue',
    label: 'Block Blue',
    description: 'White text on a blue brand-accent box. Modern, ownable.',
    font: 'Roboto Black',
    fontFile: 'Roboto-Black.ttf',
    fontSize: 64,
    fillHex: '#FFFFFF',
    outlineHex: '#000000',
    outlineWidthPx: 0,
    shadowHex: '#000000',
    shadowAlpha: 0,
    shadowDyPx: 0,
    positionYRatio: 0.76,
    popFromPct: 90,
    popPeakPct: 104,
    popSettlePct: 100,
    popInMs: 70,
    popSettleMs: 70,
    boxBgHex: '#3B82F6',
    boxBgAlpha: 1,
    boxPaddingPx: 10,
  },
  {
    id: 'block_yellow',
    label: 'Block Yellow',
    description: 'Black text on a bright yellow box. Highlighter pop.',
    font: 'Roboto Black',
    fontFile: 'Roboto-Black.ttf',
    fontSize: 64,
    fillHex: '#0A0A0A',
    outlineHex: '#000000',
    outlineWidthPx: 0,
    shadowHex: '#000000',
    shadowAlpha: 0,
    shadowDyPx: 0,
    positionYRatio: 0.76,
    popFromPct: 90,
    popPeakPct: 104,
    popSettlePct: 100,
    popInMs: 70,
    popSettleMs: 70,
    boxBgHex: '#FACC15',
    boxBgAlpha: 1,
    boxPaddingPx: 10,
  },
  {
    id: 'pink_pop',
    label: 'Pink Pop',
    description: 'White text on a hot pink box. Beauty / lifestyle creator vibe.',
    font: 'Roboto Black',
    fontFile: 'Roboto-Black.ttf',
    fontSize: 64,
    fillHex: '#FFFFFF',
    outlineHex: '#000000',
    outlineWidthPx: 0,
    shadowHex: '#000000',
    shadowAlpha: 0,
    shadowDyPx: 0,
    positionYRatio: 0.76,
    popFromPct: 90,
    popPeakPct: 104,
    popSettlePct: 100,
    popInMs: 70,
    popSettleMs: 70,
    boxBgHex: '#EC4899',
    boxBgAlpha: 1,
    boxPaddingPx: 10,
  },
  {
    id: 'block_white',
    label: 'Block White',
    description: 'Black text on a clean white box. Newspaper / editorial.',
    font: 'Roboto Black',
    fontFile: 'Roboto-Black.ttf',
    fontSize: 64,
    fillHex: '#0A0A0A',
    outlineHex: '#000000',
    outlineWidthPx: 0,
    shadowHex: '#000000',
    shadowAlpha: 0,
    shadowDyPx: 0,
    positionYRatio: 0.76,
    popFromPct: 90,
    popPeakPct: 104,
    popSettlePct: 100,
    popInMs: 70,
    popSettleMs: 70,
    boxBgHex: '#FFFFFF',
    boxBgAlpha: 1,
    boxPaddingPx: 10,
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
