/**
 * Unified free-form UGC pipeline.
 *
 * The whole job collapses to TWO calls:
 *   1. Nano Banana Pro — composes a photorealistic still image from the
 *      user's free-form prompt and any reference images they attached.
 *      Zero, one, or N reference images all flow through the same call;
 *      the prompt tells Nano Banana what each image is and how to use it.
 *   2. Kling 3.0 Pro image-to-video — animates that still into a 5s or
 *      10s clip. `generate_audio: true` (when the creator is speaking)
 *      makes Kling render the spoken audio + lip-sync inline, so this
 *      single call replaces the old TTS + LipSync chain entirely.
 *
 * After Kling, an optional caption-burn step (Whisper + libass) burns
 * word-by-word captions in the safe zone for talking videos that opt in.
 *
 * Branchless: there's no template path, no inspiration path, no creator
 * path. The user uploads any images they want, writes a single prompt
 * explaining what to do with them, and we generate. Edge cases (0 images,
 * silent creator, no captions) fall out of the same linear flow.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { fal, isFalEnabled } = require('../config/fal');
const {
  KLING_IMAGE_TO_VIDEO,
  IMAGE_SUBJECT_SWAP,
  IMAGE_GENERATE,
} = require('../config/falModels');
const { captionVideo } = require('./captioning');
const { ffmpegPath } = require('../config/ffmpeg');
const credits = require('./credits');
const { classifyRoles } = require('./attachmentClassifier');

const UGC_BUCKET = 'ugc-videos';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

async function updateJob(jobId, patch) {
  const { error } = await supabase
    .from('ugc_jobs')
    .update(patch)
    .eq('id', jobId);
  if (error) {
    console.error(`[ugc:${jobId}] updateJob error:`, error.message);
  }
}

async function downloadToBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed (${resp.status}) for ${url}`);
  const ct = resp.headers.get('content-type') || '';
  const buf = Buffer.from(await resp.arrayBuffer());
  return { buffer: buf, contentType: ct };
}

async function uploadBufferToBucket(buffer, contentType, ext, keyPrefix) {
  const key = `${keyPrefix}/${uuidv4()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(UGC_BUCKET)
    .upload(key, buffer, { contentType, upsert: false });
  if (upErr) throw upErr;
  const { data: signed } = await supabase.storage
    .from(UGC_BUCKET)
    .createSignedUrl(key, 60 * 60 * 24 * 365);
  if (!signed?.signedUrl) throw new Error(`Failed to sign URL for ${key}`);
  return signed.signedUrl;
}

async function mirrorRemote(url, jobId, kind) {
  const { buffer, contentType } = await downloadToBuffer(url);
  const ext = kind === 'image'
    ? (contentType.includes('png') ? 'png' : 'jpg')
    : 'mp4';
  const ct = kind === 'image'
    ? (ext === 'png' ? 'image/png' : 'image/jpeg')
    : 'video/mp4';
  return uploadBufferToBucket(buffer, ct, ext, `jobs/${jobId}/${kind}`);
}

function describeFalError(err) {
  const status = err?.status;
  const detail = err?.body?.detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => d?.msg || d?.message || (d?.loc ? `${d.loc.join('.')}: ${d.type}` : null))
      .filter(Boolean);
    if (msgs.length) return `${status || 'fal error'}: ${msgs.join('; ')}`;
  }
  if (typeof detail === 'string') return `${status || 'fal error'}: ${detail}`;
  return err?.message || 'fal request failed';
}

async function falSubscribeWithRetry(model, input, label, opts = {}) {
  const { onProgress } = opts;
  const maxAttempts = 2;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let lastReported = 0;
    let heartbeat = null;
    if (onProgress) {
      const startedAt = Date.now();
      heartbeat = setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
        const floor = Math.min(0.9, Math.tanh(elapsed / 60) * 0.9);
        if (floor > lastReported) {
          lastReported = floor;
          try { onProgress(floor); } catch {}
        }
      }, 1500);
    }
    try {
      const result = await fal.subscribe(model, {
        input,
        logs: false,
        onQueueUpdate: onProgress ? (update) => {
          if (update?.status === 'IN_QUEUE' && lastReported < 0.05) {
            lastReported = 0.05;
            try { onProgress(0.05); } catch {}
          } else if (update?.status === 'IN_PROGRESS' && lastReported < 0.15) {
            lastReported = 0.15;
            try { onProgress(0.15); } catch {}
          }
        } : undefined,
      });
      if (heartbeat) clearInterval(heartbeat);
      if (onProgress) { try { onProgress(1); } catch {} }
      return result;
    } catch (err) {
      if (heartbeat) clearInterval(heartbeat);
      lastErr = err;
      console.error(
        `[${label}] fal attempt ${attempt}/${maxAttempts} failed:`,
        describeFalError(err),
        JSON.stringify(err?.body || {}).slice(0, 700)
      );
      const detail = err?.body?.detail?.[0] || {};
      const isHardValidation = err?.status === 422 && (
        detail.type === 'feature_not_supported' || detail.type === 'value_error'
      );
      const retryable = !isHardValidation && (
        err?.status === 422 || err?.status === 429 || err?.status >= 500
      );
      if (!retryable || attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  const wrapped = new Error(describeFalError(lastErr));
  wrapped.cause = lastErr;
  throw wrapped;
}

// ---------------------------------------------------------------------------
// Step 1 — Nano Banana seed image
// ---------------------------------------------------------------------------

function nanoAspectFor(aspectRatio) {
  return ({ '9:16': '9:16', '16:9': '16:9', '1:1': '1:1' })[aspectRatio] || '9:16';
}

// The four roles an uploaded reference image can play. Mirrored on the web
// client (StudioForm) so the user sees + can change each image's role.
const ATTACHMENT_ROLES = new Set(['creator', 'product', 'background', 'style']);

function normalizeRole(role) {
  return ATTACHMENT_ROLES.has(role) ? role : 'product';
}

// One-line directive describing how Nano Banana should treat an image of
// a given role. Numbered ("Image N") so the model can map the prompt to
// the actual inputs in order.
function roleDirective(role, idx) {
  const n = idx + 1;
  switch (role) {
    case 'creator':
      return `Image ${n} is the CREATOR — the person/model to feature on camera. Keep their face, body type, hair, and the clothing they are wearing EXACTLY as shown. Do not swap them for a different person and do not restyle their outfit.`;
    case 'product':
      return `Image ${n} is a PRODUCT to feature. Preserve it PIXEL-FAITHFULLY: shape, color, label text, fabric pattern, branding, gemstone placement — all match the reference exactly. Do not redesign, recolor, restyle, or warp it. If a person is shown wearing/holding it, ignore that person and extract only the product.`;
    case 'background':
      return `Image ${n} is the BACKGROUND / setting — place the scene in this environment, matching its lighting and mood.`;
    case 'style':
      return `Image ${n} is a STYLE / vibe reference only — match its look, lighting, and energy, but do NOT copy its specific person, location, or props literally.`;
    default:
      return `Image ${n} is a reference image.`;
  }
}

/**
 * Build the Nano Banana prompt for the seed-image step, role-aware.
 *
 * The user's free-form prompt still drives the scene; we additionally tell
 * Nano Banana exactly what each input image is (creator / product /
 * background / style) so it composites them correctly — e.g. "keep the
 * person from image 1, place the product from image 2 on them."
 */
