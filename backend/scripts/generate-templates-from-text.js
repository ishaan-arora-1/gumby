#!/usr/bin/env node
/**
 * Generates UGC templates directly from text prompts using
 * `fal-ai/kling-video/v2.6/pro/text-to-video`.
 *
 * This is an alternative to the (image → image-to-video) pipeline in
 * `generate-templates.js`. Use it when you already know exactly the scene /
 * actor / vibe you want and don't need an intermediate portrait — Kling 2.6
 * Pro generates the full 5-10s clip from text in one shot.
 *
 * Pipeline per recipe:
 *   1. Kling 2.6 Pro text-to-video → 5s portrait talking-to-camera clip
 *   2. ffmpeg extracts a JPG poster (first non-fade frame)
 *   3. ffmpeg `+faststart` remux so iOS AVPlayer can stream immediately
 *   4. Mirror video + poster into Supabase Storage `ugc-videos` bucket
 *   5. UPSERT the matching ugc_templates row (deterministic UUID by name)
 *
 * Usage:
 *   node scripts/generate-templates-from-text.js                   # all
 *   node scripts/generate-templates-from-text.js "Coffee Confession"
 *
 * Requires FAL_KEY + SUPABASE_URL + SUPABASE_SERVICE_KEY in .env.
 *
 * Cost: ~ $0.35 per 5s clip (audio off). Two recipes ≈ $0.70.
 */

require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { fal } = require('@fal-ai/client');
const supabase = require('../src/config/supabase');
const { KLING_TEXT_TO_VIDEO } = require('../src/config/falModels');

if (!process.env.FAL_KEY) {
  console.error('FAL_KEY missing — set it in backend/.env');
  process.exit(1);
}
fal.config({ credentials: process.env.FAL_KEY });

const BUCKET = 'ugc-videos';
const TEXT_TO_VIDEO_MODEL = KLING_TEXT_TO_VIDEO;

// Recipes. Each entry is one dense visual brief — Kling 2.6 generates the
// full 5s vertical talking-head clip in one shot. Audio is disabled so we
// can stamp on ElevenLabs TTS at the moment a user picks a script.
const RECIPES = [
  {
    name: 'Coffee Shop Hot Take',
    actor_name: 'Jordan',
    setting: 'Cozy cafe with warm jazz lighting',
    description: 'Casual cafe hot-take, leaning in close to camera.',
    sample_script:
      'I am not joking when I tell you this completely changed my morning routine.',
    voice_id: 'Adam',
    duration_seconds: 5,
    aspect_ratio: '9:16',
    tags: ['lifestyle', 'male', 'cafe', 'hot-take'],
    category: 'lifestyle',
    sort_order: 7,
    prompt:
      "Cinematic UGC selfie video of a 28-year-old man with short curly dark brown hair, light stubble, warm brown eyes, wearing a cream chunky knit sweater. He is sitting in a cozy cafe — espresso machine and exposed-brick wall blurred in the background, hanging Edison bulbs casting warm amber light, a latte with foam art on the wooden table in front of him. He talks casually to the camera like he is telling a friend a story — relaxed, leans in slightly, mouth opens and closes naturally as he speaks, occasional small smile, soft gestures. Natural skin texture, modern iPhone selfie aesthetic, vertical 9:16 framing, ultra-realistic, color-graded for warm tones, ambient cafe atmosphere with warm bokeh, locked-off camera.",
  },
  {
    name: 'Cozy Couch Story Time',
    actor_name: 'Rae',
    setting: 'Living room couch with warm fairy lights',
    description: 'Wholesome couch chat — friend-to-friend story time.',
    sample_script:
      'So I have a little story for you and you are going to want to hear this one.',
    voice_id: 'Domi',
    duration_seconds: 5,
    aspect_ratio: '9:16',
    tags: ['storytime', 'female', 'cozy', 'warm'],
    category: 'storytime',
    sort_order: 8,
    prompt:
      'Ultra-realistic vertical UGC selfie video of a 24-year-old woman with shoulder-length dark auburn hair, soft freckles, no makeup, warm brown eyes, wearing a pastel oversized hoodie. She is sitting on a beige linen couch with a chunky knit blanket and warm string lights twinkling behind her, plant in soft focus, cozy evening living room. She tells a casual story directly to the camera, friendly engaged expression, occasional warm laugh, hands move into frame for a small gesture, mouth opens and closes naturally as she speaks. Natural skin, vertical 9:16, intimate friend-to-friend energy, locked-off camera, fairy lights gently twinkle in the background.',
  },
];

function deterministicUUID(seed) {
  const hash = crypto.createHash('sha1').update('gumby-ugc:' + seed).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '5' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
      else reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

async function ensureFaststartMP4(inputBuffer) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-faststart-'));
  const inPath = path.join(tmpDir, 'in.mp4');
  const outPath = path.join(tmpDir, 'out.mp4');
  fs.writeFileSync(inPath, inputBuffer);
  await runFfmpeg(['-y', '-i', inPath, '-c', 'copy', '-movflags', '+faststart', outPath]);
  const out = fs.readFileSync(outPath);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return out;
}

