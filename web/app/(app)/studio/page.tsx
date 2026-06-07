'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, pollJob, ApiError } from '@/lib/api';
import type { UGCTemplate, UGCJob } from '@/lib/types';
import { PromptComposer } from '@/components/studio/PromptComposer';
import { TemplateCard } from '@/components/studio/TemplateCard';
import { StudioForm, type StudioPrefill } from '@/components/studio/StudioForm';
import { GeneratingCard } from '@/components/studio/GeneratingCard';
import { VideoResult } from '@/components/studio/VideoResult';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import { Button } from '@/components/ui/Button';
import { InsufficientCreditsModal } from '@/components/app/InsufficientCreditsModal';
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
  const [insufficient, setInsufficient] = useState<{ required: number; balance: number } | null>(null);

  // True from the moment Generate is clicked until the request settles.
  // Drives the form's disabled/"Generating…" button so the user can't fire
  // a second generation during the 2–3s the /generate POST is in flight.
  const [isGenerating, setIsGenerating] = useState(false);

  // Bumped on every reset/new-generation. An in-flight generation's poll
  // captures the value at start and bails out of its state updates if it no
  // longer matches — so clicking the logo (which resets to the fresh
  // welcome page) can't be clobbered by a generation that finishes later.
  const genRef = useRef(0);

  // Synchronous re-entry guard. A React state flag (isGenerating) updates on
  // the next render, so two clicks fired in the same tick could both slip
  // past it and POST twice. This ref flips immediately, closing that race —
  // the very first click claims the generation and any extra clicks bail.
  const generatingRef = useRef(false);

  useEffect(() => {
    api.listTemplates(1).then((r) => setTemplates(r.data)).catch(() => {});

    // Hand-off from /history/[id]'s "Use creator" button. The history
    // detail page writes the hidden template to sessionStorage and then
    // routes here — we read it once on mount, drop the user straight
    // into the studio form, and clear the key so a future refresh
    // doesn't re-trigger.
    try {
      const raw = sessionStorage.getItem('blinkugc:pendingTemplate');
      if (raw) {
        const tpl = JSON.parse(raw) as UGCTemplate;
        sessionStorage.removeItem('blinkugc:pendingTemplate');
        setPickedTemplate(tpl);
        setPrefill(null);
        setStep('studio');
      }
    } catch {}
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
        voiceTone: data.voiceTone || '',
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
    // Re-entry guard — if a generation is already in flight (e.g. the user
    // double-clicked Generate before the view switched to the rendering
    // screen), ignore the extra click so we don't start a second job and
    // debit credits twice.
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
      // Nudge the balance chip to refetch. The actual debit now happens
      // when the generation succeeds (see the completion handler below),
      // so this is just a cheap freshness refresh — the chip updates for
      // real once the job finishes.
      window.dispatchEvent(new Event('blinkugc:credits-changed'));
      // The job row already exists in the DB the moment /generate returns,
      // so surface it in the sidebar Recents right away — the user can
      // navigate off /studio and click back into this still-rendering job
      // to watch its progress (the history detail page polls + shows the
      // same progress bar).
      window.dispatchEvent(new Event('blinkugc:job-list-changed'));
      const final = await pollJob(
        () => api.getJob(data.id),
        (j) => {
          if (genRef.current === myGen) setAdJob(j as UGCJob);
        }
      );
      // The user navigated away / reset (e.g. tapped the logo) while this
      // was rendering — don't yank them back to the result.
      if (genRef.current !== myGen) return;
      setAdJob(final as UGCJob);
      setStep('ad_done');
      // Tell the sidebar to refresh its Recents list immediately so the
      // newly-finished video appears without waiting for a route change.
      window.dispatchEvent(new Event('blinkugc:job-list-changed'));
      // Credits are now debited when the generation succeeds (not on the
      // Generate click), so refresh the balance chip here — at completion —
      // rather than relying solely on the earlier optimistic refresh.
      window.dispatchEvent(new Event('blinkugc:credits-changed'));
    } catch (e: any) {
      if (genRef.current !== myGen) return;
      // 402 = insufficient credits — pop the buy-credits modal instead
      // of dumping a raw error string in the form.
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
      // Release the guard whether we ended on the result screen, an error,
      // or the insufficient-credits modal — so the user can generate again.
      generatingRef.current = false;
      setIsGenerating(false);
    }
  };

  const reset = () => {
    // Invalidate any in-flight generation so its poll can't pull the user
    // back to the result after we've returned to the fresh welcome page.
    genRef.current++;
    generatingRef.current = false;
    setIsGenerating(false);
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
    // overflow-x-hidden contains the composer's decorative blue glow
    // (w-[220%], centered) so its overhang can't create horizontal page
    // scroll / a blank strip on the right on phones. Vertical scroll is
    // unaffected.
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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

            <p className="mx-auto mt-6 max-w-md px-2 text-center text-[13px] sm:text-sm leading-relaxed text-white/55">
              Your video will take about two minutes to generate. You can leave
              this page — it won&apos;t stop generating, and your video will be
              saved to your history.
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
