const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { fal, isFalEnabled } = require('../config/fal');
const { ELEVENLABS_TTS, SYNC_LIPSYNC, KLING_ELEMENTS } = require('../config/falModels');

const UGC_BUCKET = 'ugc-videos';

const TTS_MODEL = ELEVENLABS_TTS;
const LIPSYNC_MODEL = SYNC_LIPSYNC;

// ElevenLabs preset voices we expose to the client. Voice IDs are the
// ElevenLabs library names that fal accepts directly. This list was
// validated against `fal-ai/elevenlabs/tts/multilingual-v2` — the older
// legacy voices (Bella, Domi, Elli, Antoni, Sam, Josh) have been removed
// from the public catalog so we no longer surface them.
const VOICE_PRESETS = [
  { id: 'Rachel',    label: 'Rachel · warm female',      gender: 'female', sample: "Real talk, this is the only thing I've been reaching for all week." },
  { id: 'Aria',      label: 'Aria · expressive female',  gender: 'female', sample: "Okay so I have to tell you about this because I'm obsessed." },
  { id: 'Sarah',     label: 'Sarah · soft female',       gender: 'female', sample: "Honestly, my whole routine has changed and I'm not going back." },
  { id: 'Jessica',   label: 'Jessica · vibrant female',  gender: 'female', sample: "Hey loves — I had to come on here and show you this." },
  { id: 'Charlotte', label: 'Charlotte · friendly female', gender: 'female', sample: "If you're looking for your new favorite thing, stop scrolling." },
  { id: 'Lily',      label: 'Lily · youthful female',    gender: 'female', sample: "I'm not even kidding, you guys, this changed everything for me." },
  { id: 'Adam',      label: 'Adam · grounded male',      gender: 'male',   sample: "Real talk — if you're not using this yet, you're missing out." },
  { id: 'Roger',     label: 'Roger · confident male',    gender: 'male',   sample: "Let me put you onto something that genuinely worked for me." },
  { id: 'Will',      label: 'Will · upbeat male',        gender: 'male',   sample: "Yo, I have to tell you, this is hands-down the best one out there." },
  { id: 'Liam',      label: 'Liam · friendly male',      gender: 'male',   sample: "Okay so listen — I've been using this every day, here's why." },
  { id: 'Brian',     label: 'Brian · narrator male',     gender: 'male',   sample: "There's a reason everyone's been talking about this lately." },
  { id: 'Chris',     label: 'Chris · steady male',       gender: 'male',   sample: "I'll keep it short — this is the real deal, period." },
];

const VALID_VOICE_IDS = new Set(VOICE_PRESETS.map((v) => v.id));

/// Map deprecated voice names to their nearest modern equivalent. The chat
/// view-model defaults to whatever voice_id a template carries, so
/// older curated templates that were seeded with "Bella"/"Domi"/etc. should
/// still produce a working job instead of a 422.
const LEGACY_VOICE_REMAP = {
  Bella:  'Aria',
  Domi:   'Jessica',
  Elli:   'Lily',
  Antoni: 'Liam',
  Sam:    'Brian',
  Josh:   'Will',
};

function normalizeVoiceId(raw) {
  const id = (raw || '').trim();
  if (VALID_VOICE_IDS.has(id)) return id;
  if (LEGACY_VOICE_REMAP[id]) return LEGACY_VOICE_REMAP[id];
  return 'Rachel';
}

async function updateJob(jobId, patch) {
  const { error } = await supabase
    .from('ugc_jobs')
    .update(patch)
    .eq('id', jobId);
  if (error) {
    console.error(`[ugc:${jobId}] updateJob error:`, error.message);
  }
}

async function uploadBufferToStorage(buffer, contentType, ext, jobId) {
  const path = `jobs/${jobId}/${uuidv4()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(UGC_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  if (upErr) throw upErr;
  const { data: signed } = await supabase.storage
    .from(UGC_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  return signed?.signedUrl || null;
}

async function downloadToBuffer(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed (${resp.status}) for ${url}`);
  const ct = resp.headers.get('content-type') || '';
  const buf = Buffer.from(await resp.arrayBuffer());
  return { buffer: buf, contentType: ct };
}

