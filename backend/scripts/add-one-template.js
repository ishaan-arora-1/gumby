#!/usr/bin/env node
/**
 * Add ONE captioned video to the ugc_templates catalog, non-destructively.
 *
 *   node scripts/add-one-template.js "/path/to/video.mp4"
 *
 * Unlike seed-templates-from-files.js this does NOT deactivate any other
 * templates — it only inserts/updates the single row for this video.
 *
 * Steps:
 *   1. Extract a CLEAN poster (no captions) from the source video. This
 *      becomes thumbnail_url / actor_avatar_url — and in the unified studio
 *      flow it's the creator seed image, so it must be caption-free.
 *   2. Burn WHITE captions over the video using the production captioning
 *      flow (services/captioning.js → Whisper + libass, 'bold' preset).
 *   3. Faststart-remux the captioned video for smooth streaming.
 *   4. Upload poster + captioned video to Supabase storage (10-year URLs).
 *   5. Upsert one ugc_templates row (is_active=true, not user-generated).
 *   6. Flush the Redis template cache.
 */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../src/config/supabase');
const { captionVideo } = require('../src/services/captioning');
const { ffmpegPath } = require('../src/config/ffmpeg');

const BUCKET = 'ugc-videos';

// ---- Template metadata for THIS video ----
const RECIPE = {
  name: 'Office Lobby Matcha Walk',
  actor_name: 'Mina',
  setting: 'Modern office lobby, bright daytime light',
  description:
    'Casual lifestyle walk-up in a sleek office lobby — she strides toward camera holding an iced matcha, all smiles.',
  sample_script:
    'Okay I have to tell you about this, I genuinely cannot stop reaching for it.',
  voice_id: 'Bella',
  aspect_ratio: '9:16',
  duration_seconds: 10,
  tags: ['lifestyle', 'walk', 'female', 'office', 'drink'],
  category: 'lifestyle',
  // 0 → appears first in the catalog. No other rows are touched.
  sort_order: 0,
  caption_preset: 'bold', // white, default UGC look
};

function deterministicUUID(seed) {
  const hash = crypto.createHash('sha1').update('gumby-ugc:' + seed).digest('hex');
  return [
    hash.slice(0, 8), hash.slice(8, 12), '5' + hash.slice(13, 16),
    '8' + hash.slice(17, 20), hash.slice(20, 32),
  ].join('-');
}
function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}\n${stderr.slice(-1500)}`)));
  });
}
async function extractPosterJPG(inputPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-poster-'));
  const out = path.join(tmp, 'poster.jpg');
  await runFfmpeg(['-y', '-ss', '0.6', '-i', inputPath, '-frames:v', '1',
    '-vf', "scale='min(1080,iw)':-2:flags=lanczos", '-q:v', '4', out]);
  const buf = fs.readFileSync(out);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  return buf;
}
async function faststartRemux(inputPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-faststart-'));
  const out = path.join(tmp, 'out.mp4');
  await runFfmpeg(['-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', out]);
  const buf = fs.readFileSync(out);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  return buf;
}
async function uploadToBucket(buffer, ext, contentType, keyPrefix) {
  const key = `${keyPrefix}/${uuidv4()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, { contentType, upsert: false });
  if (error) throw error;
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET).createSignedUrl(key, 60 * 60 * 24 * 365 * 10);
  if (signErr) throw signErr;
  return signed.signedUrl;
}
async function bustRedisCache() {
  try {
    const { getRedisClient } = require('../src/config/redis');
    const redis = await getRedisClient();
    const keys = await redis.keys('ugc_templates*');
    if (keys.length) { await redis.del(keys); console.log(`[redis] flushed ${keys.length} cache keys`); }
    await redis.quit();
  } catch (e) { console.warn('[redis] flush skipped:', e?.message || e); }
}

async function main() {
  const src = process.argv[2];
  if (!src || !fs.existsSync(src)) throw new Error(`Source video not found: ${src}`);

  const id = deterministicUUID(RECIPE.name);
  const slugName = slug(RECIPE.name);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-add-'));
  try {
    console.log(`\n=== ${RECIPE.name} (${RECIPE.actor_name}) → id=${id} ===`);

    console.log('  [ffmpeg] extracting CLEAN poster (caption-free seed still)…');
    const posterBuf = await extractPosterJPG(src);

    console.log(`  [captions] burning WHITE captions (preset=${RECIPE.caption_preset})…`);
    const captionedPath = path.join(work, 'captioned.mp4');
    const stats = await captionVideo({
      inputPath: src,
      outputPath: captionedPath,
      presetId: RECIPE.caption_preset,
    });
    console.log(`  [captions] done (${stats.wordCount} words, ${stats.cues} cues)`);

    console.log('  [ffmpeg] faststart-remuxing captioned video…');
    const videoBuf = await faststartRemux(captionedPath);

    console.log(`  [supabase] uploading poster (${(posterBuf.length / 1024).toFixed(0)} KB)…`);
    const posterUrl = await uploadToBucket(posterBuf, 'jpg', 'image/jpeg', `templates/${slugName}/poster`);
    console.log(`  [supabase] uploading captioned video (${(videoBuf.length / 1024 / 1024).toFixed(1)} MB)…`);
    const videoUrl = await uploadToBucket(videoBuf, 'mp4', 'video/mp4', `templates/${slugName}/video`);

    const row = {
      id,
      name: RECIPE.name,
      actor_name: RECIPE.actor_name,
      actor_avatar_url: posterUrl,
      description: RECIPE.description,
      setting: RECIPE.setting,
      video_url: videoUrl,        // captioned preview
      thumbnail_url: posterUrl,   // CLEAN still → creator seed in the studio flow
      sample_script: RECIPE.sample_script,
      voice_id: RECIPE.voice_id,
      aspect_ratio: RECIPE.aspect_ratio,
      duration_seconds: RECIPE.duration_seconds,
      tags: RECIPE.tags,
      category: RECIPE.category,
      sort_order: RECIPE.sort_order,
      is_active: true,
    };
    const { error } = await supabase.from('ugc_templates').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    console.log('  ✓ ugc_templates row upserted (no other templates touched)');
    console.log(`     video_url:     ${videoUrl.slice(0, 90)}…`);
    console.log(`     thumbnail_url: ${posterUrl.slice(0, 90)}…`);

    await bustRedisCache();
    console.log('\nDone.');
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
