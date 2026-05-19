#!/usr/bin/env node
/**
 * Seeds the UGC template catalog from the hand-picked MP4 files in
 * `backend/assets/seed-videos/`. For each file we:
 *
 *   1. ffmpeg-extract a poster JPG at roughly t=0.5s (avoids fade-in black frame)
 *   2. ffmpeg-remux the MP4 with `+faststart` so iOS AVPlayer streams it without
 *      downloading the entire file first
 *   3. Upload both to Supabase Storage (bucket: `ugc-videos`) and sign a 10-year URL
 *   4. UPSERT the corresponding row in `ugc_templates` keyed by a deterministic
 *      UUID derived from the recipe slug. Re-runs simply replace the asset.
 *
 * Usage:
 *   node scripts/seed-templates-from-files.js                # seed all
 *   node scripts/seed-templates-from-files.js "GRWM Clothing Try-On"
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_KEY in .env. (No fal.ai needed —
 * the videos already exist locally.)
 */

require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../src/config/supabase');

const BUCKET = 'ugc-videos';
const SEED_DIR = path.join(__dirname, '..', 'assets', 'seed-videos');

// ---------------------------------------------------------------------------
// Recipes — one entry per local mp4. Edit names / scripts / voices freely.
// The `file` field maps to backend/assets/seed-videos/<file>.
// ---------------------------------------------------------------------------

