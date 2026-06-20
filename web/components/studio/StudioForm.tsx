'use client';
import { useState } from 'react';
import { api, fileToBase64, ApiError } from '@/lib/api';
import { Upload, X, Wand2 } from 'lucide-react';
import { CAPTION_PRESETS, DEFAULT_CAPTION_PRESET_ID } from '@/lib/captionPresets';
import { CaptionPreview } from './CaptionPreview';
import { RightsConfirmModal } from './RightsConfirmModal';
import { hasUnconfirmedImages, markImagesConfirmed } from '@/lib/imageRights';

// Credit cost per video duration — mirrors COST_PER_VIDEO in the backend
// (backend/src/services/credits.js). 5s = 50, 10s = 100, 15s = 150.
const CREDIT_COST: Record<5 | 10 | 15, number> = { 5: 50, 10: 100, 15: 150 };

// Match the composer's cap so the studio form behaves identically.
const MAX_ATTACHMENTS = 5;

export interface StudioPrefill {
  prompt?: string;
  attachmentUrls?: string[];
  duration?: 5 | 10 | 15;
  aspectRatio?: '9:16' | '16:9' | '1:1';
  // Set when the user arrived from a template / "use as template". The
  // creator is fixed to this person; the user adds product images + prompt
  // exactly like the normal flow.
  creator?: {
    imageUrl: string;
    name?: string;
    sampleScript?: string;
  } | null;
}

interface Props {
  prefill?: StudioPrefill | null;
  onSubmit: (payload: any) => void;
  loading?: boolean;
}

