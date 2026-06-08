'use client';
import { useState, useRef } from 'react';
import { Sparkles, ArrowUp, Paperclip, X } from 'lucide-react';
import { api, fileToBase64 } from '@/lib/api';

export interface ComposerAttachment {
  id: string;
  localPreviewUrl: string;
  remoteUrl: string | null;
  uploading: boolean;
}

interface Props {
  onSubmit: (
    prompt: string,
    opts: {
      aspectRatio: '9:16' | '1:1' | '16:9';
      durationSeconds: 5 | 10;
      attachmentUrls: string[];
    }
  ) => void;
  loading?: boolean;
}

const MAX_ATTACHMENTS = 5;

const SUGGESTIONS = [
  '20-year-old skincare creator unboxing serum in her kitchen, daylight',
  'Hype-y fitness creator in a gym holding a protein shake, neon lights',
  'Cozy lifestyle creator on a couch sipping artisan coffee, golden hour',
  'Tech creator at a clean desk holding a sleek gadget, soft studio light',
];

export function PromptComposer({ onSubmit, loading }: Props) {
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<'9:16' | '1:1' | '16:9'>('9:16');
  const [dur, setDur] = useState<5 | 10>(10);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploading = attachments.some((a) => a.uploading);
  const uploadedUrls = attachments
    .map((a) => a.remoteUrl)
    .filter((u): u is string => !!u);

  const submit = () => {
    if (prompt.trim().length < 10) return;
    if (uploading) return;
    onSubmit(prompt.trim(), {
      aspectRatio: aspect,
      durationSeconds: dur,
      attachmentUrls: uploadedUrls,
    });
  };

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = ''; // allow re-picking the same file later
    if (!files.length) return;

    // Honor MAX_ATTACHMENTS — silently drop overflow rather than erroring.
    const slotsLeft = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    const accepted = files.slice(0, slotsLeft);

    for (const file of accepted) {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const localPreviewUrl = URL.createObjectURL(file);
      setAttachments((prev) => [
        ...prev,
        { id, localPreviewUrl, remoteUrl: null, uploading: true },
      ]);
      try {
        const base64 = await fileToBase64(file);
        const res = await api.uploadAttachment(file.type || 'image/png', base64);
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, remoteUrl: res.data.url, uploading: false } : a
          )
        );
      } catch (err) {
        console.error('attachment upload failed', err);
        setAttachments((prev) => prev.filter((a) => a.id !== id));
        URL.revokeObjectURL(localPreviewUrl);
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id);
      if (found) URL.revokeObjectURL(found.localPreviewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  return (
    // `isolate` creates a local stacking context so the glow's z-index can't
    // escape upward into the AppShell's opaque bg-canvas (which previously
    // ate the gradient on the second paint).
    <div className="relative isolate w-full max-w-3xl mx-auto">
      {/* Gemini-style radial blue glow biased above the composer so it
          surrounds the textarea and tapers off before reaching the
          suggestion chips below. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[22%] z-0 h-[180%] w-[220%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            'radial-gradient(ellipse 50% 50% at center, rgba(59, 130, 246, 0.65) 0%, rgba(37, 99, 235, 0.40) 22%, rgba(30, 58, 138, 0.22) 45%, rgba(15, 23, 42, 0.08) 65%, rgba(0, 0, 0, 0) 80%)',
          filter: 'blur(80px)',
        }}
      />
      <div className="relative z-10 rounded-card bg-composer border border-white/[0.08] p-2 shadow-2xl shadow-black/40">
        <div className="bg-composerInner rounded-[14px] p-4">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="relative w-12 h-12 rounded-btn overflow-hidden border border-white/10 bg-elevated"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.localPreviewUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  {a.uploading && (
                    <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    aria-label="Remove attachment"
                    className="absolute top-0 right-0 w-4 h-4 rounded-bl-btn bg-black/70 flex items-center justify-center"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Describe the video you want — the creator, the product, the vibe."
            rows={3}
            className="w-full bg-transparent text-[15px] placeholder:text-placeholder resize-none focus:outline-none leading-relaxed"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-1 border-t border-white/5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= MAX_ATTACHMENTS}
                aria-label="Attach image"
                title={
                  attachments.length >= MAX_ATTACHMENTS
                    ? `Up to ${MAX_ATTACHMENTS} images`
                    : 'Attach image'
                }
                className="h-7 w-7 rounded-pill bg-elevated border border-white/10 text-white/70 flex items-center justify-center hover:text-white hover:border-white/25 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={onPickFiles}
                className="hidden"
              />
              <div className="flex bg-elevated rounded-pill p-0.5 text-xs">
                {(['9:16', '1:1', '16:9'] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAspect(a)}
                    className={`px-3 h-7 rounded-pill font-semibold transition ${
                      aspect === a
                        ? 'bg-white text-black'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <div className="flex bg-elevated rounded-pill p-0.5 text-xs">
                {([5, 10] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDur(d)}
                    className={`px-3 h-7 rounded-pill font-semibold transition ${
                      dur === d ? 'bg-white text-black' : 'text-white/60'
                    }`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={submit}
              disabled={loading || uploading || prompt.trim().length < 10}
              aria-label="Send"
              title={uploading ? 'Waiting for image upload…' : undefined}
              className="h-10 w-10 rounded-full bg-white/10 border border-white/15 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/15 active:scale-95 transition"
            >
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-12 flex flex-wrap gap-2 justify-center">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setPrompt(s)}
            className="text-xs px-3 py-1.5 rounded-pill border border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:border-white/25 transition"
          >
            <Sparkles className="w-3 h-3 inline mr-1.5 text-accent2" />
            {s.length > 60 ? s.slice(0, 60) + '…' : s}
          </button>
        ))}
      </div>
    </div>
  );
}
