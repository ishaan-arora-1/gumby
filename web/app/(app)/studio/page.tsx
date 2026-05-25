'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, pollJob } from '@/lib/api';
import type { UGCTemplate, UGCCreatorJob, UGCJob } from '@/lib/types';
import { PromptComposer } from '@/components/studio/PromptComposer';
import { TemplateCard } from '@/components/studio/TemplateCard';
import { StudioForm } from '@/components/studio/StudioForm';
import { GeneratingCard } from '@/components/studio/GeneratingCard';
import { VideoResult } from '@/components/studio/VideoResult';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Plus } from 'lucide-react';

type Step =
  | 'welcome'
  | 'generating_creator'
  | 'creator_ready'
  | 'studio'
  | 'generating_ad'
  | 'ad_done';

export default function StudioPage() {
  const [step, setStep] = useState<Step>('welcome');
  const [templates, setTemplates] = useState<UGCTemplate[]>([]);
  const [pickedTemplate, setPickedTemplate] = useState<UGCTemplate | null>(null);
  const [creatorJob, setCreatorJob] = useState<UGCCreatorJob | null>(null);
  const [creatorPrompt, setCreatorPrompt] = useState<string>('');
  const [adJob, setAdJob] = useState<UGCJob | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    api.listTemplates(1).then((r) => setTemplates(r.data)).catch(() => {});
  }, []);

  const onComposerSubmit = async (
    prompt: string,
    opts: { aspectRatio: '9:16' | '1:1' | '16:9'; durationSeconds: 5 | 10 }
  ) => {
    setError('');
    setCreatorPrompt(prompt);
    try {
      const { data } = await api.generateCreator({ prompt, ...opts });
      setCreatorJob(data);
      setStep('generating_creator');
      const final = await pollJob(
        () => api.getCreatorJob(data.id),
        (j) => setCreatorJob(j)
      );
      setCreatorJob(final);
      setStep('creator_ready');
    } catch (e: any) {
      setError(e.message || 'Creator generation failed');
      setStep('welcome');
    }
  };

  const onUseTemplate = (t: UGCTemplate) => {
    setPickedTemplate(t);
    setStep('studio');
  };

  const onContinueFromCreator = async () => {
    if (!creatorJob) return;
    try {
      const { data } = await api.promoteToTemplate(creatorJob.id);
      setPickedTemplate(data);
      setStep('studio');
    } catch {
      // Fall back to using creator description directly
      setPickedTemplate(null);
      setStep('studio');
    }
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
    } catch (e: any) {
      setError(e.message || 'Ad generation failed');
      setStep('studio');
    }
  };

  const reset = () => {
    setStep('welcome');
    setPickedTemplate(null);
    setCreatorJob(null);
    setAdJob(null);
    setError('');
  };

  return (
    <div className="min-h-screen pb-24 md:pb-12">
      {/* Header */}
      <div className="px-6 lg:px-10 pt-10 pb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-3xl lg:text-4xl tracking-[-0.03em]">
            Studio
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Generate UGC ads with AI creators
          </p>
        </div>
        {step !== 'welcome' && (
          <Button variant="ghost" size="sm" onClick={reset}>
            <Plus className="w-4 h-4" /> New
          </Button>
        )}
      </div>

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
            className="px-6 lg:px-10"
          >
            {/* Composer */}
            <div className="text-center mb-8 max-w-2xl mx-auto">
              <h2 className="font-display font-bold text-[clamp(28px,4vw,52px)] leading-[1.05] tracking-[-0.03em] mb-3">
                What's your <span className="text-gradient">creator</span> like?
              </h2>
              <p className="text-white/55">
                Describe them. We'll generate them.
              </p>
            </div>
            <PromptComposer onSubmit={onComposerSubmit} />

            {/* Or pick a template */}
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

        {step === 'generating_creator' && (
          <motion.div
            key="gen-creator"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="px-6 lg:px-10 pt-10"
          >
            <div className="text-center mb-8 max-w-xl mx-auto">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">
                Step 1 / 2
              </div>
              <h2 className="font-display font-bold text-3xl tracking-tight mb-2">
                Casting your creator
              </h2>
              <p className="text-white/55 text-sm">"{creatorPrompt}"</p>
            </div>
            <GeneratingCard
              serverProgress={creatorJob?.progress}
              estimatedSeconds={45}
              label="Creating your creator"
            />
          </motion.div>
        )}

        {step === 'creator_ready' && creatorJob?.video_url && (
          <motion.div
            key="creator-ready"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="px-6 lg:px-10 pt-10"
          >
            <div className="text-center mb-8 max-w-xl mx-auto">
              <div className="text-xs uppercase tracking-[0.2em] text-accent2 mb-3 font-semibold">
                Your creator is ready
              </div>
              <h2 className="font-display font-bold text-3xl tracking-tight mb-2">
                Meet your creator
              </h2>
            </div>
            <div className="max-w-xs mx-auto">
              <div className="aspect-[9/16] rounded-card overflow-hidden gradient-border">
                <LoopingVideo
                  src={creatorJob.video_url}
                  poster={creatorJob.thumbnail_url}
                  className="w-full h-full"
                />
              </div>
            </div>
            <div className="mt-8 flex flex-wrap gap-3 justify-center">
              <Button variant="gradient" size="lg" onClick={onContinueFromCreator}>
                Make a full ad with this creator →
              </Button>
              <a
                href={creatorJob.video_url}
                download
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="lg">
                  Just save the clip
                </Button>
              </a>
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
              creatorDescription={creatorPrompt}
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
              <div className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">
                Step 2 / 2
              </div>
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
              <Button variant="gradient" size="lg" onClick={reset}>
                <Plus className="w-4 h-4" /> Make another
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