export interface AttachmentState {
  id: string;
  localPreviewUrl: string | null; // null when it came from the composer (no File on hand)
  remoteUrl: string;
  uploading: boolean;
}

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `att-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatUploadError(e: unknown): string {
  if (e instanceof ApiError) {
    // 422 = rejected by the server-side image moderation gate. The message
    // is already user-facing ("appears to contain nudity…"), so surface it
    // verbatim rather than wrapping it in a status code.
    if (e.status === 422) return e.message;
    if (e.status === 413) return 'Image too large — try one under ~15MB.';
    if (e.status === 401 || e.status === 403) return 'Session expired. Sign in again and retry.';
    if (e.status === 0) return 'Could not reach the server. Check your backend is running.';
    return `Upload failed (${e.status}): ${e.message}`;
  }
  return `Upload failed: ${(e as any)?.message || 'unknown error'}`;
}

export function StudioForm({ prefill, onSubmit, loading }: Props) {
  // Fixed template creator (from a template / "use as template"). When set,
  // the ad uses this exact person and the user just adds product images +
  // the prompt. Stays for the life of this form instance.
  const [creator] = useState(prefill?.creator ?? null);

  // The single source of truth: the user's prompt + the attached
  // references. Everything else is just finishing options.
  const [prompt, setPrompt] = useState(prefill?.prompt ?? '');
  const [attachments, setAttachments] = useState<AttachmentState[]>(
    (prefill?.attachmentUrls ?? []).map((url) => ({
      id: makeId(),
      localPreviewUrl: null,
      remoteUrl: url,
      uploading: false,
    }))
  );

  // Aspect ratio and duration carry over from the composer; the user
  // can still tweak them here.
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>(
    prefill?.aspectRatio ?? '9:16'
  );
  const [duration, setDuration] = useState<5 | 10 | 15>(prefill?.duration ?? 10);

  // Talking creator (default ON): the creator speaks a script on camera
  // and Kling renders the audio + lip-sync inline. When off, the creator
  // is silent — no script, no captions.
  const [creatorSpeaks, setCreatorSpeaks] = useState(true);
  // Templates ship a sample script — pre-fill it as a starting point.
  const [script, setScript] = useState(prefill?.creator?.sampleScript ?? '');
  const [genScript, setGenScript] = useState(false);

  // Captions (default ON when speaking) — whisper transcribes the Kling
  // audio and burns word-by-word captions in the Reels safe zone.
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionPresetId, setCaptionPresetId] = useState<string>(DEFAULT_CAPTION_PRESET_ID);

  // Rights-confirmation gate for generations that use uploaded images.
  const [showRightsModal, setShowRightsModal] = useState(false);

  const fileInputId = 'studio-form-attachment-input';

  const uploadingAny = attachments.some((a) => a.uploading);

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = '';
    if (!files.length) return;
    const slotsLeft = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    const accepted = files.slice(0, slotsLeft);
    for (const file of accepted) {
      const id = makeId();
      const localPreviewUrl = URL.createObjectURL(file);
      setAttachments((prev) => [
        ...prev,
        { id, localPreviewUrl, remoteUrl: '', uploading: true },
      ]);
      try {
        const base64 = await fileToBase64(file);
        const res = await api.uploadAttachment(file.type || 'image/png', base64);
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, remoteUrl: res.data.url, uploading: false }
              : a
          )
        );
      } catch (err) {
        console.error('attachment upload failed', err);
        alert(formatUploadError(err));
        setAttachments((prev) => prev.filter((a) => a.id !== id));
        URL.revokeObjectURL(localPreviewUrl);
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id);
      if (found?.localPreviewUrl) URL.revokeObjectURL(found.localPreviewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const generateScriptAI = async () => {
    if (!prompt.trim()) {
      alert('Write the prompt first — the AI uses it to draft the script.');
      return;
    }
    setGenScript(true);
    try {
      const res = await api.generateScript({
        productName: '',
        productDescription: prompt.trim().slice(0, 800),
        template: {
          name: 'unified',
          actor_name: 'Creator',
          setting: 'as described in the user prompt',
          sample_script: '',
        },
        targetSeconds: duration,
      });
      setScript(res.data.script);
    } catch (e) {
      console.error(e);
      alert('Could not generate a script. Try again or write your own.');
    } finally {
      setGenScript(false);
    }
  };

  const submit = () => {
    if (loading) return;
    if (prompt.trim().length < 8) {
      alert('Describe the scene in a sentence or two.');
      return;
    }
    if (uploadingAny) {
      alert('Wait for your images to finish uploading.');
      return;
    }
    if (creatorSpeaks && !script.trim()) {
      alert('Write or generate a script (or turn off "Talking creator").');
      return;
    }

    const remoteUrls = attachments
      .map((a) => a.remoteUrl)
      .filter((u): u is string => !!u);

    // Rights gate — re-ask whenever the user is about to generate with an
    // image they haven't yet confirmed. Already-confirmed images don't
    // re-prompt, but adding a NEW image makes the next send ask again.
    if (hasUnconfirmedImages(remoteUrls)) {
      setShowRightsModal(true);
      return;
    }
    doSubmit(remoteUrls);
  };

  // The actual generation dispatch. We send plain image URLs; the backend
  // classifies each image's role (creator / product / background / style)
  // itself and routes accordingly.
  const doSubmit = (remoteUrls: string[]) => {
    onSubmit({
      prompt: prompt.trim(),
      attachmentUrls: remoteUrls,
      // Template creator (if any) goes as a known creator image.
      creatorImageUrl: creator?.imageUrl ?? undefined,
      script: creatorSpeaks ? script : '',
      creatorSpeaks,
      videoDuration: duration,
      aspectRatio,
      captionsEnabled: creatorSpeaks ? captionsEnabled : false,
      captionPreset: creatorSpeaks && captionsEnabled ? captionPresetId : undefined,
    });
  };

  const onRightsConfirmed = () => {
    setShowRightsModal(false);
    const remoteUrls = attachments
      .map((a) => a.remoteUrl)
      .filter((u): u is string => !!u);
    // Remember exactly these images as confirmed so we don't re-ask for
    // them — but a future newly-uploaded image stays unconfirmed and will
    // re-trigger the modal on the next send.
    markImagesConfirmed(remoteUrls);
    doSubmit(remoteUrls);
  };

  const attachmentCount = attachments.filter((a) => !!a.remoteUrl).length;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <RightsConfirmModal
        open={showRightsModal}
        imageCount={attachmentCount}
        onConfirm={onRightsConfirmed}
        onClose={() => setShowRightsModal(false)}
      />

      {/* Fixed template creator (from a template / "use as template"). The
          rest of the form works exactly like the normal flow. */}
      {creator && (
        <div className="rounded-card bg-studio border border-white/[0.06] p-4 flex items-center gap-4">
          <div className="w-14 h-18 rounded-btn overflow-hidden bg-elevated shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={creator.imageUrl} alt="" className="w-14 h-[72px] object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Creator
            </div>
            <div className="font-bold truncate">{creator.name || 'Selected creator'}</div>
            <div className="text-[11px] text-white/45 mt-0.5">
              Your ad will star this creator. Add your product and describe the scene below.
            </div>
          </div>
        </div>
      )}

      {/* PROMPT + REFERENCES — the single, unified input */}
      <Section
        title="Your product ad"
        hint={
          creator
            ? 'Upload your product and describe what this creator should do.'
            : 'Upload your product and describe the ad: the creator, the setting, the action.'
        }
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            creator
              ? 'She holds my product up, smiles, and says how much she loves it. Bright, cozy setting.'
              : 'The first image is the product (a temple necklace). Render a young Indian woman in a traditional silk saree wearing it, in a heritage haveli courtyard. She holds the necklace, smiles, looks at the camera.'
          }
          rows={6}
          className={inputCls}
        />

        {/* Attached references grid */}
        {attachments.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="relative aspect-square rounded-btn overflow-hidden border border-white/10 bg-elevated"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.localPreviewUrl || a.remoteUrl}
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
                  aria-label="Remove reference"
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <label
            htmlFor={fileInputId}
            className={`inline-flex items-center gap-2 px-3 h-9 rounded-pill border border-white/10 text-xs hover:text-white hover:border-white/30 cursor-pointer ${
              attachments.length >= MAX_ATTACHMENTS
                ? 'opacity-40 cursor-not-allowed text-white/40'
                : 'text-white/70'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            {attachments.length === 0 ? 'Add reference images' : 'Add another'}
            <input
              id={fileInputId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={onPickFiles}
              disabled={attachments.length >= MAX_ATTACHMENTS}
              className="hidden"
            />
          </label>
          <span className="text-[11px] text-white/40">
            Up to {MAX_ATTACHMENTS} images. PNG, JPEG, or WebP.
          </span>
        </div>
      </Section>

      {/* DURATION + ASPECT */}
      <Section title="Format" hint="Duration and aspect ratio for the rendered clip.">
        <div className="flex flex-wrap gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.15em] text-white/45 mb-2">
              Duration
            </div>
            <div className="flex bg-elevated rounded-pill p-0.5 text-sm w-fit">
              {([5, 10, 15] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`px-5 h-9 rounded-pill font-semibold transition ${
                    duration === d ? 'bg-white text-black' : 'text-white/60'
                  }`}
                >
                  {d}s
                  <span className="ml-1.5 font-normal opacity-60">
                    · {CREDIT_COST[d]} credits
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.15em] text-white/45 mb-2">
              Aspect
            </div>
            <div className="flex bg-elevated rounded-pill p-0.5 text-sm w-fit">
              {(['9:16', '1:1', '16:9'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAspectRatio(a)}
                  className={`px-4 h-9 rounded-pill font-semibold transition ${
                    aspectRatio === a ? 'bg-white text-black' : 'text-white/60'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* TALKING CREATOR */}
      <Section
        title="Talking creator"
        hint={
          creatorSpeaks
            ? 'The creator speaks a script on camera.'
            : 'Silent video — the creator won’t speak. No script, no captions.'
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
                {duration}s of speech — keep it tight.
              </div>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Okay so I just got this and honestly…"
                rows={5}
                className={inputCls}
              />
            </div>

            {/* Captions */}
            <div className="space-y-2 pt-1 border-t border-white/[0.06]">
              <div className="flex items-center justify-between pt-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.15em] text-white/45">
                    Captions
                  </div>
                  <div className="text-xs text-white/45 mt-1">
                    {captionsEnabled
                      ? 'Pick the look — captions burn into the Reels safe zone.'
                      : 'Clean video with no captions on screen.'}
                  </div>
                </div>
                <Toggle
                  on={captionsEnabled}
                  onToggle={() => setCaptionsEnabled((v) => !v)}
                  label="Toggle captions"
                />
              </div>
              {captionsEnabled && (
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
              )}
            </div>
          </div>
        )}
      </Section>

      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="w-full h-14 rounded-btn bg-black text-white font-semibold text-base border border-white/10 hover:bg-[#0a0a0a] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition inline-flex items-center justify-center gap-2"
      >
        {loading ? (
          'Generating…'
        ) : (
          <>
            <span>Generate</span>
            <span className="text-xs font-medium text-white/70 bg-white/10 rounded-full px-2 py-0.5">
              {CREDIT_COST[duration]} credits
            </span>
          </>
        )}
      </button>
    </div>
  );
}

const inputCls =
  'w-full bg-composerInner border border-white/[0.06] rounded-btn px-4 py-3 text-sm placeholder:text-placeholder focus:outline-none focus:border-accent2/50 resize-none';

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
      className="relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full select-none -my-2.5"
    >
      <span
        className={`pointer-events-none relative inline-flex h-6 w-11 items-center rounded-full transition ${
          on ? 'bg-accent2' : 'bg-white/15'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
            on ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
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
