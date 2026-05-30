'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, pollJob } from '@/lib/api';
import type { UGCTemplate, UGCJob } from '@/lib/types';
import { PromptComposer } from '@/components/studio/PromptComposer';
import { TemplateCard } from '@/components/studio/TemplateCard';
import { StudioForm, type StudioPrefill } from '@/components/studio/StudioForm';
import { GeneratingCard } from '@/components/studio/GeneratingCard';
import { VideoResult } from '@/components/studio/VideoResult';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import { Button } from '@/components/ui/Button';
import { Plus } from 'lucide-react';

type Step = 'welcome' | 'studio' | 'generating_ad' | 'ad_done';

export default function StudioPage() {
  const [step, setStep] = useState<Step>('welcome');
  const [templates, setTemplates] = useState<UGCTemplate[]>([]);
  const [pickedTemplate, setPickedTemplate] = useState<UGCTemplate | null>(null);
  const [prefill, setPrefill] = useState<StudioPrefill | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [adJob, setAdJob] = useState<UGCJob | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    api.listTemplates(1).then((r) => setTemplates(r.data)).catch(() => {});
  }, []);

  const onComposerSubmit = async (
    prompt: string,
    opts: {
      aspectRatio: '9:16' | '1:1' | '16:9';
      durationSeconds: 5 | 10;
      attachmentUrls: string[];
    }
  ) => {
    if (prompt.trim().length < 10) {
      setError('Describe your video in a bit more detail.');
      return;
    }
    setError('');
    setIsParsing(true);
    try {
      const attachmentsPayload = (opts.attachmentUrls || []).map((url) => ({ url }));
      const { data } = await api.parsePrompt(
        prompt.trim(),
        attachmentsPayload.length ? attachmentsPayload : undefined
      );

      // Inspiration upload was removed everywhere — any image the user
      // attaches in the composer goes straight to the product slot.
      // First-uploaded wins; extras are dropped silently.
      const routedProductUrl: string | null =
        (opts.attachmentUrls && opts.attachmentUrls[0]) || null;

      setPickedTemplate(null);
      setPrefill({
        creatorDescription: data.creatorDescription || '',
        // If the user attached an image we treat it as a product even when
        // the prompt-parser didn't infer one — the upload itself signals
        // intent.
        includeProduct: !!data.includeProduct || !!routedProductUrl,
        productName: data.productName || '',
        productDescription: data.productDescription || '',
        videoDescription: data.videoDescription || '',
        duration: opts.durationSeconds,
        productImageUrl: routedProductUrl,
      });
      setStep('studio');
    } catch (e: any) {
      setError(e.message || 'Could not understand your prompt. Try again.');
    } finally {
      setIsParsing(false);
    }
  };

  const onUseTemplate = (t: UGCTemplate) => {
    setPickedTemplate(t);
    setPrefill(null);
    setStep('studio');
  };

  const onGenerateAd = async (payload: any) => {
    setError('');
    try {
      const { data } = await api.generateAd(payload);
      setAdJob(data);
      setStep('generating_ad');
      const final = await pollJob(
        () => api.getJob(data.id),
        (j) => setAdJob(j as UGCJob)
      );
      setAdJob(final as UGCJob);
      setStep('ad_done');
      // Tell the sidebar to refresh its Recents list immediately so the
      // newly-finished video appears without waiting for a route change.
      window.dispatchEvent(new Event('blinkugc:job-list-changed'));
    } catch (e: any) {
      setError(e.message || 'Ad generation failed');
      setStep('studio');
    }
  };

  const reset = () => {
    setStep('welcome');
    setPickedTemplate(null);
    setPrefill(null);
    setAdJob(null);
    setError('');
  };

  // Reset to a fresh studio when the user taps the Blink UGC logo in
  // the navbar (AppShell dispatches this event on logo click when the
  // current path is /studio — a plain re-navigation would be a no-op
  // because Next.js wouldn't unmount this component).
  useEffect(() => {
    const onFresh = () => reset();
    window.addEventListener('blinkugc:fresh-studio', onFresh);
    return () => window.removeEventListener('blinkugc:fresh-studio', onFresh);
  }, []);

  return (
    <div className="min-h-screen pb-24 md:pb-12">
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="px-6 lg:px-10 pt-32 lg:pt-40"
          >
            <div className="text-center mb-14 lg:mb-16 max-w-2xl mx-auto">
              <h2 className="font-serif text-white text-[clamp(28px,4.4vw,64px)] leading-[1.05] tracking-[-0.02em]">
                Describe your content...
              </h2>
            </div>
            <PromptComposer onSubmit={onComposerSubmit} loading={isParsing} />

            <div className="mt-20 max-w-7xl mx-auto">
              <div className="flex items-end justify-between mb-5">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-white/40 mb-2">
                    Or pick a creator
                  </div>
                  <h3 className="font-display font-bold text-2xl tracking-tight">
                    Featured templates
                  </h3>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {templates.map((t) => (
                  <TemplateCard key={t.id} template={t} onUse={onUseTemplate} />
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="px-6 lg:px-10 pt-6"
          >
            {pickedTemplate && (
              <div className="max-w-2xl mx-auto mb-6 p-4 rounded-card bg-studio border border-white/[0.06] flex items-center gap-4">
                <div className="w-16 h-20 rounded-btn overflow-hidden bg-elevated">
                  {pickedTemplate.video_url && (
                    <LoopingVideo
                      src={pickedTemplate.video_url}
                      className="w-full h-full"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                    Creator
                  </div>
                  <div className="font-bold truncate">
                    {pickedTemplate.actor_name || pickedTemplate.name}
                  </div>
                </div>
                <button
                  onClick={() => setStep('welcome')}
                  className="text-xs text-white/60 hover:text-white"
                >
                  Change
                </button>
              </div>
            )}
            <StudioForm
              template={pickedTemplate}
              prefill={prefill}
              onSubmit={onGenerateAd}
            />
          </motion.div>
        )}

        {step === 'generating_ad' && (
          <motion.div
            key="gen-ad"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="px-6 lg:px-10 pt-10"
          >
            <div className="text-center mb-8 max-w-xl mx-auto">
              <h2 className="font-display font-bold text-3xl tracking-tight mb-2">
                Rendering your ad
              </h2>
              <p className="text-white/55 text-sm">
                Voice → Lip-sync → Final cut
              </p>
            </div>
            <GeneratingCard
              serverProgress={adJob?.progress}
              estimatedSeconds={90}
              label={
                adJob?.status === 'tts'
                  ? 'Generating voice'
                  : adJob?.status === 'lipsync'
                  ? 'Lip-syncing'
                  : adJob?.status === 'finalizing'
                  ? 'Polishing'
                  : 'Starting'
              }
            />
          </motion.div>
        )}

        {step === 'ad_done' && adJob?.output_video_url && (
          <motion.div
            key="ad-done"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="px-6 lg:px-10 pt-10"
          >
            <div className="text-center mb-8 max-w-xl mx-auto">
              <div className="text-xs uppercase tracking-[0.2em] text-accent2 mb-3 font-semibold">
                Done
              </div>
              <h2 className="font-display font-bold text-3xl tracking-tight">
                Your ad is ready.
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
                Make another
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