// "Close to the camera / close to the frame" must read as a tight close-up
// SHOT, never as a physical camera object in the scene. Without this guard
// the models render a literal camera/recording device. Injected into every
// seed prompt.
const NO_CAMERA_GUARD =
  'IMPORTANT: do NOT place any physical camera, recording device, DSLR, camcorder, tripod, or filming equipment in the image. If the request mentions being "close to the camera" or "close to the frame", interpret that purely as a tight close-up framing of the subject — never as a camera object in the scene.';

function buildSeedPrompt(userPrompt, attachments) {
  const trimmed = (userPrompt || '').trim();
  const parts = [];
  if (!attachments.length) {
    parts.push(
      'Generate a single photorealistic still image as described below.',
      `USER REQUEST: ${trimmed}`,
      'Vertical phone-video composition. Natural lighting, sharp focus.',
      'The on-camera person, if any, is a naturally good-looking everyday adult — relatable, approachable, healthy. Authentic vibe, like a real camera photo of a real person.',
      NO_CAMERA_GUARD,
    );
    return parts.join('\n\n');
  }
  parts.push(
    `Generate a single photorealistic still image using the ${attachments.length} reference image(s) below, combined per the user's request.`,
    `USER REQUEST: ${trimmed}`,
    'Each input image has a specific role — follow these exactly:',
    attachments.map((a, i) => `- ${roleDirective(a.role, i)}`).join('\n'),
    'Vertical phone-video composition. Natural lighting, sharp focus, photorealistic — looks like a real camera photo of real subjects.',
    NO_CAMERA_GUARD,
  );
  return parts.join('\n\n');
}

