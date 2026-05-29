const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { fal, isFalEnabled } = require('../config/fal');
const {
  KLING_IMAGE_TO_VIDEO,
  KLING_TEXT_TO_VIDEO,
  IMAGE_SUBJECT_SWAP,
  IMAGE_GENERATE,
} = require('../config/falModels');
const { captionVideo } = require('./captioning');
const { ffmpegPath } = require('../config/ffmpeg');

const UGC_BUCKET = 'ugc-videos';

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
          if (update?.status === 'IN_QUEUE') {
            if (lastReported < 0.05) {
              lastReported = 0.05;
              try { onProgress(0.05); } catch {}
            }
          } else if (update?.status === 'IN_PROGRESS') {
            if (lastReported < 0.15) {
              lastReported = 0.15;
              try { onProgress(0.15); } catch {}
            }
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
// FFmpeg helper — frame extraction for template-mode seed image.
// ---------------------------------------------------------------------------

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      reject(new Error(`ffmpeg spawn failed (${ffmpegPath}): ${err.message}`));
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}\n${stderr.slice(-1500)}`));
    });
  });
}

async function ffmpegExtractFrame(videoPath, outPath, atSeconds = 1.0) {
  await runFfmpeg([
    '-y',
    '-ss', String(atSeconds),
    '-i', videoPath,
    '-frames:v', '1',
    '-q:v', '2',
    outPath,
  ]);
}

// ---------------------------------------------------------------------------
// Step 1 — Nano Banana Pro image subject swap.
//
// Takes the user's inspiration photo and (optionally) the user's product
// photo, then synthesizes a single still where a brand-new model occupies
// the same scene as the inspiration. When a product image is provided, the
// model is shown using/holding it with the product preserved pixel-for-pixel.
// ---------------------------------------------------------------------------

function nanoAspectFor(aspectRatio) {
  return ({ '9:16': '9:16', '16:9': '16:9', '1:1': '1:1' })[aspectRatio] || '9:16';
}

const REALISM_GUIDANCE =
  'The new person is a naturally good-looking everyday adult — relatable, approachable, healthy. NOT a professional model, NOT a fashion-ad face. No glamour makeup, casual everyday clothing, candid natural expression. Photorealistic, sharp focus, natural lighting — looks like a real iPhone photo of a real adult creator.';

async function reimagineCreatorInScene({
  inspirationImageUrl,
  productImageUrl,
  productName,
  creatorDescription,
  aspectRatio = '9:16',
  onProgress,
}) {
  // The user gave us an inspiration photo PLUS a creator description.
  // We treat the photo as the reference scene/composition and the
  // description as the user's instructions for adjustments — could be a
  // full person swap ("20-year-old woman in a kitchen"), or just tweaks
  // ("same person but in a hoodie", "make the room warmer"). Nano Banana
  // is given both as inputs and told to honor whichever interpretation
  // matches the description.
  const cleanCreator = (creatorDescription || '').trim();
  const hasProduct = !!productImageUrl;
  const productPhrase = productName ? `"${productName}"` : 'the product';

  const parts = [
    'The FIRST image is a reference photo from the user showing the scene, lighting, composition, and framing they want.',
    'Use this reference as the starting point for the final image — preserve its overall environment, camera angle, framing, and lighting style.',
  ];

  if (cleanCreator) {
    parts.push(
      `The user\'s description of what they want is: "${cleanCreator}".`,
      'Apply this description as the source of truth for who appears on camera and any adjustments to the scene. If the description specifies a different person from the one in the reference photo, swap the person to match the description (entirely different face, identity, ethnicity, hair, body type — do not copy the reference person\'s identity). If the description only specifies tweaks (clothing, mood, props, setting changes), keep the person from the reference but apply those tweaks. Resolve any conflict between the photo and the description in favor of the description.',
    );
  } else {
    parts.push(
      'Recreate the same scene but with a completely different individual on camera — entirely different facial features, ethnicity, hair, body type, and clothing from the original. Do not copy the original person\'s identity. The new person should pose naturally in roughly the same position.',
    );
  }

  if (hasProduct) {
    parts.push(
      `The SECOND image is ${productPhrase} — the product the on-camera person is featuring.`,
      'Integrate that exact product naturally into the scene — typically held in their hand, or being used by them, in a way that fits the scene.',
      'The product MUST be preserved pixel-perfectly: packaging, color, label text, shape, and branding all match the second image exactly. Do not redesign, restyle, recolor, blur, or otherwise alter the product in any way.',
      'The product should be clearly visible and recognizable in the final image — never hide it, never replace its label, never change its branding.',
    );
  }

  parts.push(REALISM_GUIDANCE);

  const image_urls = hasProduct
    ? [inspirationImageUrl, productImageUrl]
    : [inspirationImageUrl];

  const result = await falSubscribeWithRetry(IMAGE_SUBJECT_SWAP, {
    prompt: parts.join(' '),
    image_urls,
    aspect_ratio: nanoAspectFor(aspectRatio),
    num_images: 1,
    resolution: '2K',
  }, 'subject-swap', { onProgress });

  const images = result?.data?.images || result?.images || [];
  const url = images[0]?.url;
  if (!url) throw new Error('Image subject-swap returned no image URL');
  return url;
}