/**
 * Unwrap fal.ai's FastAPI-style validation envelope (`body.detail[]`) into a
 * single human-readable string so logs + the user-visible `error` field tell
 * us *why* a call failed, instead of just "Unprocessable Entity".
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
  return err?.message || 'fal request failed';
}

async function falSubscribeWithRetry(model, input, label) {
  const maxAttempts = 2;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fal.subscribe(model, { input, logs: false });
    } catch (err) {
      lastErr = err;
      console.error(
        `[${label}] fal attempt ${attempt}/${maxAttempts} failed:`,
        describeFalError(err),
        JSON.stringify(err?.body || {}).slice(0, 700)
      );
      // Only retry on transient/rate-limit conditions. Hard validation errors
      // (e.g. "Voice not found") are deterministic — there's no point retrying.
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

async function generateTTS(text, voiceId) {
  const voice = normalizeVoiceId(voiceId);
  const result = await falSubscribeWithRetry(TTS_MODEL, {
    text,
    voice,
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.4,
    speed: 1.0,
  }, 'tts');
  const url = result?.data?.audio?.url || result?.audio?.url;
  if (!url) throw new Error('TTS returned no audio URL');
  return url;
}

async function generateLipSync(videoUrl, audioUrl) {
  const result = await falSubscribeWithRetry(LIPSYNC_MODEL, {
    video_url: videoUrl,
    audio_url: audioUrl,
    model: 'lipsync-2',
    sync_mode: 'cut_off',
  }, 'lipsync');
  const url = result?.data?.video?.url || result?.video?.url;
  if (!url) throw new Error('Lip-sync returned no video URL');
  return url;
}

// ---------------------------------------------------------------------------
// FFmpeg helpers — used to overlay the product image into the lip-synced
// video and to glue a clean end-card onto the back of the clip. We keep the
// re-encode short by only running it on the final composite step (the
// lip-sync output and the product image are downloaded once, then composed).
// ---------------------------------------------------------------------------

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}\n${stderr.slice(-1500)}`));
    });
  });
}

async function ffprobeDimensions(videoPath) {
  // Default to 9:16 portrait if we can't read the file (very rare).
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0',
      videoPath,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('close', () => {
      const [w, h] = out.trim().split(',').map((n) => parseInt(n, 10));
      if (Number.isFinite(w) && Number.isFinite(h)) resolve({ width: w, height: h });
      else resolve({ width: 1080, height: 1920 });
    });
    proc.on('error', () => resolve({ width: 1080, height: 1920 }));
  });
}

/**
 * Pull a single still from a video at the given timestamp (seconds). We use
 * this to grab a "headshot" of the AI creator from their talking-head
 * video, which then becomes one of the reference images fed to Kling
 * Elements when synthesizing product B-roll. The frame is picked far enough
 * in (>= 0.8s) that the creator's pose has settled, but not so far that we
 * miss short clips.
 */
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

async function ffprobeDurationSeconds(videoPath) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      videoPath,
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('close', () => {
      const v = parseFloat(out.trim());
      resolve(Number.isFinite(v) && v > 0 ? v : 0);
    });
    proc.on('error', () => resolve(0));
  });
}

/**
 * Uses Kling 1.6 Elements (multi-image-to-video) to synthesize a single
 * B-roll clip featuring the *exact* creator and the *exact* product image
 * the user uploaded, doing whatever the shot description says — e.g.
 * "holding the protein bag and scooping into a glass". This is the secret
 * sauce that lets the final ad cut between talking-head shots and authentic
 * product-handling shots, instead of just slapping the product as a sticker.
 */
async function generateProductBRoll({ creatorImageUrl, productImageUrl, prompt, durationSec = 5, aspectRatio = '9:16' }) {
  const duration = durationSec >= 10 ? '10' : '5';
  const result = await falSubscribeWithRetry(KLING_ELEMENTS, {
    prompt,
    input_image_urls: [creatorImageUrl, productImageUrl],
    duration,
    aspect_ratio: aspectRatio,
    negative_prompt: 'blurry, distorted, low quality, watermark, text overlay',
  }, 'broll');
  const url = result?.data?.video?.url || result?.video?.url;
  if (!url) throw new Error('Kling Elements returned no video URL');
  return url;
}

