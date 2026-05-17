const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { fal, isFalEnabled } = require('../config/fal');

const UGC_BUCKET = 'ugc-videos';

const TTS_MODEL = 'fal-ai/elevenlabs/tts/multilingual-v2';
const LIPSYNC_MODEL = 'fal-ai/sync-lipsync/v2';

// ElevenLabs preset voices we expose to the client. Voice IDs are the
// ElevenLabs library names that fal accepts directly.
const VOICE_PRESETS = [
  { id: 'Rachel',  label: 'Rachel · warm female',     gender: 'female' },
  { id: 'Bella',   label: 'Bella · bright female',    gender: 'female' },
  { id: 'Domi',    label: 'Domi · confident female',  gender: 'female' },
  { id: 'Elli',    label: 'Elli · youthful female',   gender: 'female' },
  { id: 'Adam',    label: 'Adam · grounded male',     gender: 'male'   },
  { id: 'Antoni',  label: 'Antoni · friendly male',   gender: 'male'   },
  { id: 'Sam',     label: 'Sam · raspy male',         gender: 'male'   },
  { id: 'Josh',    label: 'Josh · upbeat male',       gender: 'male'   },
];

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

async function generateTTS(text, voiceId) {
  const result = await fal.subscribe(TTS_MODEL, {
    input: {
      text,
      voice: voiceId || 'Rachel',
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.4,
      speed: 1.0,
    },
    logs: false,
  });
  const url = result?.data?.audio?.url || result?.audio?.url;
  if (!url) throw new Error('TTS returned no audio URL');
  return url;
}

async function generateLipSync(videoUrl, audioUrl) {
  const result = await fal.subscribe(LIPSYNC_MODEL, {
    input: {
      video_url: videoUrl,
      audio_url: audioUrl,
      model: 'lipsync-2',
      sync_mode: 'cut_off',
    },
    logs: false,
  });
  const url = result?.data?.video?.url || result?.video?.url;
  if (!url) throw new Error('Lip-sync returned no video URL');
  return url;
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
  console.log(`[ugc:${jobId}] starting pipeline`);
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
    const voiceId = job.voice_id || 'Rachel';
    const ttsTempUrl = await generateTTS(text, voiceId);
    const audioMirror = await mirrorRemote(ttsTempUrl, jobId, 'audio');
    await updateJob(jobId, {
      status: 'lipsync',
      progress: 45,
      audio_url: audioMirror,
    });
    console.log(`[ugc:${jobId}] tts complete`);

    // ---- Step 2: Lip-sync ----
    const snapshot = job.template_snapshot || {};
    const sourceVideo = snapshot.video_url;
    if (!sourceVideo) throw new Error('Template snapshot missing video_url');
    const lipsyncTempUrl = await generateLipSync(sourceVideo, audioMirror || ttsTempUrl);
    await updateJob(jobId, { status: 'finalizing', progress: 85 });
    console.log(`[ugc:${jobId}] lipsync complete`);

    // ---- Step 3: Mirror final video ----
    const finalVideoUrl = await mirrorRemote(lipsyncTempUrl, jobId, 'video');
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

module.exports = {
  runUGCJob,
  VOICE_PRESETS,
  UGC_BUCKET,
};