/**
 * No-inspiration generation. The user gave us a creator description (and
 * maybe a product photo) but no scene reference. We still want a Nano
 * Banana still as the Kling seed frame, so:
 *
 *   - If a product image is provided, run Nano Banana EDIT with only the
 *     product as input. The prompt tells it to build a fresh scene around
 *     a new creator holding/using that exact product.
 *   - If no product image either, run Nano Banana GENERATE (text-to-image)
 *     to synthesize the scene purely from the creator description.
 */
async function synthesizeCreatorScene({
  productImageUrl,
  productName,
  creatorDescription,
  aspectRatio = '9:16',
  onProgress,
}) {
  const cleanCreator = (creatorDescription || '').trim() || 'a lifestyle creator on camera';
  const hasProduct = !!productImageUrl;
  const productPhrase = productName ? `"${productName}"` : 'the product';

  if (hasProduct) {
    const prompt = [
      `Generate a single photorealistic still of a new on-camera UGC creator: ${cleanCreator}.`,
      `The IMAGE provided is ${productPhrase} — the product this creator is featuring.`,
      'Integrate the product naturally into the scene — typically held in the creator\'s hand, or being used by them.',
      'Preserve the product pixel-perfectly: packaging, color, label text, shape, and branding all match the provided image exactly. Do not redesign, restyle, recolor, or otherwise alter the product.',
      'The product must be clearly visible and recognizable in the final image — never hide it, never blur it, never change its branding.',
      'Build a believable environment around the creator that fits the scene description above (room, lighting, background props as appropriate).',
      REALISM_GUIDANCE,
    ].join(' ');

    const result = await falSubscribeWithRetry(IMAGE_SUBJECT_SWAP, {
      prompt,
      image_urls: [productImageUrl],
      aspect_ratio: nanoAspectFor(aspectRatio),
      num_images: 1,
      resolution: '2K',
    }, 'scene-from-product', { onProgress });
    const images = result?.data?.images || result?.images || [];
    const url = images[0]?.url;
    if (!url) throw new Error('Scene-from-product returned no image URL');
    return url;
  }

  // No inputs at all — pure text-to-image.
  const prompt = [
    `Generate a single photorealistic still of a new on-camera UGC creator: ${cleanCreator}.`,
    'Build a believable environment around the creator that fits the description (room, lighting, background props as appropriate).',
    'The creator is positioned naturally for a vertical phone video — framed mid-body, looking at the camera, ready to speak.',
    REALISM_GUIDANCE,
  ].join(' ');

  const result = await falSubscribeWithRetry(IMAGE_GENERATE, {
    prompt,
    aspect_ratio: nanoAspectFor(aspectRatio),
    num_images: 1,
    resolution: '2K',
  }, 'scene-from-text', { onProgress });
  const images = result?.data?.images || result?.images || [];
  const url = images[0]?.url;
  if (!url) throw new Error('Scene-from-text returned no image URL');
  return url;
}

/**
 * Template-mode product integration. The user picked a curated template,
 * so we DON'T want to swap the creator — but we still want the user's
 * product visible in the video. Same idea as the inspiration path, but
 * the first image is a frame extracted from the template video.
 *
 * Critical: the template creator may already be holding/featuring the
 * template's own product. We explicitly instruct Nano Banana to remove
 * any such object first so the user's product doesn't end up sharing
 * the frame with a leftover from the template.
 */
