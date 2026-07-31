'use client';
import { useEffect, useRef, useState } from 'react';
import { api, fileToBase64, ApiError } from '@/lib/api';
import type { TemplateTarget } from '@/lib/templateTarget';
import { creditsForDuration } from '@/lib/templateTarget';
import { CAPTION_PRESETS, DEFAULT_CAPTION_PRESET_ID } from '@/lib/captionPresets';
import { CaptionPreview } from './CaptionPreview';
import { X, Upload, Sparkles, Wand2, User, Box } from 'lucide-react';

interface Props {
  target: TemplateTarget;
  onClose: () => void;
  /** Called with the created job (202) — the caller owns polling. */
  onStarted: (job: any) => void;
  onInsufficientCredits: (required: number) => void;
}

/**
 * The one input modal every template now uses. Unlike the old full studio
 * form (which let the user rewrite the whole scene), this keeps the
 * template's locked look and asks only for what makes the ad theirs:
 *   - product photo (required) + name + one line about it
 *   - a script they can auto-generate and edit (talking templates)
 *   - a free-text "tweaks" nudge for the action
 *   - a caption style (talking templates)
 *
 * Blueprints post to the blueprint endpoint; featured creators compile a
 * prompt and post to /ugc/generate with the creator fixed. Both land on
 * the same generating/done screens.
 */
