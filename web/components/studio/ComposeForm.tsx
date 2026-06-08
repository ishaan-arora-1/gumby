'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Wand2 } from 'lucide-react';
import { CAPTION_PRESETS, DEFAULT_CAPTION_PRESET_ID } from '@/lib/captionPresets';
import { CaptionPreview } from './CaptionPreview';

const CREDIT_COST: Record<5 | 10, number> = { 5: 50, 10: 100 };

// Bolna-backed voice options. Provider + language + a voice id/name. These map
// to the backend's voiceProvider / voiceLanguage / voiceId, which only take
// effect when BOLNA_API_KEY is configured (otherwise Kling inline audio).
const VOICE_PROVIDERS = ['elevenlabs', 'sarvam', 'cartesia'] as const;
const VOICE_LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'Hindi' },
  { id: 'ta', label: 'Tamil' },
  { id: 'te', label: 'Telugu' },
] as const;

export interface ComposeImage {
  url: string;
  role: string; // creator | product | background | other
}
export interface ComposeData {
  images: ComposeImage[];
  compose: {
    creatorImageUrl?: string | null;
    productImageUrl?: string | null;
    backgroundImageUrl?: string | null;
    instruction?: string;
  };
  instruction: string;
  videoDescription?: string;
  duration?: 5 | 10;
}

const ROLE_LABEL: Record<string, string> = {
  creator: 'Creator',
  product: 'Product',
  background: 'Background',
  other: 'Reference',
};
const ROLE_COLOR: Record<string, string> = {
  creator: 'bg-accent2 text-black',
  product: 'bg-white text-black',
  background: 'bg-emerald-400 text-black',
  other: 'bg-white/20 text-white',
};

interface Props {
  data: ComposeData;
  onSubmit: (payload: any) => void;
  loading?: boolean;
}

export function ComposeForm({ data, onSubmit, loading }: Props) {
  const [overview, setOverview] = useState(data.instruction || '');
  const [duration, setDuration] = useState<5 | 10>(data.duration ?? 10);

  const [creatorSpeaks, setCreatorSpeaks] = useState(true);
  const [script, setScript] = useState('');
  const [genScript, setGenScript] = useState(false);

  const [voiceProvider, setVoiceProvider] = useState<(typeof VOICE_PROVIDERS)[number]>('elevenlabs');
  const [voiceLanguage, setVoiceLanguage] = useState<string>('en');
  const [voiceId, setVoiceId] = useState('');

  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionPresetId, setCaptionPresetId] = useState<string>(DEFAULT_CAPTION_PRESET_ID);

  const generateScriptAI = async () => {
    setGenScript(true);
    try {
      const res = await api.generateScript({
        productName: '',
        productDescription: '',
        tone: overview || undefined,
        template: { name: 'creator', actor_name: 'Creator', setting: 'casual', sample_script: '' },
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
    if (loading) return;
    if (!overview.trim()) {
      alert('Tell us what you want done with your uploads');
      return;
    }
    if (creatorSpeaks && !script.trim()) {
      alert('Write or generate a script (or turn off "Talking creator")');
      return;
    }
    const speaks = creatorSpeaks;
    onSubmit({
      // Compose mode — the backend classifies + composes from these images.
      compose: { ...data.compose, instruction: overview.trim() },
      productName: '',
      productDescription: '',
      creatorSpeaks: speaks,
      script: speaks ? script : '',
      // The overview doubles as the scene/action guidance for Kling.
      videoDescription: overview.trim(),
      videoDuration: duration,
      captionsEnabled: speaks ? captionsEnabled : false,
      captionPreset: speaks && captionsEnabled ? captionPresetId : undefined,
      // Bolna voice selection (only used when BOLNA_API_KEY is set).
      voiceProvider: speaks ? voiceProvider : undefined,
      voiceLanguage: speaks ? voiceLanguage : undefined,
      voiceId: speaks && voiceId.trim() ? voiceId.trim() : undefined,
    });
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Uploaded images + how we read each one */}
      <Section
        title="Your uploads"
        hint="We read each image and figure out which is the creator, product, or background from your prompt below."
      >
        <div className="flex flex-wrap gap-3">
          {data.images.map((img, i) => (
            <div key={i} className="relative">
              <div className="w-20 h-20 rounded-btn overflow-hidden border border-white/10">
                <img src={img.url} alt="" className="w-full h-full object-cover" />
              </div>
              <span
                className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-pill text-[10px] font-bold whitespace-nowrap ${
                  ROLE_COLOR[img.role] || ROLE_COLOR.other
                }`}
              >
                {ROLE_LABEL[img.role] || ROLE_LABEL.other}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* The single overview prompt */}
      <Section
        title="What do you want?"
        hint="Describe it in plain words — e.g. “take the product from the first pic, put it on the creator in the second, in the background of the third.”"
      >
        <textarea
          value={overview}
          onChange={(e) => setOverview(e.target.value)}
          placeholder="Take the serum from the first image and have the creator hold it, in the kitchen from the third image…"
          rows={4}
          className={inputCls}
        />
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
              <span className="ml-1.5 font-normal opacity-60">· {CREDIT_COST[d]} credits</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Talking creator — optimized for Bolna */}
      <Section
        title="Talking creator"
        hint={
          creatorSpeaks
            ? 'The creator speaks a script. Voice is generated with Bolna.'
            : 'Silent video — no script, no captions.'
        }
        action={<Toggle on={creatorSpeaks} onToggle={() => setCreatorSpeaks((v) => !v)} label="Toggle talking creator" />}
      >
        {creatorSpeaks && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.15em] text-white/45">Script</div>
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
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder="Okay so I just got this and honestly…"
                rows={4}
                className={inputCls}
              />
            </div>

            {/* Bolna voice controls */}
            <div className="space-y-3 pt-1 border-t border-white/[0.06]">
              <div className="text-[11px] uppercase tracking-[0.15em] text-white/45 pt-3">
                Voice <span className="normal-case tracking-normal text-white/30">· Bolna</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {VOICE_PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setVoiceProvider(p)}
                    className={`px-3 h-8 rounded-pill text-xs font-semibold capitalize transition ${
                      voiceProvider === p ? 'bg-white text-black' : 'bg-elevated text-white/60 hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {VOICE_LANGUAGES.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setVoiceLanguage(l.id)}
                    className={`px-3 h-8 rounded-pill text-xs font-semibold transition ${
                      voiceLanguage === l.id ? 'bg-accent2 text-black' : 'bg-elevated text-white/60 hover:text-white'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
              <input
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
                placeholder="Voice id / name (optional) — e.g. a specific ElevenLabs voice"
                className={inputCls}
              />
            </div>

            {/* Captions */}
            <div className="space-y-2 pt-1 border-t border-white/[0.06]">
              <div className="flex items-center justify-between pt-3">
                <div className="text-[11px] uppercase tracking-[0.15em] text-white/45">Captions</div>
                <Toggle on={captionsEnabled} onToggle={() => setCaptionsEnabled((v) => !v)} label="Toggle captions" />
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

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
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
