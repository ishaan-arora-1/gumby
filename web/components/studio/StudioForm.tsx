'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { api, fileToBase64 } from '@/lib/api';
import type { UGCTemplate } from '@/lib/types';
import { Sparkles, Upload, X, Wand2, Image as ImageIcon } from 'lucide-react';

export interface StudioPrefill {
  creatorDescription?: string;
  includeProduct?: boolean;
  productName?: string;
  productDescription?: string;
  videoDescription?: string;
  duration?: 5 | 10;
}

interface Props {
  template: UGCTemplate | null;
  prefill?: StudioPrefill | null;
  onSubmit: (payload: any) => void;
  loading?: boolean;
}

export function StudioForm({ template, prefill, onSubmit, loading }: Props) {
  const [creatorDesc, setCreatorDesc] = useState(prefill?.creatorDescription ?? '');

  // Product
  const [includeProduct, setIncludeProduct] = useState(prefill?.includeProduct ?? true);
  const [productName, setProductName] = useState(prefill?.productName ?? '');
  const [productDesc, setProductDesc] = useState(prefill?.productDescription ?? '');
  const [productTone, setProductTone] = useState('');
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [uploadingProduct, setUploadingProduct] = useState(false);

  // Inspiration
  const [inspirationImageUrl, setInspirationImageUrl] = useState<string | null>(null);
  const [uploadingInspiration, setUploadingInspiration] = useState(false);

  // Script / scene / duration
  const [script, setScript] = useState(template?.sample_script ?? '');
  const [videoDescription, setVideoDescription] = useState(prefill?.videoDescription ?? '');
  const [duration, setDuration] = useState<5 | 10>(prefill?.duration ?? 10);
  const [genScript, setGenScript] = useState(false);

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

  const handleInspirationImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingInspiration(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await api.uploadInspirationImage(file.type, base64);
      setInspirationImageUrl(res.data.url);
    } catch (e) {
      console.error(e);
      alert('Upload failed');
    } finally {
      setUploadingInspiration(false);
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
    if (!script.trim()) {
      alert('Write or generate a script');
      return;
    }
    if (!videoDescription.trim()) {
      alert("Describe the scene (what's happening on camera)");
      return;
    }
    onSubmit({
      templateId: template?.id ?? null,
      creatorDescription: template ? undefined : creatorDesc,
      productName: includeProduct ? productName : '',
      productDescription: includeProduct ? productDesc : '',
      productImageUrl: includeProduct ? productImageUrl ?? undefined : undefined,
      inspirationImageUrl: inspirationImageUrl ?? undefined,
      script,
      videoDescription,
      videoDuration: duration,
    });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {!template && (
        <Section title="Creator" hint="Describe the person you want.">
          <textarea
            value={creatorDesc}
            onChange={(e) => setCreatorDesc(e.target.value)}
            placeholder="20-year-old, friendly, in a kitchen, soft daylight…"
            rows={3}
            className={inputCls}
          />
        </Section>
      )}

      <Section
        title="Product"
        hint={includeProduct ? 'What are you selling?' : 'Talking-head video — no product.'}
        action={
          <button
            type="button"
            onClick={() => setIncludeProduct((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              includeProduct ? 'bg-accent2' : 'bg-white/15'
            }`}
            aria-label="Include product"
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                includeProduct ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
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

      <Section
        title="Inspiration"
        hint="Optional. A reference photo of the scene you want."
      >
        <div className="flex items-center gap-3">
          {inspirationImageUrl ? (
            <div className="relative w-20 h-20 rounded-btn overflow-hidden border border-white/10">
              <img src={inspirationImageUrl} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => setInspirationImageUrl(null)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <label className="inline-flex items-center gap-2 px-3 h-9 rounded-pill border border-white/10 text-xs text-white/70 hover:text-white hover:border-white/30 cursor-pointer">
              <ImageIcon className="w-3.5 h-3.5" />
              {uploadingInspiration ? 'Uploading…' : 'Add inspiration image'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleInspirationImageUpload}
                disabled={uploadingInspiration}
                className="hidden"
              />
            </label>
          )}
        </div>
      </Section>

      <Section
        title="Script"
        hint="What does the creator say?"
        action={
          <button
            onClick={generateScriptAI}
            disabled={genScript}
            className="text-xs inline-flex items-center gap-1.5 text-accent2 hover:text-white"
          >
            <Wand2 className="w-3.5 h-3.5" />
            {genScript ? 'Writing…' : 'Generate with AI'}
          </button>
        }
      >
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Okay so I just got this thing and honestly…"
          rows={5}
          className={inputCls}
        />
      </Section>

      <Section title="Scene" hint="What's happening on camera?">
        <textarea
          value={videoDescription}
          onChange={(e) => setVideoDescription(e.target.value)}
          placeholder="Holding the bottle up, smiling, soft daylight"
          rows={2}
          className={inputCls}
        />
      </Section>

      <Section title="Duration">
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

      <Button
        variant="gradient"
        size="xl"
        className="w-full"
        onClick={submit}
        disabled={loading}
      >
        {loading ? 'Generating…' : (
          <>
            <Sparkles className="w-4 h-4" /> Generate ad
          </>
        )}
      </Button>
    </div>
  );
}

const inputCls =
  'w-full bg-composerInner border border-white/[0.06] rounded-btn px-4 py-3 text-sm placeholder:text-placeholder focus:outline-none focus:border-accent2/50 resize-none';

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