/**
 * Stitch 1-3 B-roll clips together with the lip-sync video.
 *
 * There are two modes, picked automatically based on how long the
 * talking-head footage is relative to the B-roll:
 *
 *   1. RICH INTERCUT — the talking head is long enough to host alternating
 *      cuts. We slot each B-roll in between talking-head segments, keeping
 *      the voice-over playing continuously underneath:
 *
 *          [talking 0..t_intro][broll 1][talking ..][broll 2][talking ..]
 *
 *   2. APPEND FALLBACK — the script is short (e.g. 5s), so an intercut
 *      would chop the talking head into sub-second slivers. Instead we
 *      keep the lip-sync intact and tack the B-roll on the end. The voice
 *      finishes during the talking head; B-roll plays under silence,
 *      visually pinning the product on screen for the back half of the ad.
 *
 * Previous bug: when the lip-sync was shorter than `broll_total + 2s` we
 * dropped *all* B-roll and shipped the raw lip-sync — so all the
 * Kling-Elements work was thrown away. The new logic guarantees that every
 * generated B-roll shot lands in the final ad.
 */
async function intercutWithBRoll({ lipsyncPath, brollPaths, workDir }) {
  const { width: W, height: H } = await ffprobeDimensions(lipsyncPath);
  const lipsyncDur = await ffprobeDurationSeconds(lipsyncPath);
  if (!lipsyncDur) throw new Error('Could not determine lip-sync duration');

  const N = brollPaths.length;
  if (N === 0) {
    return lipsyncPath;
  }

  // Read each broll's actual duration so we plan around the real clip length
  // rather than the requested length (Kling sometimes returns 5.04s, etc.).
  const brollDurs = [];
  for (const p of brollPaths) {
    const d = await ffprobeDurationSeconds(p);
    brollDurs.push(Math.max(1, Math.min(d || 5, 10)));
  }

  const totalBroll = brollDurs.reduce((a, b) => a + b, 0);
  // Each talking-head segment should be ≥ 1.5s — anything shorter feels
  // jarring. With N b-roll cuts, we need N+1 talking segments, hence:
  const minSegment = 1.5;
  const requiredTalking = minSegment * (N + 1);

  if (lipsyncDur >= totalBroll + requiredTalking) {
    return await richIntercutEdit({
      lipsyncPath, brollPaths, brollDurs, lipsyncDur, W, H, workDir,
    });
  }
  console.log(
    `[intercut] talking head ${lipsyncDur.toFixed(1)}s < broll ${totalBroll.toFixed(1)}s + ${requiredTalking.toFixed(1)}s margin — using APPEND fallback`
  );
  return await appendBRollEdit({
    lipsyncPath, brollPaths, brollDurs, lipsyncDur, W, H, workDir,
  });
}

/**
 * Rich intercut — alternates talking-head segments and B-roll cuts so the
 * voice plays continuously while the visual switches between the creator
 * and product shots.
 */
async function richIntercutEdit({ lipsyncPath, brollPaths, brollDurs, lipsyncDur, W, H, workDir }) {
  const out = path.join(workDir, 'final-cut.mp4');
  const N = brollPaths.length;
  const totalBroll = brollDurs.reduce((a, b) => a + b, 0);
  const totalTalking = Math.max(1.5 * (N + 1), lipsyncDur - totalBroll);
  const intro = Math.max(2, totalTalking * 0.35);
  const remaining = Math.max(0.5, totalTalking - intro);
  const perBetween = remaining / N;

  // Build talking-head trim windows.
  const talkingSegments = [];
  let cursor = 0;
  talkingSegments.push({ start: cursor, end: cursor + intro });
  cursor += intro;
  for (let i = 0; i < N; i++) {
    cursor += brollDurs[i];
    talkingSegments.push({ start: cursor, end: cursor + perBetween });
    cursor += perBetween;
  }
  for (const seg of talkingSegments) {
    seg.start = Math.max(0, Math.min(seg.start, lipsyncDur));
    seg.end = Math.max(seg.start + 0.1, Math.min(seg.end, lipsyncDur));
  }

  const inputs = ['-i', lipsyncPath];
  brollPaths.forEach((p) => { inputs.push('-i', p); });

  const filterParts = [];
  talkingSegments.forEach((seg, i) => {
    filterParts.push(
      `[0:v]trim=${seg.start.toFixed(3)}:${seg.end.toFixed(3)},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[t${i}]`
    );
  });
  brollPaths.forEach((_, i) => {
    const idx = i + 1;
    filterParts.push(
      `[${idx}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,trim=0:${brollDurs[i].toFixed(3)},setpts=PTS-STARTPTS[b${i}]`
    );
  });

  const concatChunks = ['[t0]'];
  for (let i = 0; i < N; i++) {
    concatChunks.push(`[b${i}]`);
    concatChunks.push(`[t${i + 1}]`);
  }
  filterParts.push(`${concatChunks.join('')}concat=n=${concatChunks.length}:v=1:a=0[outv]`);
  const filter = filterParts.join(';');

  await runFfmpeg([
    '-y',
    ...inputs,
    '-filter_complex', filter,
    '-map', '[outv]',
    '-map', '0:a',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', '+faststart',
    out,
  ]);
  return out;
}

