'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, pollJob, ApiError } from '@/lib/api';
import type { UGCJob, UGCTemplate } from '@/lib/types';
import { PromptComposer } from '@/components/studio/PromptComposer';
import { TemplateCard } from '@/components/studio/TemplateCard';
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

  // Map a template/creator into the unified studio form: its still becomes
  // the fixed creator image, the rest of the flow is identical to the
  // normal unified form. Shared by the featured-templates grid below the
  // composer AND the /templates + /history "Use creator" hand-off.
  const useTemplate = (tpl: UGCTemplate) => {
    const imageUrl = tpl.thumbnail_url || tpl.actor_avatar_url || '';
    if (!imageUrl) return; // no usable still — ignore
    setError('');
    setPrefill({
      creator: {
        imageUrl,
        name: tpl.actor_name || tpl.name,
        sampleScript: tpl.sample_script,
      },
      aspectRatio: (tpl.aspect_ratio as '9:16' | '16:9' | '1:1') || '9:16',
      duration: tpl.duration_seconds && tpl.duration_seconds >= 8 ? 10 : undefined,
    });
    setStep('studio');
  };

  // Load the featured creators shown below the composer on the welcome
  // screen (same catalog as /templates).
  useEffect(() => {
    api.listTemplates(1).then((r) => setTemplates(r.data)).catch(() => {});
  }, []);

  // Hand-off from /templates and /history's "Use creator" buttons. Both
  // stash the chosen template/creator in sessionStorage and route here.
  // We read it once on mount, drop the user straight into the studio form
  // with that creator fixed, and clear the key so a refresh doesn't
  // re-trigger.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('blinkugc:pendingTemplate');
      if (!raw) return;
      sessionStorage.removeItem('blinkugc:pendingTemplate');
      useTemplate(JSON.parse(raw) as UGCTemplate);
    } catch {}
  }, []);

  // The composer hands prompt + attachments directly to the studio form.
  // No more /parse-prompt round-trip; the user's free-form prompt is the
  // single source of truth and gets used as-is.
  const onComposerSubmit = (
    prompt: string,
    opts: {
      aspectRatio: '9:16' | '1:1' | '16:9';
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
        const required =
          payload?.videoDuration && Number(payload.videoDuration) >= 8 ? 100 : 50;
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

            {/* Featured creators — pick one to start with that creator
                fixed, or scroll past and just describe your own. */}
            <div className="mt-20 max-w-7xl mx-auto">
              <div className="flex items-end justify-between mb-5">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-2">
                    Or start with a creator
                  </div>
                  <h3 className="font-display font-bold text-2xl tracking-tight">
                    Featured creators
                  </h3>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {templates.map((t) => (
                  <TemplateCard key={t.id} template={t} onUse={useTemplate} />
                ))}
                {templates.length === 0 &&
                  [...Array(10)].map((_, i) => (
                    <div
                      key={i}
                      className="aspect-[9/16] rounded-card bg-elevated/40 animate-pulse"
                    />
                  ))}
              </div>
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