/**
 * Compose the seed still image via Nano Banana Pro.
 *
 *   - 0 attachments → text-to-image generate
 *   - 1+ attachments → image-edit with all attachments as `image_urls`,
 *     each described by its role in the prompt.
 *
 * Returns a remote fal URL; the caller mirrors it into Supabase storage.
 */
async function composeSeedImage({ attachments, userPrompt, aspectRatio, onProgress }) {
  const seedPrompt = buildSeedPrompt(userPrompt, attachments);
  if (!attachments.length) {
    const result = await falSubscribeWithRetry(IMAGE_GENERATE, {
      prompt: seedPrompt,
      aspect_ratio: nanoAspectFor(aspectRatio),
      num_images: 1,
      resolution: '2K',
    }, 'seed-text2img', { onProgress });
    const images = result?.data?.images || result?.images || [];
    const url = images[0]?.url;
    if (!url) throw new Error('Seed text-to-image returned no URL');
    return url;
  }
  const result = await falSubscribeWithRetry(IMAGE_SUBJECT_SWAP, {
    prompt: seedPrompt,
    image_urls: attachments.map((a) => a.url),
    aspect_ratio: nanoAspectFor(aspectRatio),
    num_images: 1,
    resolution: '2K',
  }, 'seed-edit', { onProgress });
  const images = result?.data?.images || result?.images || [];
  const url = images[0]?.url;
  if (!url) throw new Error('Seed image edit returned no URL');
  return url;
}

// ---------------------------------------------------------------------------
// Step 2 — Kling Video v3 Pro image-to-video (with inline audio)
// ---------------------------------------------------------------------------

function klingDurationEnum(seconds) {
  return Number(seconds) >= 8 ? '10' : '5';
}

// Negative prompt — intentionally MINIMAL.
//
// Calling Kling v3 Pro directly with just "multi shot video" and NO
// negative prompt produces multi-shot output trivially. Our old, long
// negative prompt (which listed "scene cuts, hard cuts, split screen,
// frozen still image" plus a wall of aesthetic terms) was quietly fighting
// the model and forcing single-take renders. To match the raw-Kling
// behavior we drop the whole aesthetic/cut block.
//
// The only thing we still reinforce is the AUDIO mode — and even that is
// already controlled by the `generate_audio` boolean, so these terms are
// just light reinforcement so a silent clip doesn't sneak in a mouth-move
// and a talking clip doesn't go mute. Nothing here constrains shots,
// camera moves, or cuts.
const KLING_NEGATIVE_PROMPT_SPEAKING =
  'silent, no audio, mute, lip movements out of sync, mouth not matching audio';

const KLING_NEGATIVE_PROMPT_SILENT =
  'talking, speaking, mouthing words, open mouth mid-speech, dialogue, narration';

// Always steer away from a LITERAL camera in the shot. A UGC clip is shot
// ON a phone, so a physical camera/recording device should never appear in
// frame. This is what stops "close to the camera / close to the frame"
// from being read as "put a camera in the scene" — that phrasing means a
// tight close-up shot, not a camera object.
const KLING_NEGATIVE_PROMPT_NO_CAMERA =
  'visible camera, physical camera, camera device, DSLR, camcorder, video camera, holding a camera, camera equipment, tripod, camera lens in frame, filming rig';

function klingNegativePrompt(creatorSpeaks) {
  const base = creatorSpeaks
    ? KLING_NEGATIVE_PROMPT_SPEAKING
    : KLING_NEGATIVE_PROMPT_SILENT;
  return `${base}, ${KLING_NEGATIVE_PROMPT_NO_CAMERA}`;
}

/**
 * Build the Kling prompt. The user's free-form prompt is the primary
 * action directive — it describes what should happen on screen. When the
 * creator speaks, the script is embedded with explicit lip-sync
 * instructions so Kling's inline audio (`generate_audio: true`) renders
 * the speech and the mouth tracks it in one shot.
 */
