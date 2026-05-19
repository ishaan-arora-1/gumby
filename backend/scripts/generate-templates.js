#!/usr/bin/env node
/**
 * Generates the entire UGC template catalog from scratch using fal.ai.
 *
 * Pipeline per template:
 *   1. Flux schnell  → portrait still of an AI actor (9:16)
 *   2. Kling 2.5 turbo Pro image-to-video → 5–6 sec talking-to-camera clip
 *   3. Mirror both to our Supabase Storage `ugc-videos` bucket
 *   4. UPSERT the corresponding ugc_templates row by name (deterministic UUID
 *      derived from the recipe slug so re-runs replace the old asset)
 *
 * Usage:
 *   node scripts/generate-templates.js                  # generate all
 *   node scripts/generate-templates.js "Honest Review"  # generate one
 *
 * Requires: FAL_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY in .env
 *
 * Cost: ~ $2.50 to seed all 6 templates (Flux $0.02, Kling $0.35 × 6 ≈ $2.10).
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
const { KLING_IMAGE_TO_VIDEO } = require('../src/config/falModels');

if (!process.env.FAL_KEY) {
  console.error('FAL_KEY missing — set it in backend/.env');
  process.exit(1);
}
fal.config({ credentials: process.env.FAL_KEY });

const BUCKET = 'ugc-videos';

// ---------------------------------------------------------------------------
// Recipes: 6 distinct AI-actor personas, each with a unique scene + script
// vibe + voice. Add/remove freely — the script is idempotent by `name`.
// ---------------------------------------------------------------------------

const RECIPES = [
  {
    name: 'Honest Review',
    actor_name: 'Maya',
    setting: 'Bedroom with soft natural daylight',
    description: 'Confident young creator giving a casual review, look-to-camera.',
    sample_script:
      'Okay so I have been using this for about a week and I genuinely cannot stop thinking about it.',
    voice_id: 'Rachel',
    duration_seconds: 6,
    aspect_ratio: '9:16',
    tags: ['review', 'female', 'gen-z', 'bedroom'],
    category: 'review',
    sort_order: 1,
    portrait_prompt:
      "Cinematic UGC selfie portrait of a 23-year-old woman with long wavy chestnut-brown hair, warm hazel eyes, light makeup, wearing a cream cropped sweater. She is sitting cross-legged on a bed with white linen sheets, soft pastel pillows behind her. Bright window with morning sunlight to her left, gentle bokeh of fairy lights and a houseplant in the background. Looking directly at the camera with a friendly half-smile, mouth slightly parted as if mid-sentence, natural skin texture, modern iPhone selfie aesthetic, vertical 9:16 framing, ultra-realistic, color-graded for warm tones.",
    motion_prompt:
      'The woman talks naturally to the camera in a casual UGC vlog style — subtle head movements, soft hand gestures near her chest, expressive eyebrows, mouth opens and closes naturally as she explains something, friendly engaged expression, locked-off camera, cozy ambient room.',
  },
  {
    name: 'Get Ready With Me',
    actor_name: 'Sienna',
    setting: 'Vanity mirror at golden hour',
    description: 'GRWM-style mirror chat about a personal favorite.',
    sample_script:
      'Get ready with me while I tell you about the only thing I have been reaching for lately.',
    voice_id: 'Bella',
    duration_seconds: 6,
    aspect_ratio: '9:16',
    tags: ['grwm', 'female', 'beauty', 'warm'],
    category: 'beauty',
    sort_order: 2,
    portrait_prompt:
      "Ultra-realistic vertical selfie portrait of a 26-year-old mixed-race woman with long honey-blonde hair pulled half-up, dewy glowing skin, soft pink lipstick, gold hoop earrings, wearing a silk slip top. She is at a vanity desk with rose-gold lights, perfume bottles and a round mirror behind her, golden-hour light streaming from a window casting warm bronze tones. Looking directly into the camera with a soft confident smile, mouth slightly open as if speaking, beauty-influencer aesthetic, vertical 9:16, professional iPhone selfie style.",
    motion_prompt:
      'Soft beauty-influencer vibe — she talks calmly to the camera, occasionally tucks hair behind her ear, smiles, subtle head tilt, mouth moves naturally as she speaks, golden warm light shimmering, locked-off camera, vanity room behind her stays still.',
  },
  {
    name: 'Coffee Shop Hot Take',
    actor_name: 'Jordan',
    setting: 'Cozy cafe with warm jazz lighting',
    description: 'Casual cafe hot-take, leaning in close to camera.',
    sample_script:
      'I am not joking when I tell you this completely changed my morning routine.',
    voice_id: 'Adam',
    duration_seconds: 6,
    aspect_ratio: '9:16',
    tags: ['lifestyle', 'male', 'cafe', 'hot-take'],
    category: 'lifestyle',
    sort_order: 3,
    portrait_prompt:
      'Photorealistic selfie portrait of a 28-year-old man with short curly dark brown hair, light stubble, warm brown eyes, wearing a cream chunky knit sweater. He is sitting in a cozy cafe — espresso machine and exposed-brick wall blurred in the background, hanging Edison bulbs casting warm amber light, a latte with foam art on the wooden table in front of him. Natural skin, real-person UGC look, looking directly at camera with a warm friendly smile, lips slightly parted, vertical 9:16 framing.',
    motion_prompt:
      'He talks casually to the camera like he is telling a friend a story — relaxed, leans in slightly, mouth opens and closes naturally as he speaks, occasional small smile, soft gestures, ambient cafe atmosphere with warm bokeh, locked-off camera.',
  },
  {
    name: 'Gym Locker Confession',
    actor_name: 'Kai',
    setting: 'Gym locker room with cool fluorescent light',
    description: 'Post-workout pep-talk style hot-take.',
    sample_script:
      'Real talk — if you are not using this yet you are leaving gains on the table.',
    voice_id: 'Antoni',
    duration_seconds: 6,
    aspect_ratio: '9:16',
    tags: ['fitness', 'male', 'gym', 'confession'],
    category: 'fitness',
    sort_order: 4,
    portrait_prompt:
      'Photorealistic vertical selfie portrait of a 27-year-old athletic man with short black hair, light sweat on forehead, defined jawline, wearing a black gym tank top. He is in a modern gym locker room — gray lockers and a wooden bench behind him, soft cool fluorescent light overhead with a faint warm accent on his face, towel slung over shoulder. Natural skin texture, looking directly at camera with intense friendly expression, mouth slightly parted as if speaking, real UGC fitness creator aesthetic, vertical 9:16.',
    motion_prompt:
      'He speaks directly and confidently to the camera, slight head nod, occasional eyebrow raise for emphasis, pumped energy from a workout, mouth moves naturally as he talks, subtle chest movement from breathing, locker room background stays still, locked-off camera.',
  },
  {
    name: 'Cozy Couch Story Time',
    actor_name: 'Rae',
    setting: 'Living room couch with warm fairy lights',
    description: 'Wholesome couch chat — friend-to-friend story time.',
    sample_script:
      'So I have a little story for you and you are going to want to hear this one.',
    voice_id: 'Domi',
    duration_seconds: 6,
    aspect_ratio: '9:16',
    tags: ['storytime', 'female', 'cozy', 'warm'],
    category: 'storytime',
    sort_order: 5,
    portrait_prompt:
      'Ultra-realistic vertical UGC selfie of a 24-year-old woman with shoulder-length dark auburn hair, soft freckles, no makeup, warm brown eyes, wearing a pastel oversized hoodie. She is sitting on a beige linen couch with a chunky knit blanket and warm string lights twinkling behind her, plant in soft focus, cozy evening living room. Looking directly at camera with a soft warm smile, mouth slightly open mid-sentence, natural skin, vertical 9:16, intimate friend-to-friend energy.',
    motion_prompt:
      'She tells a casual story directly to the camera, friendly engaged expression, occasional warm laugh, hands move into frame for a small gesture, mouth opens and closes naturally as she speaks, fairy lights gently twinkle in the background, locked-off camera, cozy intimate vibe.',
  },
  {
    name: 'Office Desk Discovery',
    actor_name: 'Theo',
    setting: 'Modern home-office desk with monitor glow',
    description: 'Polished work-from-home desk reveal.',
    sample_script:
      'I have tried every productivity hack in the book and none come close to this.',
    voice_id: 'Sam',
    duration_seconds: 6,
    aspect_ratio: '9:16',
    tags: ['work', 'male', 'desk', 'professional'],
    category: 'productivity',
    sort_order: 6,
    portrait_prompt:
      'Photorealistic vertical selfie of a 30-year-old man with neatly styled dark hair, light glasses, clean-shaven, wearing a fitted charcoal henley. He is at a modern minimalist home-office desk — wooden desk, MacBook open with subtle screen glow on his face, single houseplant and a ceramic mug behind him, exposed-brick wall, soft natural daylight from a side window. Looking directly at camera with a confident calm half-smile, mouth slightly parted as if speaking, vertical 9:16, real UGC creator aesthetic.',
    motion_prompt:
      'He speaks calmly and confidently to the camera in a professional-yet-warm way, subtle head movements, occasional small hand gesture coming into frame, mouth moves naturally, soft monitor glow flickering on his face, locked-off camera, modern office vibe.',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deterministicUUID(seed) {
  // UUIDv5-style namespace hash so the same recipe name always maps to the
  // same row (idempotent re-seeds).
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

/**
 * Re-muxes an MP4 buffer in-place to move the `moov` atom to the front of the
 * file. This is REQUIRED for AVPlayer / HTML5 video to start streaming
 * without first downloading the entire file. Kling and many AI video models
 * produce "slow-start" MP4s with `moov` at the end, which is the root cause of
 * "video just keeps loading" symptoms in the iOS feed.
 *
 * Uses the system `ffmpeg` binary in copy mode (no re-encoding — fast, lossless).
 */