export function TemplateModal({ target, onClose, onStarted, onInsufficientCredits }: Props) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [script, setScript] = useState(target.sampleScript ?? '');
  const [genScript, setGenScript] = useState(false);
  const [tweaks, setTweaks] = useState('');
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionPresetId, setCaptionPresetId] = useState(DEFAULT_CAPTION_PRESET_ID);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const talking = target.talking;
  const credits = creditsForDuration(target.durationSeconds);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setError('');
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    setRemoteUrl(null);
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await api.uploadAttachment(file.type || 'image/png', base64);
      setRemoteUrl(res.data.url);
    } catch (err: any) {
      setLocalPreview(null);
      URL.revokeObjectURL(preview);
      setError(
        err instanceof ApiError && err.status === 422
          ? err.message
          : 'Upload failed — try another photo.'
      );
    } finally {
      setUploading(false);
    }
  };

  const generateScript = async () => {
    setGenScript(true);
    setError('');
    try {
      if (target.kind === 'blueprint') {
        const res = await api.generateBlueprintScript(target.id, {
          productName: productName.trim() || undefined,
          productDescription: productDescription.trim() || undefined,
        });
        setScript(res.data.script);
      } else {
        const res = await api.generateScript({
          productName: productName.trim(),
          productDescription: productDescription.trim(),
          template: {
            name: target.name,
            actor_name: target.name,
            setting: target.setting || '',
            sample_script: target.sampleScript || '',
          },
          targetSeconds: target.durationSeconds,
        });
        setScript(res.data.script);
      }
    } catch (e: any) {
      setError('Could not generate a script. Edit or write your own.');
    } finally {
      setGenScript(false);
    }
  };

  const buildCreatorPrompt = () => {
    const p = productName.trim() || 'the product';
    const where = target.setting ? ` in ${target.setting}` : '';
    let s = `The creator holds up and shows ${p}${where}, speaking naturally and casually to the viewer about it. Keep the creator exactly as in the reference image — same face, hair, and outfit.`;
    if (tweaks.trim()) s += ` ${tweaks.trim()}`;
    return s;
  };

  const generate = async () => {
    if (!remoteUrl || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      let data;
      if (target.kind === 'blueprint') {
        ({ data } = await api.generateFromBlueprint(target.id, {
          productImageUrl: remoteUrl,
          productName: productName.trim() || undefined,
          productDescription: productDescription.trim() || undefined,
          script: talking ? script.trim() || undefined : undefined,
          tweaks: tweaks.trim() || undefined,
          captionsEnabled: talking ? captionsEnabled : undefined,
          captionPreset: talking && captionsEnabled ? captionPresetId : undefined,
        }));
      } else {
        ({ data } = await api.generateAd({
          prompt: buildCreatorPrompt(),
          attachmentUrls: [remoteUrl],
          creatorImageUrl: target.creatorImageUrl || undefined,
          script: script.trim(),
          creatorSpeaks: true,
          videoDuration: target.durationSeconds as 5 | 10,
          aspectRatio: target.aspectRatio,
          captionsEnabled,
          captionPreset: captionsEnabled ? captionPresetId : undefined,
        }));
      }
      onStarted(data);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 402) {
        onInsufficientCredits(credits);
        return;
      }
      setError(e.message || 'Generation failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${target.name} template`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-[fadeIn_0.18s_ease-out]"
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn  { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-card bg-[#101014] border border-white/10 shadow-2xl shadow-black/60 animate-[popIn_0.22s_ease-out]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-[#101014]/95 backdrop-blur border-b border-white/[0.06]">
          <div className="flex items-center gap-2 min-w-0">
            {target.kind === 'creator' ? (
              <User className="w-4 h-4 shrink-0 text-white/50" />
            ) : (
              <Box className="w-4 h-4 shrink-0 text-white/50" />
            )}
            <h3 className="font-display font-bold text-lg tracking-tight truncate">{target.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 shrink-0 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 pb-8 pt-5 space-y-6">
          {/* Product photo — the only required input */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2.5">
              Your product photo
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-full h-40 rounded-btn border border-dashed border-white/15 hover:border-white/35 bg-white/[0.03] flex flex-col items-center justify-center gap-2 overflow-hidden transition"
            >
              {localPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={localPreview} alt="" className="absolute inset-0 w-full h-full object-contain bg-black/40" />
              ) : (
                <>
                  <Upload className="w-5 h-5 text-white/50" />
                  <span className="text-sm text-white/60">Drop in your product photo</span>
                </>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                </div>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={pickFile}
              className="hidden"
            />
          </div>

          <input
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Product name (recommended)"
            className="w-full h-11 px-4 rounded-btn bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 transition"
          />
          <input
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            placeholder="One line about it (helps the script)"
            className="w-full h-11 px-4 rounded-btn bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 transition"
          />

          {/* Script — generate + edit (talking templates only) */}
          {talking && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Script
                </div>
                <button
                  type="button"
                  onClick={generateScript}
                  disabled={genScript}
                  className="text-xs inline-flex items-center gap-1.5 text-accent2 hover:text-white disabled:opacity-50"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  {genScript ? 'Writing…' : 'Generate with AI'}
                </button>
              </div>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="What the creator says. Generate one, or write your own."
                rows={3}
                className="w-full px-4 py-3 rounded-btn bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 transition resize-none"
              />
            </div>
          )}

          {/* Tweaks — free-text nudge, all templates */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
              Tweaks <span className="text-white/30 normal-case font-normal">· optional</span>
            </div>
            <input
              value={tweaks}
              onChange={(e) => setTweaks(e.target.value)}
              placeholder={talking ? 'e.g. have her smile and wave at the start' : 'e.g. slower spin, warmer lighting'}
              className="w-full h-11 px-4 rounded-btn bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 transition"
            />
          </div>

          {/* Captions on/off + style (talking templates only) */}
          {talking && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/50">
                  Captions
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={captionsEnabled}
                  onClick={() => setCaptionsEnabled((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    captionsEnabled ? 'bg-accent2' : 'bg-white/15'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                      captionsEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              {captionsEnabled && (
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                  {CAPTION_PRESETS.map((p) => (
                    <CaptionPreview
                      key={p.id}
                      preset={p}
                      selected={captionPresetId === p.id}
                      onSelect={() => setCaptionPresetId(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-btn bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={generate}
            disabled={!remoteUrl || uploading || submitting}
            className="w-full h-12 rounded-btn bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-white/90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition mt-2"
          >
            {submitting ? (
              <div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Generate — {credits} credits
          </button>
          <p className="text-center text-[11px] text-white/35">
            {target.durationSeconds}s vertical video
            {talking ? (captionsEnabled ? ' · captions included' : ' · no captions') : ' · silent product shot'}
          </p>
        </div>
      </div>
    </div>
  );
}
