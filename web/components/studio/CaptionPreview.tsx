'use client';
import { useId } from 'react';
import type { CaptionPreset } from '@/lib/captionPresets';

interface Props {
  preset: CaptionPreset;
  selected?: boolean;
  onSelect?: () => void;
  /** Sample words shown in the preview tile. Loop pop every ~2s. */
  sampleText?: string;
}

/**
 * Inline mini preview tile for one caption preset. Renders a fake dark
 * 9:16 canvas with the caption text positioned and styled exactly the
 * way libass will render it in the final video (with the unavoidable
 * caveat that browser text rasterization differs slightly from libass —
 * the *vibe* is right even if the pixel anti-aliasing differs).
 *
 * The preview embeds the same .ttf the backend uses via a scoped
 * @font-face block, so users see the actual font glyphs in the picker.
 */
export function CaptionPreview({
  preset,
  selected,
  onSelect,
  sampleText = 'THIS HITS',
}: Props) {
  // Unique id keyed off the preset id so the same preset can appear
  // multiple times on a page (e.g. in dev/storybook) without colliding
  // font-face declarations.
  const reactId = useId();
  const uniqueFontName = `cap-${preset.id}-${reactId.replace(/[^a-z0-9]/gi, '')}`;

  // Caption mini canvas — we render at a fixed display width and scale
  // everything else from the preset's 1080-wide coordinates.
  const FRAME_W = 88;
  const FRAME_H = Math.round(FRAME_W * (16 / 9));
  const scale = FRAME_W / 1080;
  const fontPx = preset.fontSize * scale;
  const outlinePx = preset.outlineWidthPx * scale;
  const shadowOffset = preset.shadowDyPx * scale;
  const yPx = FRAME_H * preset.positionYRatio;

  // Two render modes:
  //   - Outline mode (boxBgHex undefined): emulate stroke with 8-direction
  //     text-shadow + optional drop shadow underneath.
  //   - Block mode (boxBgHex set): solid background rectangle behind the
  //     text, no outline, no drop shadow on the text itself. Matches what
  //     libass does with BorderStyle 3 in the burned-in version.
  const useBoxBackground = !!preset.boxBgHex;
  const boxPaddingPx = (preset.boxPaddingPx ?? 10) * scale;

  const outlineShadows = !useBoxBackground && outlinePx
    ? [
        `${outlinePx}px 0 0 ${preset.outlineHex}`,
        `-${outlinePx}px 0 0 ${preset.outlineHex}`,
        `0 ${outlinePx}px 0 ${preset.outlineHex}`,
        `0 -${outlinePx}px 0 ${preset.outlineHex}`,
        `${outlinePx}px ${outlinePx}px 0 ${preset.outlineHex}`,
        `-${outlinePx}px ${outlinePx}px 0 ${preset.outlineHex}`,
        `${outlinePx}px -${outlinePx}px 0 ${preset.outlineHex}`,
        `-${outlinePx}px -${outlinePx}px 0 ${preset.outlineHex}`,
      ].join(', ')
    : '';
  const dropShadow = !useBoxBackground && preset.shadowAlpha
    ? `0 ${shadowOffset}px 0 rgba(0,0,0,${preset.shadowAlpha})`
    : '';
  const textShadow = [outlineShadows, dropShadow].filter(Boolean).join(', ');

  // hex (#RRGGBB) + alpha → rgba() — used for the box background.
  const hexToRgba = (hex: string, alpha = 1): string => {
    const cleaned = hex.replace('#', '');
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  const boxBackground = useBoxBackground
    ? hexToRgba(preset.boxBgHex!, preset.boxBgAlpha ?? 1)
    : 'transparent';

  const popKeyframes = `cap-pop-${reactId.replace(/[^a-z0-9]/gi, '')}`;
  const popDurationMs = 2000; // full loop cycle so the user sees the pop

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative shrink-0 text-left transition ${
        selected ? 'opacity-100' : 'opacity-80 hover:opacity-100'
      }`}
      aria-pressed={!!selected}
    >
      <style>{`
        @font-face {
          font-family: '${uniqueFontName}';
          src: url('/fonts/${preset.fontFile}') format('truetype');
          font-display: block;
        }
        @keyframes ${popKeyframes} {
          0%   { transform: translate(-50%, -50%) scale(${preset.popFromPct / 100}); opacity: 0; }
          8%   { transform: translate(-50%, -50%) scale(${preset.popPeakPct / 100}); opacity: 1; }
          14%  { transform: translate(-50%, -50%) scale(${preset.popSettlePct / 100}); opacity: 1; }
          80%  { transform: translate(-50%, -50%) scale(${preset.popSettlePct / 100}); opacity: 1; }
          92%  { transform: translate(-50%, -50%) scale(${preset.popSettlePct / 100}); opacity: 0; }
          100% { transform: translate(-50%, -50%) scale(${preset.popFromPct / 100}); opacity: 0; }
        }
      `}</style>
      <div
        className={`relative overflow-hidden rounded-btn border bg-[#0e0e10] transition ${
          selected
            ? 'border-accent2 ring-2 ring-accent2/40'
            : 'border-white/10 group-hover:border-white/25'
        }`}
        style={{ width: FRAME_W, height: FRAME_H }}
      >
        {/* faux UGC background — soft radial gradient so the white caption
            isn't sitting on pure black */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 50% 35%, rgba(80,90,110,0.55) 0%, rgba(20,22,30,0.85) 60%, rgba(8,9,12,1) 100%)',
          }}
        />
        {/* the caption itself. In block mode we wrap the text in a padded
            rectangle so the box scales with the pop animation alongside it. */}
        <div
          className="absolute left-1/2 select-none whitespace-nowrap"
          style={{
            top: yPx,
            transform: 'translate(-50%, -50%)',
            fontFamily: `'${uniqueFontName}', sans-serif`,
            fontSize: fontPx,
            fontStyle: preset.italic ? 'italic' : 'normal',
            color: preset.fillHex,
            textShadow,
            letterSpacing: '0.01em',
            lineHeight: 1,
            background: boxBackground,
            padding: useBoxBackground ? `${boxPaddingPx * 0.6}px ${boxPaddingPx}px` : 0,
            borderRadius: useBoxBackground ? 4 : 0,
            animation: `${popKeyframes} ${popDurationMs}ms ease-in-out infinite`,
            willChange: 'transform, opacity',
          }}
        >
          {sampleText}
        </div>
      </div>
      <div className={`mt-2 text-[11px] font-semibold tracking-wide ${
        selected ? 'text-white' : 'text-white/70'
      }`}>
        {preset.label}
      </div>
    </button>
  );
}
