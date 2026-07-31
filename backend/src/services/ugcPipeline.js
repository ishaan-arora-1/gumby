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
  IMAGE_SUBJECT_SWAP,
  IMAGE_GENERATE,
} = require('../config/falModels');
const { genai, isGenaiEnabled, OMNI_VIDEO_MODEL } = require('../config/googleGenai');
const { captionVideo } = require('./captioning');
const { ffmpegPath } = require('../config/ffmpeg');
const credits = require('./credits');

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

// Best-effort first-frame poster for a finished clip. Returns a JPEG buffer,
// or null if ffmpeg is missing / fails — the thumbnail is non-critical (the
// clients fall back to the video itself). Needed because there's no longer a
// seed still to use as the history/library thumbnail.
function extractPosterFrame(videoPath, outPath) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, [
      '-y', '-ss', '0.5', '-i', videoPath, '-frames:v', '1',
      '-vf', "scale='min(1080,iw)':-2:flags=lanczos", '-q:v', '4', outPath,
    ], { stdio: 'ignore' });
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) return resolve(null);
      try { resolve(fs.readFileSync(outPath)); } catch { resolve(null); }
    });
  });
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

// A transient FAL failure is one where the render itself is fine but the
// gateway momentarily couldn't talk to us: 5xx (incl. the "504 Downstream
// service unavailable" gateway error), 429 rate limits, and bare network
// errors (no HTTP status). Anything else — 4xx validation, etc. — is a real,
// non-retryable failure.
function isTransientFalError(err) {
  const status = err?.status;
  return status === undefined || status === 429
    || (typeof status === 'number' && status >= 500);
}

// Poll cadence + ceilings for the queue API.
const QUEUE_POLL_INTERVAL_MS = 2500;
const QUEUE_MAX_POLLS = 360;                 // ~15 min hard ceiling
const QUEUE_MAX_CONSECUTIVE_ERRORS = 8;      // transient poll/result errors tolerated

/**
 * Run a FAL model via the explicit QUEUE API instead of `fal.subscribe`.
 *
 * Why this exists: `fal.subscribe` couples submit + poll + result-fetch into
 * one opaque call, and our retry wrapper around it RE-SUBMITS on any 5xx.
 * That caused the real bug we hit in production: FAL finished a Kling render
 * (and billed our FAL account), but its gateway returned
 * "504 Downstream service unavailable" while delivering the result. The
 * subscribe call threw, the job was marked `failed`, the user saw the 504 —
 * and a retry would have re-run (and re-billed) a brand-new render instead of
 * picking up the one that already finished.
 *
 * The queue API decouples those steps:
 *   1. submit ONCE → request_id  (the only call that starts/bills a render)
 *   2. persist the request_id (onRequestId) so a redeploy can recover it
 *   3. poll status; a transient 504/5xx here re-polls the SAME request —
 *      it never resubmits, so we don't lose or double-bill the render
 *   4. on COMPLETED, fetch the result, tolerating transient delivery errors
 *      (this is the exact step that used to 504 after the render had run)
 */