async function integrateProductIntoTemplate({
  templateFrameUrl,
  productImageUrl,
  productName,
  userTweaks,
  aspectRatio = '9:16',
  onProgress,
}) {
  const productPhrase = productName ? `"${productName}"` : 'the product';
  const hasTweaks = !!(userTweaks && userTweaks.trim());
  const parts = [
    'The FIRST image shows a person on camera in a specific scene.',
    // Identity is always locked. Scene/clothing/pose are only locked
    // when the user did not request changes — see the tweaks branch.
    hasTweaks
      ? 'Keep that person\'s face, identity, ethnicity, hair, and body type EXACTLY as in the first image. Their facial features and the person they are must not change.'
      : 'Keep that person exactly as they are — same face, same identity, same body, same clothing, same scene, same lighting, same framing.',
  ];
  if (hasTweaks) {
    parts.push(
      `Apply the following changes the user requested for the scene around this person, while keeping their identity intact: ${userTweaks.trim()}.`,
      'Adjust the environment, lighting, clothing, and props as needed to satisfy that request — but the person\'s face and identity stay locked to the first image.',
    );
  }
  parts.push(
    'IMPORTANT: if the person in the first image is currently holding, wearing, or otherwise featuring any product, item, bottle, tube, box, package, or branded object, REMOVE that original object entirely. Replace whatever they were holding with the new product described below. Do not show two products. Do not show the original product anywhere in the frame.',
    `The SECOND image is ${productPhrase} — the ONLY product that should appear in the final image.`,
    'Place that exact product naturally into the scene — typically held in the person\'s hand, or being used by them — in a way that fits the scene.',
    'Preserve the product pixel-perfectly: packaging, color, label text, shape, and branding all match the second image exactly. Do not redesign or alter the product.',
    'The product should be clearly visible and recognizable in the final image — never hide, blur, or change its branding.',
    'Photorealistic, sharp focus, natural lighting — looks like a real iPhone photo of the same person now holding this product, with no trace of any other product.',
  );
  const prompt = parts.join(' ');

  const result = await falSubscribeWithRetry(IMAGE_SUBJECT_SWAP, {
    prompt,
    image_urls: [templateFrameUrl, productImageUrl],
    aspect_ratio: nanoAspectFor(aspectRatio),
    num_images: 1,
    resolution: '2K',
  }, 'product-integrate', { onProgress });

  const images = result?.data?.images || result?.images || [];
  const url = images[0]?.url;
  if (!url) throw new Error('Product integration returned no image URL');
  return url;
}

/**
 * Template-mode product REMOVAL. The user picked a template but did not
 * supply their own product. The template creator may still be holding or
 * featuring the template's original product, which would otherwise be
 * carried into the Kling video. We run a Nano Banana edit pass to strip
 * any held/featured object out of the frame while keeping the creator,
 * scene, lighting, and framing untouched.
 */
async function stripProductFromTemplate({
  templateFrameUrl,
  userTweaks,
  aspectRatio = '9:16',
  onProgress,
}) {
  const hasTweaks = !!(userTweaks && userTweaks.trim());
  const parts = [
    'The image shows a person on camera in a specific scene.',
    hasTweaks
      ? 'Keep that person\'s face, identity, ethnicity, hair, and body type EXACTLY as in this image. Their facial features and the person they are must not change.'
      : 'Keep that person exactly as they are — same face, same identity, same body, same clothing, same hair, same expression, same pose, same scene, same lighting, same camera angle, same framing.',
  ];
  if (hasTweaks) {
    parts.push(
      `Apply the following changes the user requested for the scene around this person, while keeping their identity intact: ${userTweaks.trim()}.`,
      'Adjust the environment, lighting, clothing, and props as needed to satisfy that request — but the person\'s face and identity stay locked to the original image.',
    );
  }
  parts.push(
    'If the person is holding, wearing, displaying, pointing at, or otherwise featuring any product, item, bottle, tube, jar, box, package, phone, gadget, or branded object, REMOVE that object completely from the scene.',
    'Their hands should now be empty and relaxed in a natural position consistent with the rest of the pose — as if they were simply talking to camera with nothing in their hands.',
    'Do not add any new object. Do not introduce a replacement product.',
    hasTweaks
      ? 'If the person was not holding anything, keep their hands as-is but still apply the requested scene changes above.'
      : 'If the person was not holding anything to begin with, return the scene unchanged.',
    'Photorealistic, sharp focus, natural lighting — looks like a real iPhone photo of the same person, hands-free.',
  );
  const prompt = parts.join(' ');

  const result = await falSubscribeWithRetry(IMAGE_SUBJECT_SWAP, {
    prompt,
    image_urls: [templateFrameUrl],
    aspect_ratio: nanoAspectFor(aspectRatio),
    num_images: 1,
    resolution: '2K',
  }, 'template-strip', { onProgress });

  const images = result?.data?.images || result?.images || [];
  const url = images[0]?.url;
  if (!url) throw new Error('Template product-strip returned no image URL');
  return url;
}

