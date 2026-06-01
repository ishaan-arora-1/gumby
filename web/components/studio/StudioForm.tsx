'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api, fileToBase64 } from '@/lib/api';
import type { UGCTemplate } from '@/lib/types';
import { Sparkles, Upload, X, Wand2 } from 'lucide-react';
import { CAPTION_PRESETS, DEFAULT_CAPTION_PRESET_ID } from '@/lib/captionPresets';
import { CaptionPreview } from './CaptionPreview';

export interface StudioPrefill {
  creatorDescription?: string;
  includeProduct?: boolean;
  productName?: string;
  productDescription?: string;
  videoDescription?: string;
  duration?: 5 | 10;
  // Filled in by the composer when the user attached an image — always
  // routed to the product slot now. The inspiration upload affordance
  // was removed across both clients.
  productImageUrl?: string | null;
}

interface Props {
  template: UGCTemplate | null;
  prefill?: StudioPrefill | null;
  onSubmit: (payload: any) => void;
  loading?: boolean;
}

export function StudioForm({ template, prefill, onSubmit, loading }: Props) {
  const [creatorDesc, setCreatorDesc] = useState(prefill?.creatorDescription ?? '');

  // Template-only: optional tweaks the user wants on the creator (e.g.
  // "same person but on a beach"). We keep the template creator's face
  // and identity locked, but pass these tweaks into the Nano Banana seed
  // image prompt so the rest of the scene can adapt.
  const [creatorTweaks, setCreatorTweaks] = useState('');

  // Product
  const [includeProduct, setIncludeProduct] = useState(prefill?.includeProduct ?? true);
  const [productName, setProductName] = useState(prefill?.productName ?? '');
  const [productDesc, setProductDesc] = useState(prefill?.productDescription ?? '');
  const [productTone, setProductTone] = useState('');
  const [productImageUrl, setProductImageUrl] = useState<string | null>(prefill?.productImageUrl ?? null);
  const [uploadingProduct, setUploadingProduct] = useState(false);

  // Direct-mode-only ethnicity hint. Defaults to the first option so
  // generation never blocks waiting on a click. Ignored in template mode.
  const ETHNICITY_OPTIONS: Array<'Indian' | 'American' | 'Asian'> = [
    'Indian', 'American', 'Asian',
  ];
  const [creatorEthnicity, setCreatorEthnicity] = useState<typeof ETHNICITY_OPTIONS[number]>('Indian');

  // Script / scene / duration
  const [script, setScript] = useState(template?.sample_script ?? '');
  const [videoDescription, setVideoDescription] = useState(prefill?.videoDescription ?? '');
  const [duration, setDuration] = useState<5 | 10>(prefill?.duration ?? 10);
  const [genScript, setGenScript] = useState(false);

  // "Talking creator" toggle. On by default — the creator speaks the
  // script. When off, the creator stays silent: we hide the script and
  // captions entirely and the backend renders a clean, no-audio clip
  // driven purely by the scene.
  const [creatorSpeaks, setCreatorSpeaks] = useState(true);

  // Captions — on by default. Backend burns word-by-word TikTok-style
  // captions in the Reels safe zone via whisper + libass when enabled.
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionPresetId, setCaptionPresetId] = useState<string>(DEFAULT_CAPTION_PRESET_ID);

  const handleProductImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingProduct(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await api.uploadProductImage(file.type, base64);
      setProductImageUrl(res.data.url);
    } catch (e) {
      console.error(e);
      alert('Upload failed');
    } finally {
      setUploadingProduct(false);
    }
  };

  const generateScriptAI = async () => {
    if (includeProduct && (!productName || !productDesc)) {
      alert('Add product name + description first');
      return;
    }
    setGenScript(true);
    try {
      const res = await api.generateScript({
        productName: includeProduct ? productName : '',
        productDescription: includeProduct ? productDesc : '',
        tone: productTone || undefined,
        template: template
          ? {
              name: template.name,
              actor_name: template.actor_name,
              setting: template.setting,
              sample_script: template.sample_script,
            }
          : {
              name: 'creator',
              actor_name: creatorDesc || 'Creator',
              setting: 'casual',
              sample_script: '',
            },
        targetSeconds: duration,
      });
      setScript(res.data.script);
    } catch (e) {
      console.error(e);
    } finally {
      setGenScript(false);
    }
  };

  const submit = () => {
    if (!template && !creatorDesc.trim()) {
      alert('Describe the creator for your video');
      return;
    }
    if (includeProduct && !productName.trim()) {
      alert('Add a product name (or turn off "Include product")');
      return;
    }
    if (!videoDescription.trim()) {
      alert("Describe the scene (what's the creator doing)");
      return;
    }
    if (creatorSpeaks && !script.trim()) {
      alert('Write or generate a script (or turn off "Talking creator")');
      return;
    }
    // When the creator stays silent there's no script, no audio and no
    // captions — we send empty/false so the backend renders a clean clip.
    const speaks = creatorSpeaks;
    onSubmit({
      templateId: template?.id ?? null,
      creatorDescription: template ? undefined : creatorDesc,
      creatorTweaks: template ? creatorTweaks.trim() || undefined : undefined,
      productName: includeProduct ? productName : '',
      productDescription: includeProduct ? productDesc : '',
      productImageUrl: includeProduct ? productImageUrl ?? undefined : undefined,
      creatorEthnicity: template ? undefined : creatorEthnicity,
      creatorSpeaks: speaks,
      script: speaks ? script : '',
      videoDescription,
      videoDuration: duration,
      captionsEnabled: speaks ? captionsEnabled : false,
      captionPreset: speaks && captionsEnabled ? captionPresetId : undefined,
    });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {!template && (
        <Section
          title="Creator"
          hint="Describe the person and the whole scene — who they are, where they are, the vibe."
        >
          <textarea
            value={creatorDesc}
            onChange={(e) => setCreatorDesc(e.target.value)}
            placeholder="20-year-old, friendly, in a kitchen, soft daylight…"
            rows={3}
            className={inputCls}
          />

          <div className="mt-2 space-y-2">
            <div className="text-[11px] uppercase tracking-[0.15em] text-white/45">
              Ethnicity
            </div>
            <div className="inline-flex bg-elevated rounded-pill p-0.5 text-xs">
              {ETHNICITY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCreatorEthnicity(option)}
                  className={`px-3 h-8 rounded-pill font-semibold transition ${
                    creatorEthnicity === option
                      ? 'bg-white text-black'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      {template && (
        <Section
          title="Creator tweaks"
          hint="Optional. Same creator, but with adjustments — e.g. on a beach, in casual streetwear, holding nothing."
        >
          <textarea
            value={creatorTweaks}
            onChange={(e) => setCreatorTweaks(e.target.value)}
            placeholder="Same person but outdoors on a sunny beach instead of indoors…"
            rows={2}
            className={inputCls}
          />
        </Section>
      )}

      <Section
        title="Product"
        hint={includeProduct ? 'What are you selling?' : 'Talking-head video — no product.'}
        action={
          <Toggle
            on={includeProduct}
            onToggle={() => setIncludeProduct((v) => !v)}
            label="Include product"
          />
        }
      >
        {includeProduct && (
          <>
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Product name"
              className={inputCls}
            />
            <textarea
              value={productDesc}
              onChange={(e) => setProductDesc(e.target.value)}
              placeholder="What is it and why is it special?"
              rows={3}
              className={inputCls}
            />
            <input
              value={productTone}
              onChange={(e) => setProductTone(e.target.value)}
              placeholder="Tone (optional) — e.g. excited, chill, sarcastic"
              className={inputCls}
            />
            <div className="flex items-center gap-3">
              {productImageUrl ? (
                <div className="relative w-16 h-16 rounded-btn overflow-hidden border border-white/10">
                  <img src={productImageUrl} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setProductImageUrl(null)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="inline-flex items-center gap-2 px-3 h-9 rounded-pill border border-white/10 text-xs text-white/70 hover:text-white hover:border-white/30 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingProduct ? 'Uploading…' : 'Add product image'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleProductImageUpload}
                    disabled={uploadingProduct}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </>
        )}
      </Section>

      <Section title="Duration" hint="Pick this first — the AI script will be sized to fit.">
        <div className="flex bg-elevated rounded-pill p-0.5 text-sm w-fit">
          {([5, 10] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={`px-5 h-9 rounded-pill font-semibold transition ${
                duration === d ? 'bg-white text-black' : 'text-white/60'
              }`}
            >
              {d}s
            </button>
          ))}
        </div>
      </Section>

      <Section title="Scene" hint="What's the creator doing?">
        <textarea
          value={videoDescription}
          onChange={(e) => setVideoDescription(e.target.value)}
          placeholder="Holding the bottle, glancing at it, smiling, soft daylight"
          rows={2}
          className={inputCls}
        />
      </Section>

      <Section
        title="Talking creator"
        hint={
          creatorSpeaks
            ? 'The creator speaks a script on camera.'
            : 'Silent video — the creator won’t speak. No script, no captions. Just the scene above.'
        }
        action={
          <Toggle
            on={creatorSpeaks}
            onToggle={() => setCreatorSpeaks((v) => !v)}
            label="Toggle talking creator"
          />
        }
      >
        {creatorSpeaks && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.15em] text-white/45">
                  Script
                </div>
                <button
                  type="button"
                  onClick={generateScriptAI}
                  disabled={genScript}
                  className="text-xs inline-flex items-center gap-1.5 text-accent2 hover:text-white"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  {genScript ? 'Writing…' : 'Generate with AI'}
                </button>
              </div>
              <div className="text-xs text-white/45 -mt-1">
                What does the creator say? Keep it tight — {duration}s of speech.
              </div>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Okay so I just got this thing and honestly…"
                rows={5}
                className={inputCls}
              />
            </div>

            <div className="space-y-2 pt-1 border-t border-white/[0.06]">
              <div className="flex items-center justify-between pt-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.15em] text-white/45">
                    Captions
                  </div>
                  <div className="text-xs text-white/45 mt-1">
                    {captionsEnabled
                      ? 'Pick the look. Captions burn into the Reels safe zone.'
                      : 'Clean video with no captions on screen.'}
                  </div>
                </div>
                <Toggle
                  on={captionsEnabled}
                  onToggle={() => setCaptionsEnabled((v) => !v)}
                  label="Toggle captions"
                />
              </div>
              {captionsEnabled ? (
                <div className="flex flex-wrap gap-4 pt-1">
                  {CAPTION_PRESETS.map((p) => (
                    <CaptionPreview
                      key={p.id}
                      preset={p}
                      selected={captionPresetId === p.id}
                      onSelect={() => setCaptionPresetId(p.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-xs text-white/45">Off</div>
              )}
            </div>
          </div>
        )}
      </Section>

      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="w-full h-14 rounded-btn bg-black text-white font-semibold text-base border border-white/10 hover:bg-[#0a0a0a] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {loading ? 'Generating…' : 'Generate'}
      </button>
    </div>
  );
}

const inputCls =
  'w-full bg-composerInner border border-white/[0.06] rounded-btn px-4 py-3 text-sm placeholder:text-placeholder focus:outline-none focus:border-accent2/50 resize-none';

/**
 * Pill toggle switch shared by every on/off control in the form
 * (product, talking creator, captions).
 *
 * `touchAction: 'manipulation'` + a generous tap target keep it reliably
 * tappable on mobile Safari/Chrome, where the previous inline buttons
 * sometimes swallowed taps.
 */
function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      style={{ touchAction: 'manipulation' }}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition select-none ${
        on ? 'bg-accent2' : 'bg-white/15'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white transition ${
          on ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Section({
  title,
  hint,
  children,
  action,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-card bg-studio border border-white/[0.06] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">{title}</div>
          {hint && <div className="text-xs text-white/45 mt-0.5">{hint}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