async function falQueueWithRetry(model, input, label, opts = {}) {
  const { onProgress, onRequestId } = opts;

  // --- 1. Submit once. Resubmit ONLY if the submit itself never landed. ---
  const submitMaxAttempts = 3;
  let submitted, submitErr;
  for (let attempt = 1; attempt <= submitMaxAttempts; attempt++) {
    try {
      submitted = await fal.queue.submit(model, { input });
      break;
    } catch (err) {
      submitErr = err;
      console.error(
        `[${label}] fal queue submit attempt ${attempt}/${submitMaxAttempts} failed:`,
        describeFalError(err)
      );
      if (!isTransientFalError(err) || attempt === submitMaxAttempts) break;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  const requestId = submitted?.request_id;
  if (!requestId) {
    const wrapped = new Error(describeFalError(submitErr || new Error('fal submit failed')));
    wrapped.cause = submitErr;
    throw wrapped;
  }
  console.log(`[${label}] fal queue request_id=${requestId}`);
  if (onRequestId) { try { await onRequestId(requestId); } catch {} }

  // --- 2. Smooth progress heartbeat (same feel as falSubscribeWithRetry). ---
  let heartbeat = null;
  let lastReported = 0;
  if (onProgress) {
    try { onProgress(0.05); } catch {}
    lastReported = 0.05;
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
    // --- 3. Poll for completion; transient errors re-poll the SAME request. ---
    let consecutiveErrors = 0;
    for (let poll = 0; poll < QUEUE_MAX_POLLS; poll++) {
      await new Promise((r) => setTimeout(r, QUEUE_POLL_INTERVAL_MS));
      let status;
      try {
        status = await fal.queue.status(model, { requestId, logs: false });
        consecutiveErrors = 0;
      } catch (err) {
        if (isTransientFalError(err) && ++consecutiveErrors <= QUEUE_MAX_CONSECUTIVE_ERRORS) {
          console.warn(
            `[${label}] transient status poll error ` +
            `(${consecutiveErrors}/${QUEUE_MAX_CONSECUTIVE_ERRORS}): ` +
            `${describeFalError(err)} — re-polling same request ${requestId}`
          );
          continue;
        }
        const wrapped = new Error(describeFalError(err));
        wrapped.cause = err;
        throw wrapped;
      }

      if (status?.status !== 'COMPLETED') continue;

      // --- 4. Render done — fetch result, tolerating transient delivery 504s. ---
      let resultErrors = 0;
      for (;;) {
        try {
          const result = await fal.queue.result(model, { requestId });
          if (onProgress) { try { onProgress(1); } catch {} }
          return result;
        } catch (err) {
          if (isTransientFalError(err) && ++resultErrors <= QUEUE_MAX_CONSECUTIVE_ERRORS) {
            console.warn(
              `[${label}] transient result-fetch error ` +
              `(${resultErrors}/${QUEUE_MAX_CONSECUTIVE_ERRORS}): ` +
              `${describeFalError(err)} — retrying fetch for ${requestId}`
            );
            await new Promise((r) => setTimeout(r, QUEUE_POLL_INTERVAL_MS));
            continue;
          }
          const wrapped = new Error(describeFalError(err));
          wrapped.cause = err;
          throw wrapped;
        }
      }
    }
    throw new Error(`${label}: timed out waiting for fal queue request ${requestId}`);
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
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
      return `Image ${n} is the CREATOR — the EXACT, specific real person to feature on camera. Reproduce this individual IDENTICALLY: keep their face, facial structure, skin tone, ETHNICITY, eye shape and color, hair, and body type EXACTLY as shown in the reference. Do NOT change their ethnicity or skin color in any way — in particular do not make them look more South Asian or Indian than the reference, and do not shift them toward any other ethnicity. Keep the clothing they are wearing as shown. Do not swap them for a different person and do not restyle their outfit. Preserving this person's identity exactly takes priority over any generic styling.`;
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

// Steer the DEFAULT appearance of a freshly-synthesized on-camera person.
// Without this, the image model (Nano Banana Pro) defaults to a South Asian /
// Indian look when the request doesn't mention ethnicity. This makes the
// unspecified default a mainstream American appearance, while explicitly
// yielding to any ethnicity/nationality the user DID ask for. Only used when
// there is no creator reference image to preserve (never overrides a real
// template creator's identity).
const DEFAULT_APPEARANCE_GUARD =
  'ETHNICITY: If — and only if — the request does NOT explicitly specify the on-camera person\'s ethnicity, nationality, or race, make them a good-looking, everyday American with a mainstream White/Caucasian American appearance — NOT South Asian and NOT Indian. Keep whatever gender the request implies (a handsome American man or an attractive American woman). If the request DOES explicitly name an ethnicity or nationality, follow that exactly and ignore this default.';

function buildSeedPrompt(userPrompt, attachments) {
  const trimmed = (userPrompt || '').trim();
  const parts = [];
  if (!attachments.length) {
    parts.push(
      'Generate a single photorealistic still image.',
      `USER REQUEST: ${trimmed}`,
    );
    return parts.join('\n\n');
  }
  // With reference photos we still have to tell Nano Banana what each image
  // is (product to preserve, creator to keep, etc.) or it can't composite
  // them correctly — that's the one thing that isn't just "extra description".
  parts.push(
    `Generate a single photorealistic still image using the ${attachments.length} reference image(s) below, combined per the user's request.`,
    `USER REQUEST: ${trimmed}`,
    'Each input image has a specific role — follow these exactly:',
    attachments.map((a, i) => `- ${roleDirective(a.role, i)}`).join('\n'),
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
// Template seed compositing (product swap)
// ---------------------------------------------------------------------------

// Compositing instruction for the template seed frame. Deliberately
// CREATOR-AGNOSTIC — it never asserts a person is present, so the same prompt
// works for creator templates AND plain product-shot templates. It only says:
// swap in the user's product, keep everything else identical.
const TEMPLATE_SEED_SWAP_PROMPT = [
  'Image 1 is a reference scene. The remaining image(s) show a new product.',
  'Replace the product shown in the reference scene with the new product. Preserve the new product exactly as shown — its shape, color, label text, and branding.',
  'Keep everything else in the scene identical: the same people (if any), the same setting, lighting, camera framing, and composition. Change nothing but the product.',
  'If no product is present in the reference scene, add the new product into the scene naturally.',
].join(' ');

/**
 * Build the single seed frame for a TEMPLATE job: take the template's own
 * reference frame and swap the user's product into it via Nano Banana, keeping
 * the template's creator (if any), setting, framing, and lighting intact. That
 * one still is what Omni then animates — so the video keeps the template's look
 * but shows the user's product. Returns a remote fal URL (caller mirrors it).
 */
async function composeTemplateSeed({ sceneUrl, productUrls, aspectRatio, onProgress }) {
  const result = await falSubscribeWithRetry(IMAGE_SUBJECT_SWAP, {
    prompt: TEMPLATE_SEED_SWAP_PROMPT,
    image_urls: [sceneUrl, ...productUrls],
    aspect_ratio: nanoAspectFor(aspectRatio),
    num_images: 1,
    resolution: '2K',
  }, 'template-seed', { onProgress });
  const images = result?.data?.images || result?.images || [];
  const url = images[0]?.url;
  if (!url) throw new Error('Template seed compositing returned no URL');
  return url;
}

// ---------------------------------------------------------------------------
// Step 2 — Kling Video v3 Pro image-to-video (with inline audio)
// ---------------------------------------------------------------------------

function klingDurationEnum(seconds) {
  const n = Number(seconds);
  if (n >= 13) return '15';
  if (n >= 8) return '10';
  return '5';
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
 * Build the video prompt sent to Omni Flash. Nothing but the user's own input:
 * their free-form prompt, then (only when a script exists) the script itself,
 * labelled neutrally as the script — NOT "the creator says", since the prompt
 * may ask for a voiceover with no on-camera creator. When the script is turned
 * off, nothing about a script is added. No per-image directives — the reference
 * images are handed to Omni as-is and the model figures out what each one is.
 */
function buildKlingPrompt({ userPrompt, script }) {
  const trimmedPrompt = (userPrompt || '').trim();
  const trimmedScript = (script || '').trim();
  const parts = [];
  if (trimmedPrompt) parts.push(trimmedPrompt);
  if (trimmedScript) parts.push(`The script is: "${trimmedScript}"`);
  return parts.join(' ').slice(0, 1800);
}

// Omni Flash duration is a STRING on the video response_format, and it MUST
// carry the "s" suffix — verified against the live API: "5" is rejected
// (400 Invalid input at 'response_format'), "5s" is accepted. The model is
// hard-capped at 10s; our tiers are 5/10/15 so a 15s request clamps to 10.
function omniDurationStr(seconds) {
  const n = Number(seconds) || 10;
  const clamped = Math.max(3, Math.min(10, n >= 13 ? 10 : n));
  return `${clamped}s`;
}

// Omni Flash only supports 16:9 and 9:16. Our UI also allows 1:1, which we map
// to the vertical 9:16 UGC default.
function omniAspectFor(aspectRatio) {
  return aspectRatio === '16:9' ? '16:9' : '9:16';
}

/**
 * Generate the final clip DIRECTLY via **Gemini Omni Flash** on Google's
 * Interactions API (the new `@google/genai` SDK) — there is no separate image
 * generation / seed-compositing pass anymore. The reference images (creator,
 * product, background, style — however many) go straight into the video model:
 *   - 0 images  → text-to-video (input is just the text prompt).
 *   - N images  → reference-to-video (each image is an inline base64 part; the
 *                 model works out what each one is — no per-image directives).
 *
 * Notes:
 *   - Omni takes images as INLINE base64 (not URLs), so each reference is
 *     downloaded and re-encoded.
 *   - No `generate_audio` flag: Omni produces audio natively, steered by the
 *     prompt. The spoken script is embedded in `prompt` by buildKlingPrompt.
 *   - The call is synchronous (background/store/stream all false); a retry
 *     re-runs the generation, so we only retry transient 5xx/429/network
 *     errors, never hard 4xx validation.
 *
 * Returns a signed Supabase URL (we upload the returned bytes) so the rest of
 * the pipeline — download-for-captioning, final upload — is unchanged.
 */
async function generateVideoWithOmni({
  images = [], prompt, durationSec, aspectRatio, onProgress,
}) {
  if (!isGenaiEnabled()) {
    throw new Error('GEMINI_API_KEY missing — required for Omni Flash video generation');
  }

  // Download + base64-encode each reference image (Omni takes inline bytes,
  // not URLs). They're passed in order, matching the "Image N" references the
  // prompt makes.
  const imageParts = [];
  for (const img of images) {
    const { buffer, contentType } = await downloadToBuffer(img.url);
    const mime = contentType.includes('png') ? 'image/png'
      : contentType.includes('webp') ? 'image/webp'
      : 'image/jpeg';
    imageParts.push({ type: 'image', data: buffer.toString('base64'), mime_type: mime });
  }
  const input = [...imageParts, { type: 'text', text: prompt }];

  // Smooth progress heartbeat while the synchronous generation runs, so the
  // client's progress bar keeps moving — same feel as the FAL wrapper.
  let heartbeat = null;
  let lastReported = 0;
  if (onProgress) {
    try { onProgress(0.05); } catch {}
    lastReported = 0.05;
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
    const maxAttempts = 2;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const interaction = await genai.interactions.create({
          model: OMNI_VIDEO_MODEL,
          background: false,
          store: false,
          stream: false,
          input,
          response_format: {
            type: 'video',
            aspect_ratio: omniAspectFor(aspectRatio),
            delivery: 'inline',
            duration: omniDurationStr(durationSec),
          },
        });

        // `output_video` is the SDK convenience field: a VideoContent with
        // either inline base64 `data` (delivery: 'inline') or a hosted `uri`.
        const out = interaction?.output_video;
        let videoBuf = null;
        if (out?.data) {
          videoBuf = Buffer.from(out.data, 'base64');
        } else if (out?.uri) {
          // Large clips can come back as a hosted file instead of inline —
          // fetch the bytes directly. (If this turns out to need Files-API
          // polling until ACTIVE, that's the place to add it.)
          const dl = await downloadToBuffer(out.uri);
          videoBuf = dl.buffer;
        }
        if (!videoBuf || videoBuf.length === 0) {
          throw new Error('Omni Flash returned no video bytes');
        }

        // Upload into our bucket so the caller gets a stable URL it owns,
        // exactly like the mirrored Kling/fal URL it used to receive.
        const url = await uploadBufferToBucket(videoBuf, 'video/mp4', 'mp4', 'omni/video');
        if (onProgress) { try { onProgress(1); } catch {} }
        return url;
      } catch (err) {
        lastErr = err;
        console.error(
          `[omni] attempt ${attempt}/${maxAttempts} failed:`,
          err?.message || String(err)
        );
        if (!isTransientFalError(err) || attempt === maxAttempts) break;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    const wrapped = new Error(`Omni Flash video generation failed: ${lastErr?.message || lastErr}`);
    wrapped.cause = lastErr;
    throw wrapped;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
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
  // The template's own reference frame, present when the user came from a
  // template or "use this video as a template". Its presence is what marks a
  // job as a TEMPLATE job (→ product-swap seed path below).
  const templateCreatorUrl = (snapshot.creator_image_url || '').trim() || null;

  // The user's supplied reference images (their product, mainly). A plain list
  // of URLs. Accepts either `attachment_urls` (plain) or the pre-tagged
  // `attachments: [{url}]` shape (blueprints / older callers).
  const attachmentUrls = Array.isArray(snapshot.attachment_urls)
    ? snapshot.attachment_urls.filter((u) => typeof u === 'string' && u.length > 0)
    : [];
  let productUrls = [];
  if (Array.isArray(snapshot.attachments) && snapshot.attachments.length) {
    productUrls = snapshot.attachments
      .filter((a) => a && typeof a.url === 'string' && a.url.length > 0)
      .map((a) => a.url);
  } else {
    productUrls = attachmentUrls;
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

    // ---- Resolve the image(s) handed to Omni ----
    // TEMPLATE jobs (a template reference frame is present) get a compositing
    // pass first: Nano Banana swaps the user's product INTO the template's own
    // frame, and Omni animates that single seed — so the video keeps the
    // template's look (creator, if any, + setting) but shows the user's
    // product. FREE-FORM / BLUEPRINT jobs skip compositing entirely and hand
    // their images straight to Omni.
    const isTemplateJob = !!templateCreatorUrl;
    let omniImages;
    if (isTemplateJob && productUrls.length) {
      const seedTick = await reportStage('rendering_scene', 5, 30);
      console.log(
        `[ugc:${jobId}] template seed: swapping product into template frame ` +
        `(products=${productUrls.length})`
      );
      const rawSeedUrl = await composeTemplateSeed({
        sceneUrl: templateCreatorUrl,
        productUrls,
        aspectRatio,
        onProgress: seedTick,
      });
      const seedUrl = await mirrorRemote(rawSeedUrl, jobId, 'image');
      console.log(`[ugc:${jobId}] template seed → ${seedUrl}`);
      omniImages = [{ url: seedUrl }];
    } else if (isTemplateJob) {
      // Template with no product to swap — animate the template frame as-is.
      console.log(`[ugc:${jobId}] template with no product — animating template frame directly`);
      omniImages = [{ url: templateCreatorUrl }];
    } else {
      // Free-form / blueprint — hand Omni the user's images directly.
      omniImages = productUrls.map((url) => ({ url }));
    }

    // ---- Omni Flash generates the video ----
    const videoLo = isTemplateJob && productUrls.length ? 32 : 5;
    const videoTick = await reportStage('generating_video', videoLo, captionsEnabled ? 90 : 96);
    const klingPrompt = buildKlingPrompt({ userPrompt, script });
    console.log(
      `[ugc:${jobId}] omni ` +
      `${isTemplateJob ? 'template-seed' : (omniImages.length ? 'reference' : 'text')}-to-video ` +
      `(${videoDuration}s, imgs=${omniImages.length}, ratio=${aspectRatio})`
    );
    const klingVideoUrl = await generateVideoWithOmni({
      images: omniImages,
      prompt: klingPrompt,
      durationSec: videoDuration,
      aspectRatio,
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

    // Stage the Omni output to disk for captioning + poster extraction.
    const klingLocalPath = path.join(workDir, 'omni.mp4');
    {
      const { buffer } = await downloadToBuffer(klingVideoUrl);
      fs.writeFileSync(klingLocalPath, buffer);
    }

    // Best-effort first-frame poster for history/library thumbnails — there's
    // no seed still to use anymore. Non-critical: stays null on any failure.
    let thumbnailUrl = null;
    try {
      const posterBuf = await extractPosterFrame(klingLocalPath, path.join(workDir, 'poster.jpg'));
      if (posterBuf) {
        thumbnailUrl = await uploadBufferToBucket(posterBuf, 'image/jpeg', 'jpg', `jobs/${jobId}/thumb`);
      }
    } catch {}

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
          aspectRatio,
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
      output_thumbnail_url: thumbnailUrl,
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