// ---------------------------------------------------------------------------
// Step 2 — Kling 3.0 Pro single-shot generation WITH audio.
//
// `generate_audio: true` makes Kling render the spoken audio inline and
// lip-sync the on-camera person to that audio. The script is embedded in the
// prompt with an explicit instruction telling Kling to make the model say it.
// This replaces the old TTS → lipsync chain entirely.
// ---------------------------------------------------------------------------

function klingDurationEnum(seconds) {
  return Number(seconds) >= 8 ? '10' : '5';
}

const KLING_NEGATIVE_PROMPT =
  'professional model, supermodel, fashion model, magazine cover, glamour shot, beauty advertisement, runway, studio lighting, plastic skin, doll-like, old, elderly, aged, wrinkled, weathered face, blurry, distorted face, disfigured, watermark, text, logo, cartoon, anime, low quality, deformed hands, extra limbs, frozen still image, multiple people, split screen, scene cuts, hard cuts, silent, no audio, mute, lip movements out of sync, mouth not matching audio';

async function generateVideoFromImage({ seedImageUrl, prompt, durationSec = 10, aspectRatio = '9:16', onProgress }) {
  const result = await falSubscribeWithRetry(KLING_IMAGE_TO_VIDEO, {
    prompt,
    image_url: seedImageUrl,
    duration: klingDurationEnum(durationSec),
    aspect_ratio: aspectRatio,
    generate_audio: true,
    negative_prompt: KLING_NEGATIVE_PROMPT,
    cfg_scale: 0.5,
  }, 'kling-i2v', { onProgress });
  const url = result?.data?.video?.url || result?.video?.url;
  if (!url) throw new Error('Kling 3.0 image-to-video returned no video URL');
  return url;
}