async function ensureFaststartMP4(inputBuffer) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-faststart-'));
  const inPath = path.join(tmpDir, 'in.mp4');
  const outPath = path.join(tmpDir, 'out.mp4');
  fs.writeFileSync(inPath, inputBuffer);

  await new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outPath,
    ];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-2000)}`));
    });
  });

  const out = fs.readFileSync(outPath);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return out;
}

async function uploadToBucket(buffer, ext, contentType, key) {
  const path = `${key}/${uuidv4()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  // 10 year signed URL — effectively permanent for our purposes.
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signErr) throw signErr;
  return signed.signedUrl;
}

async function generatePortrait(recipe) {
  console.log(`  [flux] generating portrait for ${recipe.actor_name}…`);
  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt: recipe.portrait_prompt,
      // 9:16 portrait — the smaller dimension on the long side
      image_size: 'portrait_16_9',
      num_inference_steps: 4,
      num_images: 1,
      output_format: 'jpeg',
      enable_safety_checker: true,
    },
    logs: false,
  });
  const url = result?.data?.images?.[0]?.url;
  if (!url) throw new Error('Flux returned no image url');
  return url;
}

async function generateTalkingVideo(portraitUrl, recipe) {
  console.log(`  [kling v3] animating ${recipe.actor_name} talking-to-camera…`);
  // Kling Video v3 Pro image-to-video — top-tier motion + facial fidelity.
  // We deliberately disable native audio because every template gets dubbed
  // later by ElevenLabs (and lip-synced via fal-ai/sync-lipsync) at the
  // moment the end-user picks a script. Aspect ratio is inherited from the
  // 9:16 Flux portrait we pass in via `start_image_url`.
  const result = await fal.subscribe(KLING_IMAGE_TO_VIDEO, {
    input: {
      start_image_url: portraitUrl,
      prompt: recipe.motion_prompt,
      duration: '5',
      generate_audio: false,
      negative_prompt: 'blurry, distorted face, disfigured, watermark, text, logo, cartoon, anime, low quality, deformed mouth, extra limbs, frozen still image',
      cfg_scale: 0.5,
    },
    logs: false,
  });
  const url = result?.data?.video?.url;
  if (!url) throw new Error('Kling returned no video url');
  return url;
}