/**
 * Append fallback — used when the talking head is too short for a clean
 * intercut. Lays the lip-sync down first (with its baked-in voice), then
 * concatenates each B-roll shot after. The audio track is padded with
 * silence so the file ends cleanly when the last B-roll finishes.
 */
async function appendBRollEdit({ lipsyncPath, brollPaths, brollDurs, lipsyncDur, W, H, workDir }) {
  const out = path.join(workDir, 'final-cut.mp4');
  const totalDur = lipsyncDur + brollDurs.reduce((a, b) => a + b, 0);

  const inputs = ['-i', lipsyncPath];
  brollPaths.forEach((p) => { inputs.push('-i', p); });

  const filterParts = [];
  filterParts.push(
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[t0]`
  );
  brollPaths.forEach((_, i) => {
    const idx = i + 1;
    filterParts.push(
      `[${idx}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,trim=0:${brollDurs[i].toFixed(3)},setpts=PTS-STARTPTS[b${i}]`
    );
  });

  const concatChunks = ['[t0]'];
  brollPaths.forEach((_, i) => concatChunks.push(`[b${i}]`));
  filterParts.push(`${concatChunks.join('')}concat=n=${concatChunks.length}:v=1:a=0[outv]`);
  // Pad lipsync audio with trailing silence so the final clip closes cleanly
  // when the last b-roll ends instead of mismatched-length truncating us.
  filterParts.push(`[0:a]apad=whole_dur=${totalDur.toFixed(3)}[outa]`);

  const filter = filterParts.join(';');

  await runFfmpeg([
    '-y',
    ...inputs,
    '-filter_complex', filter,
    '-map', '[outv]',
    '-map', '[outa]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-shortest',
    '-movflags', '+faststart',
    out,
  ]);
  return out;
}

/**
 * Composite a product image into the lip-synced creator video so the final
 * ad shows ALL FOUR ingredients:
 *   - the AI-generated creator (the base video)
 *   - the creator lip-syncing to the script (already baked into base video)
 *   - the ElevenLabs voice-over (already baked into base video's audio)
 *   - the user's product (this step — corner sticker + end card)
 *
 * Returns the path to the freshly composited mp4 (faststart, AAC audio).
 */
async function compositeProductOntoVideo({
  videoPath,
  productImagePath,
  productName,
  workDir,
}) {
  const { width: W, height: H } = await ffprobeDimensions(videoPath);
  const out = path.join(workDir, 'composited.mp4');
  // Sticker is ~22% of width, anchored 5% in from the top-right.
  const stickerW = Math.round(W * 0.22);
  const padX = Math.round(W * 0.05);
  const padY = Math.round(H * 0.05);

  const safeProductName = (productName || '').replace(/['":\\]/g, '').slice(0, 60);

  // Build the filter graph. We:
  //   [1:v] = the product image, scaled to stickerW, gentle rounded look via
  //           a 1080×stickerW pad + setsar=1.
  //   [base][prod]overlay -> sticker in top-right (corner) for entire video.
  //   Then append a 2.5s end card built from a black background + product
  //   image centered + product-name text at the bottom.
  //
  // Concat is "v=1:a=1" so the end card brings its own silent audio track,
  // matched against the lip-synced clip's stereo AAC.
  const endCardSeconds = 2.5;
  const endCardImgScale = Math.round(W * 0.55);
  const titleFontSize = Math.round(W * 0.055);

  const filter = [
    // Sticker overlay layer
    `[1:v]scale=${stickerW}:-1,format=rgba,pad=iw+12:ih+12:6:6:color=white@0.0[sticker]`,
    `[0:v][sticker]overlay=W-w-${padX}:${padY}:format=auto[main]`,
    // End card: solid bg + centered product + title text
    `color=c=#0A0A14:s=${W}x${H}:d=${endCardSeconds}[bg]`,
    `[2:v]scale=${endCardImgScale}:-1[endprod]`,
    `[bg][endprod]overlay=(W-w)/2:(H-h)/2-${Math.round(H * 0.04)}[bgprod]`,
    `[bgprod]drawtext=text='${safeProductName || 'Try it now'}':fontcolor=white:fontsize=${titleFontSize}:x=(w-text_w)/2:y=h*0.78:box=1:boxcolor=black@0.0[endcard]`,
    // Silent audio for end card
    `anullsrc=r=44100:cl=stereo:d=${endCardSeconds}[endaudio]`,
    // Concat main + endcard
    `[main][0:a][endcard][endaudio]concat=n=2:v=1:a=1[outv][outa]`,
  ].join(';');

  await runFfmpeg([
    '-y',
    '-i', videoPath,
    '-loop', '1', '-t', '1', '-i', productImagePath,
    '-loop', '1', '-t', String(endCardSeconds), '-i', productImagePath,
    '-filter_complex', filter,
    '-map', '[outv]',
    '-map', '[outa]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', '+faststart',
    out,
  ]);

  return out;
}

/**
 * Mirrors a remote URL into our Supabase Storage bucket so the asset survives
 * after fal.ai's CDN expires the temp URL.
 */
async function mirrorRemote(url, jobId, kind) {
  const { buffer, contentType } = await downloadToBuffer(url);
  const ext = kind === 'audio'
    ? (contentType.includes('mpeg') ? 'mp3' : 'mp3')
    : 'mp4';
  const ct = kind === 'audio' ? 'audio/mpeg' : 'video/mp4';
  const path = `jobs/${jobId}/${kind}-${uuidv4()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(UGC_BUCKET)
    .upload(path, buffer, { contentType: ct, upsert: false });
  if (upErr) throw upErr;
  const { data: signed } = await supabase.storage
    .from(UGC_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  return signed?.signedUrl || null;
}

/**
 * Run the full UGC generation pipeline asynchronously. The HTTP route returns
 * immediately after kicking this off; status is tracked via ugc_jobs row.
 */
async function runUGCJob(job) {
  const jobId = job.id;
  const shotCount = Array.isArray(job.shot_plan) ? job.shot_plan.length : 0;
  console.log(
    `[ugc:${jobId}] starting pipeline ` +
    `product_image=${job.product_image_url ? 'yes' : 'no'} ` +
    `shots=${shotCount} ` +
    `voice=${job.voice_id}`
  );
  await updateJob(jobId, {
    status: 'tts',
    progress: 10,
    started_at: new Date().toISOString(),
  });

  try {
    if (!isFalEnabled()) {
      console.warn(`[ugc:${jobId}] FAL_KEY missing — running in MOCK mode`);
      await new Promise((r) => setTimeout(r, 1500));
      await updateJob(jobId, { status: 'lipsync', progress: 50 });
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

    // ---- Step 1: TTS ----
    const text = (job.script || '').trim();
    if (!text) throw new Error('Script is empty');
    const voiceId = normalizeVoiceId(job.voice_id);
    const ttsTempUrl = await generateTTS(text, voiceId);
    const audioMirror = await mirrorRemote(ttsTempUrl, jobId, 'audio');
    await updateJob(jobId, {
      status: 'lipsync',
      progress: 40,
      audio_url: audioMirror,
    });
    console.log(`[ugc:${jobId}] tts complete (voice=${voiceId})`);

    // ---- Step 2: Lip-sync (creator + voice-over) ----
    const snapshot = job.template_snapshot || {};
    const sourceVideo = snapshot.video_url;
    if (!sourceVideo) throw new Error('Template snapshot missing video_url');
    const lipsyncTempUrl = await generateLipSync(sourceVideo, audioMirror || ttsTempUrl);
    await updateJob(jobId, { status: 'finalizing', progress: 75 });
    console.log(`[ugc:${jobId}] lipsync complete`);

    // ---- Step 3: Product B-roll + intercut edit ----
    // This is the part that makes the final ad feel like a real ad instead
    // of a talking-head with a corner sticker:
    //   3a. Extract a still of the AI creator from the lip-sync video.
    //   3b. Mirror the product image into Supabase so Kling can fetch it.
    //   3c. For each shot in `job.shot_plan`, call Kling 1.6 Elements with
    //       [creator_still, product_image] + the user's shot description.
    //       Result: a 5-10s clip of *this* creator handling *this* product.
    //   3d. FFmpeg intercut: alternate talking-head segments and B-roll
    //       clips along the timeline, keeping the voice-over playing
    //       underneath without interruption.
    //
    // If `shot_plan` is absent or empty (the user opted to skip B-roll), or
    // the columns aren't present yet (pre-migration state), we still ship a
    // working video — just the lip-sync with no cuts.
    let finalRemoteUrl = lipsyncTempUrl;
    const productImageUrl = job.product_image_url;
    const shotPlan = Array.isArray(job.shot_plan) ? job.shot_plan : [];
    const validShots = shotPlan
      .map((s) => ({
        description: String(s?.description || '').trim(),
        durationSec: Number.isFinite(Number(s?.duration_seconds)) ? Math.min(10, Math.max(5, Number(s.duration_seconds))) : 5,
      }))
      .filter((s) => s.description.length > 0)
      .slice(0, 3);

    const aspectRatio = job.template_snapshot?.aspect_ratio || '9:16';

    if (productImageUrl && validShots.length > 0) {
      const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `ugc-${jobId}-`));
      try {
        console.log(`[ugc:${jobId}] downloading lip-sync for B-roll edit`);
        const { buffer: vidBuf } = await downloadToBuffer(lipsyncTempUrl);
        const lipsyncPath = path.join(workDir, 'lipsync.mp4');
        fs.writeFileSync(lipsyncPath, vidBuf);

        // Re-use a cached creator headshot if we already pulled one for an
        // earlier run of this job, otherwise extract + mirror a fresh one.
        let creatorRefUrl = job.creator_reference_image_url;
        if (!creatorRefUrl) {
          const creatorImgPath = path.join(workDir, 'creator-ref.jpg');
          await ffmpegExtractFrame(lipsyncPath, creatorImgPath, 1.0);
          const refKey = `jobs/${jobId}/creator-ref-${uuidv4()}.jpg`;
          const refBuf = fs.readFileSync(creatorImgPath);
          const { error: refUpErr } = await supabase.storage
            .from(UGC_BUCKET)
            .upload(refKey, refBuf, { contentType: 'image/jpeg', upsert: false });
          if (refUpErr) throw refUpErr;
          const { data: refSigned } = await supabase.storage
            .from(UGC_BUCKET)
            .createSignedUrl(refKey, 60 * 60 * 24 * 365);
          creatorRefUrl = refSigned?.signedUrl || null;
          if (creatorRefUrl) {
            await updateJob(jobId, { creator_reference_image_url: creatorRefUrl }).catch(() => {});
          }
        }

        await updateJob(jobId, { status: 'broll', progress: 80 }).catch(() => {});
        console.log(`[ugc:${jobId}] generating ${validShots.length} B-roll shot(s)`);

        // Generate all shots in parallel — saves real wall-clock time and
        // Kling Elements has plenty of concurrency.
        const brollResults = await Promise.allSettled(
          validShots.map((shot) =>
            generateProductBRoll({
              creatorImageUrl: creatorRefUrl,
              productImageUrl,
              prompt: shot.description,
              durationSec: shot.durationSec,
              aspectRatio,
            })
          )
        );

        const brollRemoteUrls = [];
        const brollLocalPaths = [];
        for (let i = 0; i < brollResults.length; i++) {
          const r = brollResults[i];
          if (r.status === 'fulfilled' && r.value) {
            brollRemoteUrls.push(r.value);
            const { buffer: bBuf } = await downloadToBuffer(r.value);
            const bPath = path.join(workDir, `broll-${i}.mp4`);
            fs.writeFileSync(bPath, bBuf);
            brollLocalPaths.push(bPath);
          } else {
            console.error(`[ugc:${jobId}] B-roll shot ${i} failed:`, r.reason?.message || r.reason);
          }
        }

        if (brollLocalPaths.length === 0) {
          console.warn(`[ugc:${jobId}] no B-roll shots succeeded — shipping lip-sync only`);
        } else {
          console.log(`[ugc:${jobId}] intercutting ${brollLocalPaths.length} shot(s)`);
          const cutPath = await intercutWithBRoll({
            lipsyncPath,
            brollPaths: brollLocalPaths,
            workDir,
          });
          const cutBuf = fs.readFileSync(cutPath);
          const key = `jobs/${jobId}/final-${uuidv4()}.mp4`;
          const { error: upErr } = await supabase.storage
            .from(UGC_BUCKET)
            .upload(key, cutBuf, { contentType: 'video/mp4', upsert: false });
          if (upErr) throw upErr;
          const { data: signed } = await supabase.storage
            .from(UGC_BUCKET)
            .createSignedUrl(key, 60 * 60 * 24 * 365);
          finalRemoteUrl = signed?.signedUrl || null;

          // Mirror each broll clip into Supabase too so we keep them
          // alongside the final video for debugging / future remixes.
          const brollMirrored = [];
          for (let i = 0; i < brollRemoteUrls.length; i++) {
            try {
              const mirrored = await mirrorRemote(brollRemoteUrls[i], jobId, 'video');
              if (mirrored) brollMirrored.push(mirrored);
            } catch (e) {
              console.error(`[ugc:${jobId}] mirror broll ${i} failed:`, e?.message || e);
            }
          }
          await updateJob(jobId, { broll_urls: brollMirrored }).catch(() => {});
          console.log(`[ugc:${jobId}] intercut complete (${brollLocalPaths.length} shots)`);
        }
      } catch (e) {
        // Any failure in this step ships the raw lip-sync so the user
        // still gets *something*. Log loudly so we can debug.
        console.error(`[ugc:${jobId}] B-roll/intercut failed, shipping lip-sync only:`, e?.message || e);
      } finally {
        try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
      }
    } else if (productImageUrl) {
      // No shot plan provided — but we DO have a product image. Skip the
      // legacy sticker overlay (it looked tacked-on) and just ship the
      // clean lip-sync. The user can re-generate with shots if they want
      // the product to appear inside the video.
      console.log(`[ugc:${jobId}] no shot_plan provided — skipping B-roll, shipping lip-sync only`);
    }

    // ---- Step 4: Mirror the final video into Supabase (if not already) ----
    let finalVideoUrl = finalRemoteUrl;
    if (finalRemoteUrl && !finalRemoteUrl.includes('supabase.co')) {
      finalVideoUrl = await mirrorRemote(finalRemoteUrl, jobId, 'video');
    }
    await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      output_video_url: finalVideoUrl,
      output_thumbnail_url: snapshot.thumbnail_url || null,
      completed_at: new Date().toISOString(),
    });
    console.log(`[ugc:${jobId}] DONE → ${finalVideoUrl}`);
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

/**
 * Generates (or returns a cached) ~2-3 second TTS preview for the given voice
 * preset. Cached at a deterministic Supabase Storage key so subsequent calls
 * are basically free.
 */
async function generateVoicePreview(voiceId) {
  const preset = VOICE_PRESETS.find((v) => v.id === voiceId);
  if (!preset) throw new Error(`Unknown voice: ${voiceId}`);
  if (!isFalEnabled()) throw new Error('FAL_KEY missing — voice preview disabled');

  const key = `previews/${preset.id}.mp3`;
  // Storage doesn't have a cheap "head" call from the JS client, but
  // `createSignedUrl` returns an error if the key doesn't exist — we use a
  // dedicated existence check via list().
  const { data: listed } = await supabase.storage
    .from(UGC_BUCKET)
    .list('previews', { search: `${preset.id}.mp3`, limit: 1 });
  if (listed && listed.some((f) => f.name === `${preset.id}.mp3`)) {
    const { data: signed } = await supabase.storage
      .from(UGC_BUCKET)
      .createSignedUrl(key, 60 * 60 * 24 * 365);
    if (signed?.signedUrl) return signed.signedUrl;
  }

  const ttsUrl = await generateTTS(preset.sample, preset.id);
  const { buffer } = await downloadToBuffer(ttsUrl);
  const { error: upErr } = await supabase.storage
    .from(UGC_BUCKET)
    .upload(key, buffer, { contentType: 'audio/mpeg', upsert: true });
  if (upErr) throw upErr;
  const { data: signed } = await supabase.storage
    .from(UGC_BUCKET)
    .createSignedUrl(key, 60 * 60 * 24 * 365);
  if (!signed?.signedUrl) throw new Error('Failed to sign preview URL');
  return signed.signedUrl;
}

module.exports = {
  runUGCJob,
  VOICE_PRESETS,
  UGC_BUCKET,
  generateVoicePreview,
  normalizeVoiceId,
};
