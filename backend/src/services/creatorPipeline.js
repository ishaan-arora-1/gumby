const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { fal, isFalEnabled } = require('../config/fal');
const { KLING_TEXT_TO_VIDEO } = require('../config/falModels');

const UGC_BUCKET = 'ugc-videos';

/**
 * Standalone "creator" generation — the user types a single text prompt
 * describing the on-camera persona they want, and we turn it into a 5-15
 * second silent talking-head clip via Kling 2.6 Pro text-to-video.
 *
 * The resulting clip can either stand on its own (option C in the chat flow)
 * or be promoted into a hidden ugc_templates row that feeds straight into the
 * normal ElevenLabs TTS → sync-lipsync pipeline (option B). All of that
 * routing happens in `routes/ugc.js`; this file owns nothing but the
 * generation + mirror.
 */

async function updateJob(jobId, patch) {
  const { error } = await supabase
    .from('ugc_creator_jobs')
    .update(patch)
    .eq('id', jobId);
  if (error) {
    console.error(`[creator:${jobId}] updateJob error:`, error.message);
  }
}

async function downloadBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed (${r.status}) for ${url}`);
  const ct = r.headers.get('content-type') || '';
  return { buffer: Buffer.from(await r.arrayBuffer()), contentType: ct };
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-1500)}`));
    });
  });
}

/**
 * Best-effort faststart remux + first-frame poster extraction. If ffmpeg
 * isn't available on this host, we still return the raw bytes — iOS will
 * play the clip after a slightly longer initial buffer.
 */
async function postProcessMP4(inputBuffer) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-pp-'));
  const inPath = path.join(tmpDir, 'in.mp4');
  const fsPath = path.join(tmpDir, 'out.mp4');
  const posterPath = path.join(tmpDir, 'poster.jpg');
  fs.writeFileSync(inPath, inputBuffer);

  let videoBuffer = inputBuffer;
  let posterBuffer = null;
  try {
    await runFfmpeg(['-y', '-i', inPath, '-c', 'copy', '-movflags', '+faststart', fsPath]);
    videoBuffer = fs.readFileSync(fsPath);
  } catch (e) {
    console.warn('[creator] ffmpeg faststart skipped:', e?.message || e);
  }
  try {
    await runFfmpeg([
      '-y', '-ss', '0.6', '-i', inPath, '-frames:v', '1',
      '-vf', "scale='min(1080,iw)':-2:flags=lanczos",
      '-q:v', '4', posterPath,
    ]);
    posterBuffer = fs.readFileSync(posterPath);
  } catch (e) {
    console.warn('[creator] ffmpeg poster skipped:', e?.message || e);
  }

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return { videoBuffer, posterBuffer };
}

async function uploadToBucket(buffer, ext, contentType, keyPrefix) {
  const key = `${keyPrefix}/${uuidv4()}.${ext}`;
  const { error } = await supabase.storage.from(UGC_BUCKET).upload(key, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  const { data: signed, error: signErr } = await supabase.storage
    .from(UGC_BUCKET)
    .createSignedUrl(key, 60 * 60 * 24 * 365 * 10);
  if (signErr) throw signErr;
  return signed.signedUrl;
}

/**
 * Formats a fal.ai ValidationError into a human-readable string. The library
 * stores the FastAPI-style detail array on `err.body.detail`, which we
 * unpack so backend logs (and the user-facing job error) describe the actual
 * problem instead of a generic "Unprocessable Entity".
 */
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
  return err?.message || 'Kling generation failed';
}

