#!/usr/bin/env node
/**
 * Seeds the UGC template catalog from remote URLs (Cloudinary in our case).
 *
 * For each recipe we:
 *   1. Download the source MP4 to a temp file.
 *   2. ffmpeg-extract a poster JPG at ~0.6s (avoids the first-frame fade).
 *   3. ffmpeg-remux with `+faststart` so iOS AVPlayer streams without buffering.
 *   4. Upload both to Supabase Storage (bucket: `ugc-videos`) and sign a 10-year URL.
 *   5. UPSERT the corresponding `ugc_templates` row keyed by a deterministic
 *      UUID derived from the recipe name. Re-runs replace assets in place.
 *   6. Deactivate every other row in `ugc_templates` so the public feed only
 *      shows the curated six.
 *
 * Usage:
 *   node scripts/seed-templates-from-urls.js                # seed all 6
 *   node scripts/seed-templates-from-urls.js "Lip Gloss Close-Up"
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_KEY in .env.
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

// ---------------------------------------------------------------------------
// Recipes — one per Cloudinary source video. Metadata (names, scripts,
// voices) is intentionally identical to the previous local-file seeder so
// existing UGC jobs that captured a template_snapshot still feel coherent.
// ---------------------------------------------------------------------------

const RECIPES = [
  {
    source_url: 'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1779194220/clothing_dz0lgx.mp4',
    name: 'Clothing Try-On',
    actor_name: 'Ava',
    setting: 'Bedroom mirror, golden afternoon light',
    description:
      'Try-on haul vibe — she walks up to the camera and shows off the fit, real GRWM energy.',
    sample_script:
      "Okay you guys, I have been waiting to show you this fit — it is literally everything.",
    voice_id: 'Aria',
    duration_seconds: 10,
    aspect_ratio: '9:16',
    tags: ['fashion', 'tryon', 'female', 'grwm'],
    category: 'fashion',
    sort_order: 1,
  },
  {
    source_url: 'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1779194153/serum_v7vdbw.mp4',
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
    source_url: 'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1779194166/lipgloss_isfdie.mp4',
    name: 'Lip Gloss Close-Up',
    actor_name: 'Mia',
    setting: 'Vanity mirror, warm ring-light glow',
    description:
      'High-shine beauty close-up — she applies the gloss, pouts, then sells the product to camera.',
    sample_script:
      "I am obsessed with how this looks — this is the only gloss I have been reaching for.",
    voice_id: 'Jessica',
    duration_seconds: 10,
    aspect_ratio: '9:16',
    tags: ['beauty', 'lips', 'female', 'closeup'],
    category: 'beauty',
    sort_order: 3,
  },
  {
    source_url: 'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1779194138/jewellery_1_wpjdb1.mp4',
    name: 'Daytime Jewellery Story',
    actor_name: 'Sienna',
    setting: 'Sunlit window seat, soft natural daylight',
    description:
      'Soft, elegant jewellery reveal — gold catches the daylight as she tells the story behind the piece.',
    sample_script:
      "Honestly this piece feels like it was made for me — and the story behind it is even better.",
    voice_id: 'Lily',
    duration_seconds: 10,
    aspect_ratio: '9:16',
    tags: ['jewellery', 'lifestyle', 'female', 'soft'],
    category: 'jewellery',
    sort_order: 4,
  },
  {
    source_url: 'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1779194151/jewellery_2_n8ceyx.mp4',
    name: 'Evening Jewellery Reveal',
    actor_name: 'Naya',
    setting: 'Moody evening bedroom, warm bedside lamp',
    description:
      'After-hours jewellery hot-take — she leans into the camera and shares why she cannot take it off.',
    sample_script:
      "Okay so I have not taken this off in three weeks and I am about to tell you why.",
    voice_id: 'Sarah',
    duration_seconds: 10,
    aspect_ratio: '9:16',
    tags: ['jewellery', 'evening', 'female', 'moody'],
    category: 'jewellery',
    sort_order: 5,
  },
  {
    source_url: 'https://res.cloudinary.com/dgx0o3xfx/video/upload/v1779194268/gym_wjiimf.mp4',
    name: 'Gym Post-Workout Pump',
    actor_name: 'Kai',
    setting: 'Gym floor, post-workout, cool fluorescent + warm window light',
    description:
      'High-energy post-set hot-take — sweaty, confident, talking right to camera mid-pump.',
    sample_script:
      "Real talk — if you are not using this yet you are leaving gains on the table.",
    voice_id: 'Liam',
    duration_seconds: 15,
    aspect_ratio: '9:16',
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

async function downloadToTempFile(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status} for ${url}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-src-'));
  const filePath = path.join(tmpDir, 'src.mp4');
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(filePath, buf);
  return { filePath, tmpDir, size: buf.length };
}

async function extractPosterJPG(inputPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-poster-'));
  const outPath = path.join(tmpDir, 'poster.jpg');
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
  if (!keepIds.length) return;
  const { error } = await supabase
    .from('ugc_templates')
    .update({ is_active: false })
    .not('id', 'in', `(${keepIds.map((id) => `"${id}"`).join(',')})`);
  if (error) console.warn('Deactivate old templates warning:', error.message);
}

async function seedOne(recipe) {
  const id = deterministicUUID(recipe.name);
  const slugName = slug(recipe.name);

  console.log(`\n=== ${recipe.name} (${recipe.actor_name}) → id=${id} ===`);

  console.log(`  [http] downloading ${recipe.source_url}`);
  const { filePath, tmpDir, size } = await downloadToTempFile(recipe.source_url);
  console.log(`  [http] got ${(size / 1024 / 1024).toFixed(1)} MB`);

  try {
    console.log(`  [ffmpeg] extracting poster…`);
    const posterBuf = await extractPosterJPG(filePath);

    console.log(`  [ffmpeg] faststart-remuxing video…`);
    const videoBuf = await faststartRemux(filePath);

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
      is_user_generated: false,
    };

    const { error } = await supabase.from('ugc_templates').upsert(row, { onConflict: 'id' });
    if (error) {
      // The is_user_generated column may not exist yet on older databases.
      // Re-try without it so the seeder still works pre-migration-004.
      if (/is_user_generated/i.test(error.message || '')) {
        const { is_user_generated, ...legacyRow } = row;
        const retry = await supabase.from('ugc_templates').upsert(legacyRow, { onConflict: 'id' });
        if (retry.error) throw retry.error;
      } else {
        throw error;
      }
    }
    console.log(`  ✓ template upserted`);
    return row;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
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

  console.log(`Seeding ${list.length} template${list.length > 1 ? 's' : ''} from Cloudinary…`);
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
