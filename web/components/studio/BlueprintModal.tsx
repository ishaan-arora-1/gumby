'use client';
import { useEffect, useRef, useState } from 'react';
import { api, fileToBase64, ApiError } from '@/lib/api';
import type { Blueprint } from '@/lib/types';
import { X, Upload, Sparkles, User, Box } from 'lucide-react';

interface Props {
  blueprint: Blueprint;
  onClose: () => void;
  /** Called with the created job (202 response) — the caller owns polling. */
  onStarted: (job: any) => void;
  onInsufficientCredits: (required: number) => void;
}

const creditsFor = (seconds: number) =>
  seconds >= 13 ? 150 : seconds >= 8 ? 100 : 50;

/**
 * The whole pitch of a blueprint is "one photo, nothing else to decide" —
 * so this modal is intentionally tiny: product photo (required), product
 * name (optional but recommended), one optional detail line, Generate.
 */
export function BlueprintModal({
  blueprint,
  onClose,
  onStarted,
  onInsufficientCredits,
}: Props) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

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

  const generate = async () => {
    if (!remoteUrl || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.generateFromBlueprint(blueprint.id, {
        productImageUrl: remoteUrl,
        productName: productName.trim() || undefined,
        productDescription: productDescription.trim() || undefined,
      });
      onStarted(data);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 402) {
        onInsufficientCredits(creditsFor(blueprint.duration_seconds));
        return;
      }
      setError(e.message || 'Generation failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const [c1, c2] = blueprint.accent;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${blueprint.name} template`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-[fadeIn_0.18s_ease-out]"
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn  { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-card bg-[#101014] border border-white/10 shadow-2xl shadow-black/60 overflow-hidden animate-[popIn_0.22s_ease-out]"
      >
        {/* Header with the blueprint's identity gradient */}
        <div
          className="relative px-6 pt-6 pb-5"
          style={{
            background: `radial-gradient(140% 120% at 0% 0%, ${c1}40 0%, transparent 55%), radial-gradient(140% 120% at 100% 100%, ${c2}45 0%, transparent 60%)`,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-2">
            {blueprint.has_creator ? <User className="w-3 h-3" /> : <Box className="w-3 h-3" />}
            {blueprint.format}
          </div>
          <h3 className="font-display font-bold text-2xl tracking-tight">
            {blueprint.name}
          </h3>
          <p className="text-sm text-white/60 mt-1">{blueprint.tagline}</p>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-4">
          {/* Product photo — the only required input */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">
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
                  <span className="text-sm text-white/60">
                    Drop in your product photo
                  </span>
                  <span className="text-[11px] text-white/35">
                    That&apos;s all this template needs
                  </span>
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
          {blueprint.creator_speaks && (
            <input
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              placeholder="One line about it — we write the script (optional)"
              className="w-full h-11 px-4 rounded-btn bg-white/[0.04] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 transition"
            />
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
            className="w-full h-12 rounded-btn bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-white/90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {submitting ? (
              <div className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Generate — {creditsFor(blueprint.duration_seconds)} credits
          </button>
          <p className="text-center text-[11px] text-white/35">
            {blueprint.duration_seconds}s vertical video ·{' '}
            {blueprint.creator_speaks
              ? 'script written for you, captions included'
              : 'silent cinematic product shot'}
          </p>
        </div>
      </div>
    </div>
  );
}
