'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, pollJob, ApiError } from '@/lib/api';
import type { Blueprint, UGCJob, UGCTemplate } from '@/lib/types';
import { PromptComposer } from '@/components/studio/PromptComposer';
import { TemplateCard } from '@/components/studio/TemplateCard';
import { BlueprintCard } from '@/components/studio/BlueprintCard';
import { TemplatePreviewModal } from '@/components/studio/TemplatePreviewModal';
import { TemplateModal } from '@/components/studio/TemplateModal';
import {
  type TemplateTarget,
  targetFromBlueprint,
  targetFromCreator,
  templatePriorityKey,
  templateRank,
} from '@/lib/templateTarget';
import { StudioForm, type StudioPrefill } from '@/components/studio/StudioForm';
import { GeneratingCard } from '@/components/studio/GeneratingCard';
import { VideoResult } from '@/components/studio/VideoResult';
import { Button } from '@/components/ui/Button';
import { InsufficientCreditsModal } from '@/components/app/InsufficientCreditsModal';
import { Plus } from 'lucide-react';

type Step = 'welcome' | 'studio' | 'generating_ad' | 'ad_done';

export default function StudioPage() {
  const [step, setStep] = useState<Step>('welcome');
  const [prefill, setPrefill] = useState<StudioPrefill | null>(null);
  const [templates, setTemplates] = useState<UGCTemplate[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  // Two-step template flow: tapping a card sets `previewTarget` (video +
  // "Use as template"); tapping Use promotes it to `activeTemplate` (the
  // input modal). Both blueprints and featured creators use this path.
  const [previewTarget, setPreviewTarget] = useState<TemplateTarget | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<TemplateTarget | null>(null);
  const [adJob, setAdJob] = useState<UGCJob | null>(null);
  const [error, setError] = useState<string>('');
  const [insufficient, setInsufficient] = useState<{ required: number; balance: number } | null>(null);

  // True from the moment Generate is clicked until the request settles.
  const [isGenerating, setIsGenerating] = useState(false);

  // Bumped on every reset/new-generation. An in-flight generation's poll
  // captures the value at start and bails out of its state updates if it
  // no longer matches.
  const genRef = useRef(0);
  // Synchronous re-entry guard. Closes the race where two clicks fire in
  // the same tick before the React state flag updates.
  const generatingRef = useRef(false);

  // Load the gallery (featured creators + blueprints) shown below the
  // composer on the welcome screen (same catalog as /templates).
  useEffect(() => {
    api.listTemplates(1).then((r) => setTemplates(r.data)).catch(() => {});
    api.listBlueprints().then((r) => setBlueprints(r.data)).catch(() => {});
  }, []);

  // Hand-off from /templates and /history: they stash a normalized
  // TemplateTarget and route here. We open its preview once on mount.
  // (Legacy `pendingTemplate`/`pendingBlueprint` keys are also honored so
  // an in-flight navigation from an older tab still works.)
  useEffect(() => {
    try {
      const rawTarget = sessionStorage.getItem('blinkugc:pendingTarget');
      if (rawTarget) {
        sessionStorage.removeItem('blinkugc:pendingTarget');
        setPreviewTarget(JSON.parse(rawTarget) as TemplateTarget);
        return;
      }
      const rawTpl = sessionStorage.getItem('blinkugc:pendingTemplate');
      if (rawTpl) {
        sessionStorage.removeItem('blinkugc:pendingTemplate');
        setPreviewTarget(targetFromCreator(JSON.parse(rawTpl) as UGCTemplate));
        return;
      }
      const rawBp = sessionStorage.getItem('blinkugc:pendingBlueprint');
      if (rawBp) {
        sessionStorage.removeItem('blinkugc:pendingBlueprint');
        setPreviewTarget(targetFromBlueprint(JSON.parse(rawBp) as Blueprint));
      }
    } catch {}
  }, []);

  // One mixed gallery: blueprints (one-photo viral formats) and featured
  // creators woven together in a FIXED order — sorted by a hash of each
  // item's id, so it reads as shuffled but is identical on every page load
  // (and matches the iOS app, which uses the same hash).
  type GalleryItem =
    | { kind: 'blueprint'; bp: Blueprint }
    | { kind: 'creator'; tpl: UGCTemplate };
  const galleryItems = useMemo<GalleryItem[]>(() => {
    const items: GalleryItem[] = [
      ...blueprints.map((bp) => ({ kind: 'blueprint' as const, bp })),
      ...templates.map((tpl) => ({ kind: 'creator' as const, tpl })),
    ];
    const mixHash = (s: string) => {
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return h >>> 0;
    };
    const keyOf = (it: GalleryItem) =>
      it.kind === 'blueprint'
        ? templatePriorityKey('blueprint', it.bp.id)
        : templatePriorityKey('creator', it.tpl.id, it.tpl.actor_name);
    const idOf = (it: GalleryItem) => (it.kind === 'blueprint' ? it.bp.id : it.tpl.id);
    // Curated priority first (in list order); everything else keeps its
    // stable hash order after.
    items.sort((a, b) => {
      const ra = templateRank(keyOf(a));
      const rb = templateRank(keyOf(b));
      if (ra !== rb) return ra - rb;
      return mixHash(idOf(a)) - mixHash(idOf(b));
    });
    return items;
  }, [blueprints, templates]);

  // Progressive loading: start with ONE grid row (5 on desktop, 4 on a
  // 2-column phone) and grow by the same batch per "View more" tap, so a
  // phone never mounts the whole gallery at once.
  const [galleryBatch, setGalleryBatch] = useState(4);
  const [galleryVisible, setGalleryVisible] = useState(4);
  useEffect(() => {
    const w = window.innerWidth;
    // Matches the grid's breakpoints: 2 cols → 4 items (two rows), else one row.
    const batch = w >= 1280 ? 5 : w >= 1024 ? 4 : w >= 640 ? 3 : 4;
    setGalleryBatch(batch);
    setGalleryVisible(batch);
  }, []);

  // The composer hands prompt + attachments directly to the studio form.
  // No more /parse-prompt round-trip; the user's free-form prompt is the
  // single source of truth and gets used as-is.
  const onComposerSubmit = (
    prompt: string,
    opts: {
      aspectRatio: '9:16' | '16:9';
      durationSeconds: 5 | 10;
      attachmentUrls: string[];
    }
  ) => {
    if (prompt.trim().length < 8) {
      setError('Describe your video in a sentence or two.');
      return;
    }
    setError('');
    setPrefill({
      prompt: prompt.trim(),
      attachmentUrls: opts.attachmentUrls || [],
      aspectRatio: opts.aspectRatio,
      duration: opts.durationSeconds,
    });
    setStep('studio');
  };

  // A template generation was accepted (202) by the backend — the modal
  // already did the POST, so this just owns the polling + step transitions,
  // landing on the exact same generating/done screens as the studio form.
  const onTemplateStarted = async (data: UGCJob) => {
    setActiveTemplate(null);
    setError('');
    const myGen = ++genRef.current;
    setAdJob(data);
    setStep('generating_ad');
    window.dispatchEvent(new Event('blinkugc:credits-changed'));
    window.dispatchEvent(new Event('blinkugc:job-list-changed'));
    try {
      const final = await pollJob(
        () => api.getJob(data.id),
        (j) => {
          if (genRef.current === myGen) setAdJob(j as UGCJob);
        }
      );
      if (genRef.current !== myGen) return;
      setAdJob(final as UGCJob);
      setStep('ad_done');
      window.dispatchEvent(new Event('blinkugc:job-list-changed'));
      window.dispatchEvent(new Event('blinkugc:credits-changed'));
    } catch (e: any) {
      if (genRef.current !== myGen) return;
      setError(e.message || 'Ad generation failed');
      setStep('welcome');
    }
  };

  const onGenerateAd = async (payload: any) => {
    // Re-entry guard — ignore double-clicks during the in-flight POST.
    if (generatingRef.current) return;
    generatingRef.current = true;
    setIsGenerating(true);
    setError('');
    const myGen = ++genRef.current;
    try {
      const { data } = await api.generateAd(payload);
      if (genRef.current !== myGen) return;
      setAdJob(data);
      setStep('generating_ad');
      window.dispatchEvent(new Event('blinkugc:credits-changed'));
      window.dispatchEvent(new Event('blinkugc:job-list-changed'));
      const final = await pollJob(
        () => api.getJob(data.id),
        (j) => {
          if (genRef.current === myGen) setAdJob(j as UGCJob);
        }
      );
      if (genRef.current !== myGen) return;
      setAdJob(final as UGCJob);
      setStep('ad_done');
      window.dispatchEvent(new Event('blinkugc:job-list-changed'));
      window.dispatchEvent(new Event('blinkugc:credits-changed'));
    } catch (e: any) {
      if (genRef.current !== myGen) return;
      // 402 — insufficient credits → pop the buy-credits modal.
      if (e instanceof ApiError && e.status === 402) {
        const reqDur = Number(payload?.videoDuration) || 0;
        const required = reqDur >= 13 ? 150 : reqDur >= 8 ? 100 : 50;
        let balance = 0;
        try { balance = (await api.getCreditBalance()).data.balance; } catch {}
        setInsufficient({ required, balance });
        setStep('studio');
        return;
      }
      setError(e.message || 'Ad generation failed');
      setStep('studio');
    } finally {
      generatingRef.current = false;
      setIsGenerating(false);
    }
  };

  const reset = () => {
    genRef.current++;
    generatingRef.current = false;
    setIsGenerating(false);
    setStep('welcome');
    setPrefill(null);
    setAdJob(null);
    setError('');
    setPreviewTarget(null);
    setActiveTemplate(null);
  };

  useEffect(() => {
    const onFresh = () => reset();
    window.addEventListener('blinkugc:fresh-studio', onFresh);
    return () => window.removeEventListener('blinkugc:fresh-studio', onFresh);
  }, []);

  return (
    <div className="min-h-screen pb-24 md:pb-12 overflow-x-hidden">
      <InsufficientCreditsModal
        open={!!insufficient}
        required={insufficient?.required ?? 0}
        balance={insufficient?.balance ?? 0}
        onClose={() => setInsufficient(null)}
      />
      {/* Step 1: preview the chosen template's clip + "Use as template". */}
      {previewTarget && !activeTemplate && (
        <TemplatePreviewModal
          target={previewTarget}
          onClose={() => setPreviewTarget(null)}
          onUse={() => {
            setActiveTemplate(previewTarget);
            setPreviewTarget(null);
          }}
        />
      )}
      {/* Step 2: the unified input modal (photo, name, line, script, tweaks,
          captions) — used for every template, blueprint or creator. */}
      {activeTemplate && (
        <TemplateModal
          target={activeTemplate}
          onClose={() => setActiveTemplate(null)}
          onStarted={onTemplateStarted}
          onInsufficientCredits={async (required) => {
            setActiveTemplate(null);
            let balance = 0;
            try {
              balance = (await api.getCreditBalance()).data.balance;
            } catch {}
            setInsufficient({ required, balance });
          }}
        />
      )}
      {step !== 'welcome' && (
        <div className="px-6 lg:px-10 pt-10 pb-6 flex items-center justify-end">
          <Button variant="ghost" size="sm" onClick={reset}>
            <Plus className="w-4 h-4" /> New
          </Button>
        </div>
      )}

      {error && (
        <div className="mx-6 lg:mx-10 mb-4 p-4 rounded-btn bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-6 lg:px-10 pt-32 lg:pt-40"
          >
            <div className="text-center mb-14 lg:mb-16 max-w-2xl mx-auto">
              <h2 className="font-serif text-white text-[clamp(28px,4.4vw,64px)] leading-[1.05] tracking-[-0.02em]">
                UGC ads for your product.
              </h2>
              <p className="mt-4 text-white/55 text-sm sm:text-base max-w-xl mx-auto">
                The best way to market your product. Upload it, describe the
                ad, and we generate creator videos that look genuinely real.
              </p>
            </div>
            <PromptComposer onSubmit={onComposerSubmit} loading={false} />

            {/* Templates — blueprints (one-photo viral formats) and featured
                creators woven into one gallery. Every card opens the same
                preview → input-modal flow. */}
            <div className="mt-20 max-w-7xl mx-auto">
              <div className="flex items-end justify-between mb-5">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-2">
                    One photo. Done.
                  </div>
                  <h3 className="font-display font-bold text-2xl tracking-tight">
                    Templates
                  </h3>
                  <p className="text-sm text-white/50 mt-1">
                    Pick a template or a creator, drop your product photo, and
                    we make the video.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {galleryItems.slice(0, galleryVisible).map((item) =>
                  item.kind === 'blueprint' ? (
                    <BlueprintCard
                      key={`bp-${item.bp.id}`}
                      blueprint={item.bp}
                      onUse={(bp) => setPreviewTarget(targetFromBlueprint(bp))}
                    />
                  ) : (
                    <TemplateCard
                      key={`tpl-${item.tpl.id}`}
                      template={item.tpl}
                      onUse={(tpl) => setPreviewTarget(targetFromCreator(tpl))}
                    />
                  )
                )}
                {galleryItems.length === 0 &&
                  [...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[9/16] rounded-card bg-elevated/40 animate-pulse"
                    />
                  ))}
              </div>
              {galleryVisible < galleryItems.length && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setGalleryVisible((c) => c + galleryBatch)}
                    className="inline-flex items-center justify-center h-11 px-8 rounded-pill border border-white/15 bg-white/[0.04] text-sm font-semibold text-white/80 hover:text-white hover:border-white/35 active:scale-[0.99] transition"
                  >
                    View more
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {step === 'studio' && (
          <motion.div
            key="studio"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-6 lg:px-10 pt-6"
          >
            <StudioForm
              prefill={prefill}
              onSubmit={onGenerateAd}
              loading={isGenerating}
            />
          </motion.div>
        )}

        {step === 'generating_ad' && (
          <motion.div
            key="gen-ad"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-6 lg:px-10 pt-10"
          >
            <div className="text-center mb-8 max-w-xl mx-auto">
              <h2 className="font-display font-bold text-3xl tracking-tight mb-2">
                Producing your ad
              </h2>
              <p className="text-white/55 text-sm">
                Composing the scene → Animating → Polishing
              </p>
            </div>
            <GeneratingCard
              serverProgress={adJob?.progress}
              estimatedSeconds={120}
              label={
                adJob?.status === 'rendering_scene'
                  ? 'Composing the scene'
                  : adJob?.status === 'generating_video'
                  ? 'Animating'
                  : adJob?.status === 'finalizing'
                  ? 'Polishing'
                  : 'Starting'
              }
            />
            <p className="mx-auto mt-6 max-w-md px-2 text-center text-[13px] sm:text-sm leading-relaxed text-white/55">
              Your video will take about two minutes. You can leave this page —
              it won&apos;t stop generating, and your video will be saved to
              your history.
            </p>
          </motion.div>
        )}

        {step === 'ad_done' && adJob?.output_video_url && (
          <motion.div
            key="ad-done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-6 lg:px-10 pt-10"
          >
            <div className="text-center mb-8 max-w-xl mx-auto">
              <div className="text-xs uppercase tracking-[0.2em] text-accent2 mb-3 font-semibold">
                Done
              </div>
              <h2 className="font-display font-bold text-3xl tracking-tight">
                Your UGC ad is ready.
              </h2>
            </div>
            <VideoResult
              videoUrl={adJob.output_video_url}
              posterUrl={adJob.output_thumbnail_url}
              onRegenerate={() => setStep('studio')}
            />
            <div className="mt-10 text-center">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center justify-center h-12 px-8 rounded-btn bg-black text-white font-semibold text-[15px] border border-white/10 hover:bg-[#0a0a0a] active:scale-[0.99] transition"
              >
                Make another ad
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