async function generateTextToVideo(prompt, durationSeconds, aspectRatio) {
  // Kling 3.0 Pro text-to-video. Audio off — we layer ElevenLabs TTS via
  // the scene pipeline if the user promotes this creator into a full ad.
  // `duration` is an enum ("5" | "10"), so we clamp.
  const duration = String(durationSeconds === 10 ? 10 : 5);

  // Steer Kling away from glamour-ad casting *without* asking for
  // imperfections. The previous version explicitly invited
  // "imperfections welcome" / "ordinary face" / "average appearance"
  // which pushed the model toward wrinkled / older-looking subjects.
  // What we actually want: a normal attractive adult — like the kind of
  // person who'd film a real UGC clip on their phone. Healthy, relatable,
  // not styled by a beauty agency.
  const realnessSuffix =
    ' The person is a naturally good-looking everyday adult — relatable, approachable, healthy, the kind of person you would actually see filming UGC on their phone. NOT a professional model, NOT a fashion ad, NOT a beauty campaign. Casual everyday clothing, candid natural expression, shot like a vertical phone video.';
  const composedPrompt = `${prompt.trim()} ${realnessSuffix}`.slice(0, 1500);

  const input = {
    prompt: composedPrompt,
    duration,
    aspect_ratio: aspectRatio || '9:16',
    generate_audio: false,
    // Negative prompt does the *no-glamour-ad* steering, plus explicit
    // anti-aging terms so realism guidance doesn't get misinterpreted
    // as "make them old / wrinkled".
    negative_prompt: 'professional model, supermodel, fashion model, magazine cover, glamour shot, beauty advertisement, runway, studio lighting, plastic skin, cgi, doll-like, old, elderly, aged, wrinkled, wrinkles, weathered face, gaunt, sickly, unhealthy, blurry, distorted face, disfigured, watermark, text, logo, cartoon, anime, low quality, deformed mouth, extra limbs, frozen still image',
    cfg_scale: 0.5,
  };

  // fal's queue occasionally returns 422 for transient reasons even when the
  // input shape is valid (we've reproduced the exact same input succeeding
  // seconds after a 422). Retry once with backoff before giving up so a flaky
  // moderation pass doesn't ruin the user's first impression.
  const maxAttempts = 2;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fal.subscribe(KLING_TEXT_TO_VIDEO, { input, logs: false });
      const url = result?.data?.video?.url || result?.video?.url;
      if (!url) throw new Error('Kling 2.6 returned no video url');
      return url;
    } catch (err) {
      lastErr = err;
      // Log the full validation detail so we can see the *actual* reason
      // (the default `util.inspect` truncation hides it as `[Object]`).
      console.error(
        `[creator] fal attempt ${attempt}/${maxAttempts} failed:`,
        describeFalError(err),
        JSON.stringify(err?.body || {}).slice(0, 600)
      );
      // Only retry on transient validation / rate-limit conditions.
      const retryable = err?.status === 422 || err?.status === 429 || err?.status >= 500;
      if (!retryable || attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  const friendly = describeFalError(lastErr);
  const wrapped = new Error(friendly);
  wrapped.cause = lastErr;
  throw wrapped;
}

/**
 * Background pipeline. Caller wraps this in `setImmediate` so the HTTP
 * response returns the queued job row immediately. Errors are captured into
 * the job row so the client polling /ugc/creator/jobs/:id can surface them.
 */
async function runCreatorJob(job) {
  const jobId = job.id;
  console.log(`[creator:${jobId}] starting`);
  await updateJob(jobId, {
    status: 'generating',
    progress: 10,
    started_at: new Date().toISOString(),
  });

  try {
    if (!isFalEnabled()) {
      // Mock mode — bounce a static creator video back so local dev works
      // without the FAL_KEY. We point at one of the seeded templates so the
      // chat flow can still be exercised end-to-end.
      console.warn(`[creator:${jobId}] FAL_KEY missing — MOCK mode`);
      await new Promise((r) => setTimeout(r, 1500));
      await updateJob(jobId, { progress: 60 });
      await new Promise((r) => setTimeout(r, 1500));
      const { data: anyTemplate } = await supabase
        .from('ugc_templates')
        .select('video_url, thumbnail_url')
        .eq('is_active', true)
        .limit(1)
        .single();
      await updateJob(jobId, {
        status: 'completed',
        progress: 100,
        video_url: anyTemplate?.video_url || null,
        thumbnail_url: anyTemplate?.thumbnail_url || null,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    // ---- Step 1: Kling 2.6 text-to-video ----
    const tempUrl = await generateTextToVideo(
      job.prompt,
      job.duration_seconds,
      job.aspect_ratio
    );
    await updateJob(jobId, { progress: 70 });
    console.log(`[creator:${jobId}] kling produced url, mirroring…`);

    // ---- Step 2: mirror + faststart + poster ----
    const { buffer: rawBuf } = await downloadBuffer(tempUrl);
    const { videoBuffer, posterBuffer } = await postProcessMP4(rawBuf);

    const videoUrl = await uploadToBucket(
      videoBuffer, 'mp4', 'video/mp4', `creators/${job.user_id}/video`
    );
    let posterUrl = null;
    if (posterBuffer) {
      posterUrl = await uploadToBucket(
        posterBuffer, 'jpg', 'image/jpeg', `creators/${job.user_id}/poster`
      );
    }
    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      video_url: videoUrl,
      thumbnail_url: posterUrl,
      completed_at: new Date().toISOString(),
    });
    console.log(`[creator:${jobId}] DONE → ${videoUrl}`);
  } catch (err) {
    console.error(`[creator:${jobId}] pipeline failed:`, err);
    const errMsg = err?.message || String(err);
    await updateJob(jobId, {
      status: 'failed',
      error: errMsg.slice(0, 500),
      completed_at: new Date().toISOString(),
    });
  }
}

module.exports = { runCreatorJob };