const RECIPES = [
  {
    file: 'clothing.mp4',
    name: 'Clothing Try-On',
    actor_name: 'Ava',
    setting: 'Bedroom mirror, golden afternoon light',
    description:
      'Try-on haul vibe — she walks up to the camera and shows off the fit, real GRWM energy.',
    sample_script:
      "Okay you guys, I have been waiting to show you this fit — it is literally everything.",
    voice_id: 'Bella',
    duration_seconds: 10,
    aspect_ratio: '9:16',
    tags: ['fashion', 'tryon', 'female', 'grwm'],
    category: 'fashion',
    sort_order: 1,
  },
  {
    file: 'serum.mp4',
    name: 'Skincare Serum Routine',
    actor_name: 'Lila',
    setting: 'Bathroom counter, soft morning daylight',
    description:
      'Dewy, intimate skincare moment — she holds up the serum and talks about her glow.',
    sample_script:
      "Real talk, my skin has never looked better and there is one thing I keep coming back to.",
    voice_id: 'Rachel',
    duration_seconds: 10,
    aspect_ratio: '9:16',
    tags: ['beauty', 'skincare', 'female', 'glow'],
    category: 'beauty',
    sort_order: 2,
  },
  {
    file: 'lipgloss.mp4',
    name: 'Lip Gloss Close-Up',
    actor_name: 'Mia',
    setting: 'Vanity mirror, warm ring-light glow',
    description:
      'High-shine beauty close-up — she applies the gloss, pouts, then sells the product to camera.',
    sample_script:
      "I am obsessed with how this looks — this is the only gloss I have been reaching for.",
    voice_id: 'Domi',
    duration_seconds: 10,
    aspect_ratio: '9:16',
    tags: ['beauty', 'lips', 'female', 'closeup'],
    category: 'beauty',
    sort_order: 3,
  },
  {
    file: 'jewellery-day.mp4',
    name: 'Daytime Jewellery Story',
    actor_name: 'Sienna',
    setting: 'Sunlit window seat, soft natural daylight',
    description:
      'Soft, elegant jewellery reveal — gold catches the daylight as she tells the story behind the piece.',
    sample_script:
      "Honestly this piece feels like it was made for me — and the story behind it is even better.",
    voice_id: 'Elli',
    duration_seconds: 10,
    aspect_ratio: '9:16',
    tags: ['jewellery', 'lifestyle', 'female', 'soft'],
    category: 'jewellery',
    sort_order: 4,
  },
  {
    file: 'jewellery-evening.mp4',
    name: 'Evening Jewellery Reveal',
    actor_name: 'Naya',
    setting: 'Moody evening bedroom, warm bedside lamp',
    description:
      'After-hours jewellery hot-take — she leans into the camera and shares why she cannot take it off.',
    sample_script:
      "Okay so I have not taken this off in three weeks and I am about to tell you why.",
    voice_id: 'Bella',
    duration_seconds: 10,
    aspect_ratio: '9:16',
    tags: ['jewellery', 'evening', 'female', 'moody'],
    category: 'jewellery',
    sort_order: 5,
  },
  {
    file: 'gym.mp4',
    name: 'Gym Post-Workout Pump',
    actor_name: 'Kai',
    setting: 'Gym floor, post-workout, cool fluorescent + warm window light',
    description:
      'High-energy post-set hot-take — sweaty, confident, talking right to camera mid-pump.',
    sample_script:
      "Real talk — if you are not using this yet you are leaving gains on the table.",
    voice_id: 'Antoni',
    duration_seconds: 15,
    aspect_ratio: '1:1',
    tags: ['fitness', 'gym', 'male', 'energy'],
    category: 'fitness',
    sort_order: 6,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deterministicUUID(seed) {
  // Stable UUIDv5-shaped hash so the same recipe name always upserts the same
  // ugc_templates row across re-runs.
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

async function extractPosterJPG(inputPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-poster-'));
  const outPath = path.join(tmpDir, 'poster.jpg');
  // Grab a frame at ~0.6s to dodge any fade-in black frame on the very first frame.
  // Scale long-edge to 1080 max so the thumbnail file stays well under 500KB.
  await runFfmpeg([
    '-y',
    '-ss', '0.6',
    '-i', inputPath,
    '-frames:v', '1',
    '-vf', "scale='min(1080,iw)':-2:flags=lanczos",
    '-q:v', '4',
    outPath,
  ]);
  const buf = fs.readFileSync(outPath);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return buf;
}

async function faststartRemux(inputPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-faststart-'));
  const outPath = path.join(tmpDir, 'out.mp4');
  // No re-encode, just move the moov atom up front — required for AVPlayer
  // streaming-start on iOS without buffering the whole file.
  await runFfmpeg([
    '-y',
    '-i', inputPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outPath,
  ]);
  const buf = fs.readFileSync(outPath);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return buf;
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
    .createSignedUrl(key, 60 * 60 * 24 * 365 * 10); // 10 years
  if (signErr) throw signErr;
  return signed.signedUrl;
}

async function deactivateOldTemplates(keepIds) {
  // Anything not in keepIds gets `is_active = false`. We don't hard-delete
  // because past UGC jobs reference template ids and we want their snapshot
  // to remain valid for retro playback.
  const { error } = await supabase
    .from('ugc_templates')
    .update({ is_active: false })
    .not('id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`);
  if (error) console.warn('Deactivate old templates warning:', error.message);
}

async function seedOne(recipe) {
  const id = deterministicUUID(recipe.name);
  const slugName = slug(recipe.name);
  const file = path.join(SEED_DIR, recipe.file);
  if (!fs.existsSync(file)) {
    throw new Error(`Source file missing: ${file}`);
  }

  console.log(`\n=== ${recipe.name} (${recipe.actor_name}) → id=${id} ===`);
  console.log(`  [ffmpeg] extracting poster from ${recipe.file}…`);
  const posterBuf = await extractPosterJPG(file);

  console.log(`  [ffmpeg] faststart-remuxing video…`);
  const videoBuf = await faststartRemux(file);

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
  console.log(`  ✓ template upserted`);
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

  console.log(`Seeding ${list.length} template${list.length > 1 ? 's' : ''} from ${SEED_DIR}…`);
  const results = [];
  for (const recipe of list) {
    try {
      const row = await seedOne(recipe);
      results.push({ name: recipe.name, ok: true, id: row.id });
    } catch (e) {
      console.error(`  ✗ FAILED:`, e?.message || e);
      results.push({ name: recipe.name, ok: false, error: e?.message || String(e) });
    }
  }

  // If we seeded the full catalog (no filter), deactivate everything else so
  // the feed only shows the curated 6.
  if (!filter) {
    const keepIds = results.filter((r) => r.ok).map((r) => r.id);
    if (keepIds.length === RECIPES.length) {
      console.log(`\nDeactivating old templates not in this batch…`);
      await deactivateOldTemplates(keepIds);
    } else {
      console.warn('\nSkipping deactivation — some recipes failed to seed.');
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