async function extractPosterJPG(videoBuffer) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-poster-'));
  const inPath = path.join(tmpDir, 'in.mp4');
  const outPath = path.join(tmpDir, 'poster.jpg');
  fs.writeFileSync(inPath, videoBuffer);
  await runFfmpeg([
    '-y',
    '-ss', '0.6',
    '-i', inPath,
    '-frames:v', '1',
    '-vf', "scale='min(1080,iw)':-2:flags=lanczos",
    '-q:v', '4',
    outPath,
  ]);
  const out = fs.readFileSync(outPath);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return out;
}

async function uploadToBucket(buffer, ext, contentType, keyPrefix) {
  const key = `${keyPrefix}/${uuidv4()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(key, 60 * 60 * 24 * 365 * 10);
  if (signErr) throw signErr;
  return signed.signedUrl;
}

async function generateTalkingVideoFromText(recipe) {
  console.log(`  [kling 2.6 text-to-video] generating ${recipe.actor_name}…`);
  const result = await fal.subscribe(TEXT_TO_VIDEO_MODEL, {
    input: {
      prompt: recipe.prompt,
      duration: String(recipe.duration_seconds),
      aspect_ratio: recipe.aspect_ratio || '9:16',
      generate_audio: false,
      negative_prompt: 'blurry, distorted face, disfigured, watermark, text, logo, cartoon, anime, low quality, deformed mouth, extra limbs, frozen still image',
      cfg_scale: 0.5,
    },
    logs: false,
  });
  const url = result?.data?.video?.url;
  if (!url) throw new Error('Kling 2.6 returned no video url');
  return url;
}

async function generateOne(recipe) {
  const id = deterministicUUID(recipe.name);
  const slugName = slug(recipe.name);
  console.log(`\n=== ${recipe.name} (${recipe.actor_name}) → id=${id} ===`);

  const videoTempUrl = await generateTalkingVideoFromText(recipe);
  const { buffer: rawVideoBuf } = await downloadBuffer(videoTempUrl);

  console.log(`  [ffmpeg] faststart-remuxing…`);
  const videoBuf = await ensureFaststartMP4(rawVideoBuf);

  console.log(`  [ffmpeg] extracting poster…`);
  const posterBuf = await extractPosterJPG(videoBuf);

  console.log(`  [supabase] uploading poster (${(posterBuf.length / 1024).toFixed(0)} KB)…`);
  const posterUrl = await uploadToBucket(
    posterBuf, 'jpg', 'image/jpeg', `templates/${slugName}/poster`
  );
  console.log(`  [supabase] uploading video (${(videoBuf.length / 1024 / 1024).toFixed(1)} MB)…`);
  const videoUrl = await uploadToBucket(
    videoBuf, 'mp4', 'video/mp4', `templates/${slugName}/video`
  );

  const row = {
    id,
    name: recipe.name,
    actor_name: recipe.actor_name,
    actor_avatar_url: posterUrl,
    description: recipe.description,
    setting: recipe.setting,
    video_url: videoUrl,
    thumbnail_url: posterUrl,
    sample_script: recipe.sample_script,
    voice_id: recipe.voice_id,
    aspect_ratio: recipe.aspect_ratio,
    duration_seconds: recipe.duration_seconds,
    tags: recipe.tags,
    category: recipe.category,
    sort_order: recipe.sort_order,
    is_active: true,
  };
  const { error } = await supabase.from('ugc_templates').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  console.log(`  ✓ DB upserted`);
  return row;
}

async function bustRedisCache() {
  try {
    const { getRedisClient } = require('../src/config/redis');
    const redis = await getRedisClient();
    const keys = await redis.keys('ugc_templates*');
    if (keys.length) {
      await redis.del(keys);
      console.log(`\n[redis] flushed ${keys.length} cached entries`);
    }
    await redis.quit();
  } catch (e) {
    console.warn('[redis] cache flush skipped:', e?.message || e);
  }
}

async function main() {
  const filter = process.argv[2];
  const list = filter ? RECIPES.filter((r) => r.name === filter) : RECIPES;
  if (filter && list.length === 0) {
    console.error(`No recipe matches "${filter}". Available:\n  - ${RECIPES.map((r) => r.name).join('\n  - ')}`);
    process.exit(2);
  }

  console.log(`Generating ${list.length} template${list.length > 1 ? 's' : ''} via text-to-video…`);
  const results = [];
  for (const recipe of list) {
    try {
      const row = await generateOne(recipe);
      results.push({ name: recipe.name, ok: true, id: row.id });
    } catch (e) {
      console.error(`  ✗ FAILED:`, e?.message || e);
      results.push({ name: recipe.name, ok: false, error: e?.message || String(e) });
    }
  }

  console.log('\n=== summary ===');
  for (const r of results) {
    console.log(r.ok ? `✓ ${r.name}  (${r.id})` : `✗ ${r.name}  (${r.error})`);
  }

  await bustRedisCache();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