async function generateVideoFromText({ prompt, durationSec = 10, aspectRatio = '9:16', onProgress }) {
  const result = await falSubscribeWithRetry(KLING_TEXT_TO_VIDEO, {
    prompt,
    duration: klingDurationEnum(durationSec),
    aspect_ratio: aspectRatio,
    generate_audio: true,
    negative_prompt: KLING_NEGATIVE_PROMPT,
    cfg_scale: 0.5,
  }, 'kling-t2v', { onProgress });
  const url = result?.data?.video?.url || result?.video?.url;
  if (!url) throw new Error('Kling 3.0 text-to-video returned no video URL');
  return url;
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

/**
 * Build the Kling 3.0 Pro prompt. The script is embedded directly with
 * explicit instructions for Kling to (a) make the person speak it aloud and
 * (b) lip-sync to those words. Kling renders the audio inline via
 * `generate_audio: true`, so this single call replaces the old
 * TTS + sync.so lipsync chain.
 */
function buildKlingPrompt({ script, videoDescription, creatorContext, productName, hasProductInSeed }) {
  const parts = [];
  if (creatorContext) parts.push(creatorContext);
  if (videoDescription) parts.push(videoDescription);
  if (productName) {
    if (hasProductInSeed) {
      parts.push(`The creator continues holding "${productName}" visibly in their hand throughout the video — the product stays clearly in frame, unchanged in appearance, never put down, never replaced, never altered.`);
    } else {
      parts.push(`The creator is featuring "${productName}" naturally as part of the action.`);
    }
  }
  parts.push('One continuous shot, no cuts, smooth motion, natural body language, expressive facial expression, talking to camera.');
  parts.push('The on-camera person is a naturally good-looking everyday adult — relatable, approachable, healthy. NOT a professional model and NOT a fashion ad. No glamour makeup, casual everyday clothing, candid authentic energy, shot like a vertical phone video.');

  // The script + speak + lip-sync instructions go LAST so they read as the
  // dominant directive. Kling generates audio inline via generate_audio,
  // and these lines tell it exactly what audio to produce and that the
  // mouth must track that audio precisely.
  if (script) {
    parts.push(
      `The on-camera person speaks the following script aloud, clearly and naturally, with their voice audible in the final video — their lip movements MUST be perfectly synchronized with every word they say:`,
      `"${script}"`,
      'Their mouth shapes match each word, the audio is the person\'s own voice speaking these exact lines, and the lip-sync is tight throughout — no silent video, no mismatched mouth movement.'
    );
  }
  return parts.filter(Boolean).join(' ').slice(0, 1800);
}

// ---------------------------------------------------------------------------
// Top-level orchestration — two API calls, period.
//
//   1. Nano Banana → seed image. One of:
//        a. Inspiration provided → subject-swap (keep scene, swap person,
//           integrate product if present)
//        b. Template snapshot → extract frame + integrate product if present
//        c. Direct mode → synthesize creator-in-scene from prompt (and
//           product image if provided)
//   2. Kling 3.0 Pro image-to-video, generate_audio: true, with the script
//      embedded in the prompt + explicit lip-sync directive.
//
// No TTS, no sync.so lipsync, no B-roll cuts. Two calls total.
// ---------------------------------------------------------------------------

async function runSingleShotPipeline(job, jobId) {
  const snapshot = job.template_snapshot || {};
  const inspirationImageUrl = job.inspiration_image_url || null;
  const templateVideoUrl = snapshot.video_url || null;

  const videoDescription = (job.video_description || '').trim();
  const scriptText = (job.script || '').trim();
  if (!scriptText) throw new Error('Script is empty');

  const videoDuration = job.video_duration || 10;
  const aspectRatio = snapshot.aspect_ratio || '9:16';

  const creatorContext = [snapshot.actor_name, snapshot.setting, snapshot.description]
    .filter(Boolean)
    .join(', ') || 'a lifestyle creator on camera';

  // Optional template-mode tweaks: "same creator but on a beach", etc.
  // Passed into both Nano Banana branches so the seed image can reflect
  // the user's adjustments while keeping the template creator's identity.
  const userTweaks = (snapshot.user_tweaks || '').trim();

  const effectiveVideoDesc = videoDescription
    || (job.product_name
        ? `The creator engages naturally with ${job.product_name}, gesturing and talking to camera.`
        : 'The creator talks directly to camera with expressive body language and a warm smile.');

  // Progress bands. Two stages now (image swap + Kling), so the Kling call
  // owns most of the bar. If there's no inspiration/template, we skip
  // straight to Kling and the band starts low.
  const reportStage = async (status, lo, hi) => {
    await updateJob(jobId, { status, progress: Math.round(lo) });
    return (frac) => {
      const clamped = Math.max(0, Math.min(1, frac));
      const target = Math.round(lo + (hi - lo) * clamped);
      updateJob(jobId, { progress: target }).catch(() => {});
    };
  };

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `ugc-${jobId}-`));
  try {
    // ---- Step 1: resolve the seed image (optional) ----
    let seedImageUrl = null;
    let seedKind = 'none';

    const productImageUrl = job.product_image_url || null;

    if (inspirationImageUrl) {
      const tick = await reportStage('rendering_scene', 5, 30);
      console.log(`[ugc:${jobId}] reimagining inspiration${productImageUrl ? ' + product' : ''} via Nano Banana Pro`);
      const reimaginedUrl = await reimagineCreatorInScene({
        inspirationImageUrl,
        productImageUrl,
        productName: job.product_name,
        creatorDescription: creatorContext,
        aspectRatio,
        onProgress: tick,
      });
      seedImageUrl = await mirrorRemote(reimaginedUrl, jobId, 'image');
      await updateJob(jobId, { creator_scene_image_url: seedImageUrl }).catch(() => {});
      seedKind = productImageUrl ? 'inspiration+product' : 'inspiration';
      console.log(`[ugc:${jobId}] inspiration → seed image complete (${seedKind})`);
    } else if (!templateVideoUrl) {
      // Direct mode with no inspiration. We still want a Nano Banana still
      // as the Kling seed frame — synthesize one from the creator
      // description + optional product image.
      const tick = await reportStage('rendering_scene', 5, 30);
      console.log(`[ugc:${jobId}] synthesizing creator scene${productImageUrl ? ' + product' : ''} via Nano Banana Pro`);
      const synthUrl = await synthesizeCreatorScene({
        productImageUrl,
        productName: job.product_name,
        creatorDescription: creatorContext,
        aspectRatio,
        onProgress: tick,
      });
      seedImageUrl = await mirrorRemote(synthUrl, jobId, 'image');
      await updateJob(jobId, { creator_scene_image_url: seedImageUrl }).catch(() => {});
      seedKind = productImageUrl ? 'prompt+product' : 'prompt';
      console.log(`[ugc:${jobId}] prompt → seed image complete (${seedKind})`);
    }

    if (templateVideoUrl) {
      await reportStage('preparing', 5, 15);
      console.log(`[ugc:${jobId}] extracting seed frame from template`);
      const { buffer: vidBuf } = await downloadToBuffer(templateVideoUrl);
      const templatePath = path.join(workDir, 'template.mp4');
      fs.writeFileSync(templatePath, vidBuf);
      const framePath = path.join(workDir, 'seed.jpg');
      await ffmpegExtractFrame(templatePath, framePath, 1.0);
      const frameBuf = fs.readFileSync(framePath);
      let templateFrameUrl = await uploadBufferToBucket(
        frameBuf, 'image/jpeg', 'jpg', `jobs/${jobId}/seed`
      );
      await updateJob(jobId, { creator_reference_image_url: templateFrameUrl }).catch(() => {});
      seedImageUrl = templateFrameUrl;
      seedKind = 'template';

      if (productImageUrl) {
        // User supplied a product → swap the template's original product
        // (if any) out and the user's product in, in one Nano Banana pass.
        const tick = await reportStage('rendering_scene', 16, 30);
        console.log(`[ugc:${jobId}] swapping template product for user product via Nano Banana Pro`);
        const integratedUrl = await integrateProductIntoTemplate({
          templateFrameUrl,
          productImageUrl,
          productName: job.product_name,
          userTweaks,
          aspectRatio,
          onProgress: tick,
        });
        seedImageUrl = await mirrorRemote(integratedUrl, jobId, 'image');
        await updateJob(jobId, { creator_scene_image_url: seedImageUrl }).catch(() => {});
        seedKind = 'template+product';
        console.log(`[ugc:${jobId}] template + product seed image complete`);
      } else {
        // No user product → the template creator may still be holding the
        // template's original product. Run a strip pass so the user's
        // talking-head video doesn't surface someone else's branding.
        const tick = await reportStage('rendering_scene', 16, 30);
        console.log(`[ugc:${jobId}] stripping any template product from frame via Nano Banana Pro`);
        const strippedUrl = await stripProductFromTemplate({
          templateFrameUrl,
          userTweaks,
          aspectRatio,
          onProgress: tick,
        });
        seedImageUrl = await mirrorRemote(strippedUrl, jobId, 'image');
        await updateJob(jobId, { creator_scene_image_url: seedImageUrl }).catch(() => {});
        seedKind = 'template-clean';
        console.log(`[ugc:${jobId}] template clean seed image complete`);
      }
    }

    // ---- Step 2: single Kling 3.0 Pro generation (with audio + lip-sync) ----
    // Captioning (optional, default ON) eats the last 6 percent of the
    // progress bar — Kling owns 32–90, captioning 90–96.
    const captionsEnabled = snapshot.captions_enabled !== false;
    const videoTick = await reportStage('generating_video', 32, captionsEnabled ? 90 : 96);
    const klingPrompt = buildKlingPrompt({
      script: scriptText,
      videoDescription: effectiveVideoDesc,
      creatorContext,
      productName: job.product_name,
      hasProductInSeed: !!productImageUrl && (seedKind === 'inspiration+product' || seedKind === 'template+product'),
    });
    console.log(`[ugc:${jobId}] kling 3.0 pro ${seedImageUrl ? 'i2v' : 't2v'} (seed=${seedKind}, ${videoDuration}s, audio=on)`);

    const klingVideoUrl = seedImageUrl
      ? await generateVideoFromImage({
          seedImageUrl,
          prompt: klingPrompt,
          durationSec: videoDuration,
          aspectRatio,
          onProgress: videoTick,
        })
      : await generateVideoFromText({
          prompt: klingPrompt,
          durationSec: videoDuration,
          aspectRatio,
          onProgress: videoTick,
        });

    // Fetch the Kling MP4 to disk once. We may need to caption it next,
    // and ffmpeg works on file paths — staging to disk avoids a second
    // round-trip through Supabase to read the bytes back.
    const klingLocalPath = path.join(workDir, 'kling.mp4');
    {
      const { buffer } = await downloadToBuffer(klingVideoUrl);
      fs.writeFileSync(klingLocalPath, buffer);
    }

    let videoBytesToUpload = fs.readFileSync(klingLocalPath);
    let captionStats = null;
    let captionError = null;
    if (captionsEnabled) {
      await reportStage('captioning', 90, 96);
      console.log(`[ugc:${jobId}] burning captions via whisper + libass`);
      const captionedPath = path.join(workDir, 'captioned.mp4');
      try {
        captionStats = await captionVideo({
          inputPath: klingLocalPath,
          outputPath: captionedPath,
          scriptHint: scriptText,
        });
        videoBytesToUpload = fs.readFileSync(captionedPath);
        console.log(
          `[ugc:${jobId}] captions burned (${captionStats.wordCount} words, ${captionStats.cues} cues)`
        );
      } catch (capErr) {
        // Caption failure is never fatal — fall through with the raw Kling
        // bytes so the user still gets a video. We now log loudly AND
        // remember the reason for the finalize step so it lands on the
        // job row (best-effort; failure to persist the note is OK).
        captionError = capErr?.message || String(capErr);
        console.error(`[ugc:${jobId}] caption pipeline failed, shipping uncaptioned video: ${captionError}`);
      }
    } else {
      console.log(`[ugc:${jobId}] captions disabled by user — skipping`);
    }

    const finalVideoUrl = await uploadBufferToBucket(
      videoBytesToUpload,
      'video/mp4',
      'mp4',
      `jobs/${jobId}/video`
    );
    console.log(`[ugc:${jobId}] final video → ${finalVideoUrl}${captionStats ? ' (captioned)' : ''}`);

    // ---- Step 3: finalize ----
    await updateJob(jobId, { status: 'finalizing', progress: 98 });
    const completionPatch = {
      status: 'completed',
      progress: 100,
      output_video_url: finalVideoUrl,
      output_thumbnail_url: snapshot.thumbnail_url || seedImageUrl || null,
      completed_at: new Date().toISOString(),
    };
    // If the user asked for captions and the burn-in failed, surface the
    // reason on the row so operations can see why future jobs aren't
    // getting captions without trawling logs. We don't fail the job —
    // they still get a watchable video.
    if (captionError) {
      completionPatch.error = `captions_skipped: ${captionError.slice(0, 400)}`;
    }
    await updateJob(jobId, completionPatch);
    console.log(`[ugc:${jobId}] DONE → ${finalVideoUrl}${captionError ? ` (captions skipped: ${captionError})` : ''}`);
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

async function runUGCJob(job) {
  const jobId = job.id;
  const hasInspiration = !!job.inspiration_image_url;
  const hasTemplate = !!(job.template_snapshot && job.template_snapshot.video_url);
  const hasVideoDescription = !!(job.video_description || '').trim();
  console.log(
    `[ugc:${jobId}] starting pipeline ` +
    `seed=${hasInspiration ? 'inspiration' : hasTemplate ? 'template' : 'none'} ` +
    `product_image=${job.product_image_url ? 'yes' : 'no'} ` +
    `video_desc=${hasVideoDescription ? 'yes' : 'no'} ` +
    `video_dur=${job.video_duration || 'n/a'}`
  );
  await updateJob(jobId, {
    status: 'planning',
    progress: 5,
    started_at: new Date().toISOString(),
  });

  try {
    if (!isFalEnabled()) {
      console.warn(`[ugc:${jobId}] FAL_KEY missing — running in MOCK mode`);
      await new Promise((r) => setTimeout(r, 1500));
      await updateJob(jobId, { status: 'generating_video', progress: 50 });
      await new Promise((r) => setTimeout(r, 2500));
      const snapshot = job.template_snapshot || {};
      await updateJob(jobId, {
        status: 'completed',
        progress: 100,
        output_video_url: snapshot.video_url || null,
        output_thumbnail_url: snapshot.thumbnail_url || null,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    await runSingleShotPipeline(job, jobId);
  } catch (err) {
    console.error(`[ugc:${jobId}] pipeline failed:`, err);
    const errMsg = err?.message || String(err);
    await updateJob(jobId, {
      status: 'failed',
      error: errMsg.slice(0, 500),
      completed_at: new Date().toISOString(),
    });
  }
}

module.exports = {
  runUGCJob,
  UGC_BUCKET,
};