// ---------------------------------------------------------------------------
// Main per-recipe pipeline
// ---------------------------------------------------------------------------

async function generateOne(recipe) {
  const id = deterministicUUID(recipe.name);
  const slugName = slug(recipe.name);
  console.log(`\n=== ${recipe.name} (${recipe.actor_name}) → id=${id} ===`);

  // 1. Portrait
  const portraitTempUrl = await generatePortrait(recipe);
  const { buffer: portraitBuf, contentType: portraitCT } = await downloadBuffer(portraitTempUrl);
  const portraitExt = portraitCT.includes('png') ? 'png' : 'jpg';
  const portraitFinalUrl = await uploadToBucket(
    portraitBuf,
    portraitExt,
    portraitCT || 'image/jpeg',
    `templates/${slugName}/portrait`
  );
  console.log(`  ✓ portrait → ${portraitFinalUrl.slice(0, 80)}…`);

  // 2. Talking video (uses the portrait we just generated; we pass the
  //    fresh fal-CDN URL since it's already accessible to fal's pipeline).
  const videoTempUrl = await generateTalkingVideo(portraitTempUrl, recipe);
  const { buffer: rawVideoBuf } = await downloadBuffer(videoTempUrl);
  // Move the moov atom to the front of the file so iOS AVPlayer (and any HTML5
  // <video> client) can begin playback before the entire 16MB has downloaded.
  console.log(`  [ffmpeg] faststart-remuxing video…`);
  const videoBuf = await ensureFaststartMP4(rawVideoBuf);
  const videoFinalUrl = await uploadToBucket(
    videoBuf,
    'mp4',
    'video/mp4',
    `templates/${slugName}/video`
  );
  console.log(`  ✓ video    → ${videoFinalUrl.slice(0, 80)}…`);

  // 3. UPSERT row
  const row = {
    id,
    name: recipe.name,
    actor_name: recipe.actor_name,
    actor_avatar_url: portraitFinalUrl,
    description: recipe.description,
    setting: recipe.setting,
    video_url: videoFinalUrl,
    thumbnail_url: portraitFinalUrl,
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

// ---------------------------------------------------------------------------
// Cache invalidation (Redis is hit by /api/ugc/templates)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main() {
  const filter = process.argv[2];
  const list = filter ? RECIPES.filter((r) => r.name === filter) : RECIPES;
  if (filter && list.length === 0) {
    console.error(`No recipe matches "${filter}". Available:\n  - ${RECIPES.map((r) => r.name).join('\n  - ')}`);
    process.exit(2);
  }

  console.log(`Generating ${list.length} template${list.length > 1 ? 's' : ''}…`);
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