function buildKlingPrompt({ userPrompt, script, creatorSpeaks }) {
  const trimmedPrompt = (userPrompt || '').trim();
  const trimmedScript = (script || '').trim();
  // Lead with the user's prompt verbatim — exactly like calling Kling
  // directly. We don't wrap it in framing boilerplate ("one continuous
  // shot", "talking-head", etc.) anymore, because those lines biased the
  // model toward a single static take and washed out multi-shot requests.
  // If the user writes "multi shot video", Kling sees that as the leading
  // instruction and delivers it.
  const parts = [];
  if (trimmedPrompt) parts.push(trimmedPrompt);
  if (creatorSpeaks && trimmedScript) {
    parts.push(
      'The creator speaks the following script aloud in a normal, natural, conversational voice, like a real everyday person casually showing the product. Their voice is audible in the final video and their lip movements MUST be perfectly synchronized with every word they say:',
      `"${trimmedScript}"`,
      'Delivery: natural human voice modulation, with the normal rise and fall of everyday speech (not flat, not monotone), and a small natural pause after each sentence or line. Keep those pauses brief and normal like ordinary speech, never long, exaggerated, or awkward.',
      'Tone: relaxed and normal. NOT hyped, NOT overly excited, NOT jolly or salesy. They are simply showing the product, not advertising it.',
      'Their mouth shapes match each word, the audio is the creator\'s own voice speaking these exact lines, and the lip-sync is tight throughout. No silent video, no mismatched mouth movement.',
    );
  } else if (!creatorSpeaks) {
    parts.push(
      'The creator does NOT speak and does NOT talk at any point — their mouth stays closed and relaxed throughout. No spoken voiceover.',
    );
  }
  return parts.join(' ').slice(0, 1800);
}

