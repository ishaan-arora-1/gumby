/**
 * Caption style presets. Single source of truth shared by:
 *   - backend/src/services/captioning.js → translates these into an ASS
 *     Style block for libass
 *   - web/lib/captionPresets.ts → MUST stay in lockstep, used by the
 *     <CaptionPreview> tile to render the live HTML preview the user
 *     sees in the studio form
 *   - iOS UGCStudioCard → mirrors the same set to render SwiftUI preview
 *     tiles
 *
 * When adding a preset:
 *   1. Add the bundled .ttf to backend/assets/fonts/ AND
 *      web/public/fonts/ (browser preview needs the same glyphs)
 *   2. Add an entry below
 *   3. Mirror the entry into web/lib/captionPresets.ts
 *   4. Mirror it into iOS (CaptionPreset.swift)
 *
 * The `font` field must match the family name reported INSIDE the .ttf
 * (read with the OS font inspector). On Linux/Railway, libass does a
 * strict match against this name via fontsdir, so a mismatch silently
 * produces a captioned video with invisible glyphs.
 */

const PRESETS = {
  bold: {
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
  hype: {
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
  clean: {
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
  yellow: {
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

  italic_bold: {
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

  // --- Block / box variants. boxBgHex switches the renderer into
  // BorderStyle 3 (opaque box behind the text) automatically. ---
  block_black: {
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

  block_blue: {
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

  block_yellow: {
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

  pink_pop: {
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

  block_white: {
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
};

const DEFAULT_PRESET_ID = 'bold';

function getPreset(id) {
  if (id && PRESETS[id]) return PRESETS[id];
  return PRESETS[DEFAULT_PRESET_ID];
}

module.exports = { PRESETS, DEFAULT_PRESET_ID, getPreset };