async function generateVideoFromImage({
  seedImageUrl, prompt, durationSec, aspectRatio, creatorSpeaks, onProgress,
}) {
  const result = await falSubscribeWithRetry(KLING_IMAGE_TO_VIDEO, {
    prompt,
    image_url: seedImageUrl,
    duration: klingDurationEnum(durationSec),
    aspect_ratio: aspectRatio,
    generate_audio: creatorSpeaks,
    negative_prompt: klingNegativePrompt(creatorSpeaks),
    cfg_scale: 0.5,
  }, 'kling-i2v', { onProgress });
  const url = result?.data?.video?.url || result?.video?.url;
  if (!url) throw new Error('Kling image-to-video returned no URL');
  return url;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

async function runUnifiedPipeline(job, jobId, chargeOpts = {}) {
  const { chargeAmount = 0, chargeState = { charged: false } } = chargeOpts;
  const snapshot = job.template_snapshot || {};

  // Pull all the unified-flow inputs out of the job. The route stores
  // them in `template_snapshot` to avoid a schema migration; `script` and
  // `video_duration` stay in their existing top-level columns.
  const userPrompt = (snapshot.prompt || '').trim();
  // A KNOWN creator image, present when the user came from a template or
  // "use this video as a template". Its role is fixed to 'creator' (not
  // classified) and it forces the compositing path so the template's
  // creator is preserved rather than animated as a raw still.
  const templateCreatorUrl = (snapshot.creator_image_url || '').trim() || null;

  // The client sends plain image URLs (no roles). The backend decides each
  // image's role here, smartly, from the prompt + the images themselves —
  // so the user never has to tag anything. We accept a pre-tagged
  // `attachments: [{url, role}]` shape too (older jobs / future callers).
  const attachmentUrls = Array.isArray(snapshot.attachment_urls)
    ? snapshot.attachment_urls.filter((u) => typeof u === 'string' && u.length > 0)
    : [];
  let attachments = [];
  if (Array.isArray(snapshot.attachments) && snapshot.attachments.length) {
    attachments = snapshot.attachments
      .filter((a) => a && typeof a.url === 'string' && a.url.length > 0)
      .map((a) => ({ url: a.url, role: normalizeRole(a.role) }));
  } else if (attachmentUrls.length) {
    // Classify each uploaded image (creator / product / background / style)
    // so the seed step knows whether to use an image as-is or composite.
    const roles = await classifyRoles(userPrompt, attachmentUrls);
    attachments = attachmentUrls.map((url, i) => ({
      url,
      role: normalizeRole(roles[i]),
    }));
    console.log(`[ugc:${jobId}] classified attachments: ${attachments.map((a) => a.role).join(', ')}`);
  }

  // Prepend the template creator (if any) as the leading creator-role image
  // so Nano Banana keeps that exact person. Tagged `fromTemplate` so the
  // as-is shortcut below ignores it.
  if (templateCreatorUrl) {
    attachments = [
      { url: templateCreatorUrl, role: 'creator', fromTemplate: true },
      ...attachments,
    ];
    console.log(`[ugc:${jobId}] template creator attached (composited, identity preserved)`);
  }
  const aspectRatio = snapshot.aspect_ratio || '9:16';
  const creatorSpeaks = snapshot.creator_speaks !== false;
  const captionsRequested = snapshot.captions_enabled !== false;
  // Captions only make sense when there's spoken audio to caption.
  const captionsEnabled = creatorSpeaks && captionsRequested;
  const captionPreset = snapshot.caption_preset || null;
  const videoDuration = job.video_duration || 10;
  const script = (job.script || '').trim();

  if (!userPrompt) throw new Error('Prompt is empty');
  if (creatorSpeaks && !script) throw new Error('Script is empty');

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `ugc-${jobId}-`));
  try {
    const reportStage = async (status, lo, hi) => {
      await updateJob(jobId, { status, progress: Math.round(lo) });
      return (frac) => {
        const clamped = Math.max(0, Math.min(1, frac));
        const target = Math.round(lo + (hi - lo) * clamped);
        updateJob(jobId, { progress: target }).catch(() => {});
      };
    };

    // ---- Step 1: resolve the seed image ----
    //
    // Smart shortcut: when the ONLY input is a single image the user marked
    // as the CREATOR (and there's nothing to composite onto it — no
    // product, no background swap, no style reference), we DON'T run Nano
    // Banana. Regenerating would alter the model / clothes; the user wants
    // exactly what they uploaded. So we feed their image straight to Kling
    // as the first frame — same model, same clothes, guaranteed. This also
    // saves a Nano Banana call + ~20s.
    // As-is only for a single USER-uploaded creator image with nothing
    // else. A template creator always composites (so it can be placed into
    // the described scene with the product), never animated as a raw still.
    const creatorImgs = attachments.filter((a) => a.role === 'creator');
    const compositingImgs = attachments.filter((a) => a.role !== 'creator');
    const useImageDirectly =
      !templateCreatorUrl &&
      creatorImgs.length === 1 &&
      compositingImgs.length === 0 &&
      !creatorImgs[0].fromTemplate;

    let seedImageUrl;
    if (useImageDirectly) {
      const seedTick = await reportStage('rendering_scene', 5, 30);
      console.log(`[ugc:${jobId}] using uploaded creator image directly (no nano banana) — same model + clothes`);
      // Mirror into our bucket so the Kling input is a stable URL we own.
      seedImageUrl = await mirrorRemote(creatorImgs[0].url, jobId, 'image');
      seedTick(1);
    } else {
      const seedTick = await reportStage('rendering_scene', 5, 30);
      console.log(
        `[ugc:${jobId}] composing seed via nano banana (attachments=${attachments.length} ` +
        `[${attachments.map((a) => a.role).join(',') || 'none'}], ` +
        `prompt="${userPrompt.slice(0, 60)}${userPrompt.length > 60 ? '…' : ''}")`
      );
      const rawSeedUrl = await composeSeedImage({
        attachments,
        userPrompt,
        aspectRatio,
        onProgress: seedTick,
      });
      seedImageUrl = await mirrorRemote(rawSeedUrl, jobId, 'image');
    }
    await updateJob(jobId, { creator_scene_image_url: seedImageUrl }).catch(() => {});
    console.log(`[ugc:${jobId}] seed image → ${seedImageUrl}`);

    // ---- Step 2: Kling image-to-video ----
    const videoTick = await reportStage('generating_video', 32, captionsEnabled ? 90 : 96);
    const klingPrompt = buildKlingPrompt({ userPrompt, script, creatorSpeaks });
    console.log(
      `[ugc:${jobId}] kling i2v (${videoDuration}s, audio=${creatorSpeaks}, ratio=${aspectRatio})`
    );
    const klingVideoUrl = await generateVideoFromImage({
      seedImageUrl,
      prompt: klingPrompt,
      durationSec: videoDuration,
      aspectRatio,
      creatorSpeaks,
      onProgress: videoTick,
    });

    // Charge credits — the generation actually succeeded.
    if (chargeAmount > 0 && !chargeState.charged) {
      try {
        await credits.spendForJob(job.user_id, chargeAmount, jobId);
        chargeState.charged = true;
        console.log(`[ugc:${jobId}] charged ${chargeAmount} credits`);
      } catch (chargeErr) {
        if (chargeErr.code === 'INSUFFICIENT_CREDITS') {
          console.warn(`[ugc:${jobId}] credit charge skipped (insufficient at debit time; shipping anyway)`);
        } else {
          throw chargeErr;
        }
      }
    }

    // Stage Kling output to disk for captioning.
    const klingLocalPath = path.join(workDir, 'kling.mp4');
    {
      const { buffer } = await downloadToBuffer(klingVideoUrl);
      fs.writeFileSync(klingLocalPath, buffer);
    }

    // ---- Step 3: Optional captions ----
    let videoBytesToUpload = fs.readFileSync(klingLocalPath);
    let captionError = null;
    if (captionsEnabled) {
      await reportStage('finalizing', 90, 96);
      console.log(`[ugc:${jobId}] burning captions via whisper + libass`);
      const captionedPath = path.join(workDir, 'captioned.mp4');
      try {
        const stats = await captionVideo({
          inputPath: klingLocalPath,
          outputPath: captionedPath,
          scriptHint: script,
          presetId: captionPreset || undefined,
        });
        videoBytesToUpload = fs.readFileSync(captionedPath);
        console.log(
          `[ugc:${jobId}] captions burned (${stats.wordCount} words, ${stats.cues} cues)`
        );
      } catch (capErr) {
        captionError = capErr?.message || String(capErr);
        console.error(`[ugc:${jobId}] caption failed; shipping uncaptioned: ${captionError}`);
      }
    }

    // ---- Step 4: Upload final, finalize ----
    const finalVideoUrl = await uploadBufferToBucket(
      videoBytesToUpload, 'video/mp4', 'mp4', `jobs/${jobId}/video`
    );
    console.log(`[ugc:${jobId}] final → ${finalVideoUrl}`);

    await updateJob(jobId, { status: 'finalizing', progress: 98 });
    const completionPatch = {
      status: 'completed',
      progress: 100,
      output_video_url: finalVideoUrl,
      output_thumbnail_url: seedImageUrl,
      completed_at: new Date().toISOString(),
    };
    if (captionError) {
      completionPatch.error = `captions_skipped: ${captionError.slice(0, 400)}`;
    }
    await updateJob(jobId, completionPatch);
    console.log(`[ugc:${jobId}] DONE`);
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

async function runUGCJob(job, opts = {}) {
  const jobId = job.id;
  const chargeAmount = Number(opts.creditCost) || 0;
  const chargeState = { charged: false };
  const snapshot = job.template_snapshot || {};
  const attachmentCount = Array.isArray(snapshot.attachments)
    ? snapshot.attachments.length
    : (Array.isArray(snapshot.attachment_urls) ? snapshot.attachment_urls.length : 0);
  console.log(
    `[ugc:${jobId}] starting unified pipeline ` +
    `attachments=${attachmentCount} ` +
    `speaks=${snapshot.creator_speaks !== false} ` +
    `dur=${job.video_duration || 'n/a'}`
  );
  await updateJob(jobId, {
    status: 'planning',
    progress: 5,
    started_at: new Date().toISOString(),
  });
  try {
    if (!isFalEnabled()) {
      console.warn(`[ugc:${jobId}] FAL_KEY missing — MOCK mode`);
      await new Promise((r) => setTimeout(r, 1500));
      await updateJob(jobId, { status: 'generating_video', progress: 50 });
      await new Promise((r) => setTimeout(r, 2500));
      await updateJob(jobId, {
        status: 'completed',
        progress: 100,
        output_video_url: null,
        output_thumbnail_url: null,
        completed_at: new Date().toISOString(),
      });
      return;
    }
    await runUnifiedPipeline(job, jobId, { chargeAmount, chargeState });
  } catch (err) {
    console.error(`[ugc:${jobId}] pipeline failed:`, err);
    const errMsg = err?.message || String(err);
    await updateJob(jobId, {
      status: 'failed',
      error: errMsg.slice(0, 500),
      completed_at: new Date().toISOString(),
    });
    // Refund only if we actually charged the user before the failure
    // (i.e. Kling succeeded but a later step blew up). Generations that
    // fail before the charge weren't debited, so there's nothing to
    // refund. Idempotent — refundForJob checks for an existing refund row.
    if (chargeState.charged && chargeAmount > 0) {
      try {
        await credits.refundForJob(job.user_id, chargeAmount, jobId);
        console.log(`[ugc:${jobId}] refunded ${chargeAmount} credits`);
      } catch (refundErr) {
        console.error(`[ugc:${jobId}] refund failed:`, refundErr?.message || refundErr);
      }
    }
  }
}

module.exports = {
  runUGCJob,
  UGC_BUCKET,
};
