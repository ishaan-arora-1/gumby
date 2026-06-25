#!/usr/bin/env node
/**
 * Cloudinary → Supabase relink.
 *
 * Cloudinary was suspended (delivery 401s), killing the videos on:
 *   • the studio creators grid + /templates cards   (DB rows #1–#7)
 *   • the landing page hero wall / showcase / mockups (hardcoded URLs)
 *
 * This re-hosts the hand-recovered source clips in `backend/assets/relink/`
 * on Supabase Storage (bucket `ugc-videos`) — the exact same approach as the
 * one template that never broke (#0 "Office Lobby Matcha Walk") — then:
 *   1. UPDATEs the DB template rows to the new Supabase signed URLs.
 *   2. Writes scripts/relink-urls.json with the landing-page URLs so the
 *      hardcoded references in web/components/landing/BlinkLanding.tsx can be
 *      swapped to Supabase.
 *
 * For each clip we produce three variants:
 *   • full   — faststart-remuxed original  (DB card video_url)
 *   • web    — 540px h264/crf30, no audio   (landing tiles, light + fast)
 *   • poster — 720px JPG first frame        (thumbnails / clean seed frames)
 *
 * Run with Node 20+ (supabase-js needs global Headers):
 *   cd backend && node scripts/relink-cloudinary.js
 *
 * Idempotent — re-run any time you drop more files into assets/relink/.
 */

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../src/config/supabase');

const BUCKET = 'ugc-videos';
const SRC_DIR = path.join(__dirname, '..', 'assets', 'relink');
const OUT_JSON = path.join(__dirname, 'relink-urls.json');

// Already-working Supabase clip (#106 "Gym Post-Workout Pump") reused for the
// landing "Fitness" tile / mockup — the gym_wjiimf source was never recovered.
const GYM = {
  src: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/templates/gym-post-workout-pump/video/751e18f2-dfc3-47b9-adc8-fad96eed3ab2.mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL3RlbXBsYXRlcy9neW0tcG9zdC13b3Jrb3V0LXB1bXAvdmlkZW8vNzUxZTE4ZjItZGZjMy00N2I5LWFkYzgtZmFkOTZlZWQzYWIyLm1wNCIsImlhdCI6MTc3OTIxMDAyNSwiZXhwIjoyMDk0NTcwMDI1fQ.RsihyIXsoTB7DgBMtr1q_dnIU0wro1122FvdRQnON3Q',
  poster: 'https://zsmwvjrvuucuablyibko.supabase.co/storage/v1/object/sign/ugc-videos/templates/gym-post-workout-pump/poster/783cf68e-ac57-4396-9ab3-f02de87be9f5.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lYTY4NDExZS00OTE3LTQ3NWMtYjk0MS0wODIyMTJiYzhkNTciLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ1Z2MtdmlkZW9zL3RlbXBsYXRlcy9neW0tcG9zdC13b3Jrb3V0LXB1bXAvcG9zdGVyLzc4M2NmNjhlLWFjNTctNDM5Ni05YWIzLWYwMmRlODdiZTlmNS5qcGciLCJpYXQiOjE3NzkyMTAwMjMsImV4cCI6MjA5NDU3MDAyM30.3jgB58Cst3Fs8cFZoCAHBteiKhA09AKSYzMAMwEXGuI',
};

// One entry per recovered clip in assets/relink/. `key` is the stable handle
// referenced by the DB + landing maps below.
const CLIPS = [
  { key: 'wardrobe',     file: 'wardrobe.mp4' },
  { key: 'skincare',     file: 'skincare.mp4' },
  { key: 'beauty',       file: 'beauty.mp4' },
  { key: 'jewellery',    file: 'jewellery.mp4' },
  { key: 'fashion',      file: 'fashion.mp4' },
  { key: 'evening',      file: 'evening.mp4' },
  { key: 'capBeauty',    file: 'cap-beauty.mp4' },
  { key: 'capJewellery', file: 'cap-jewellery.mp4' },
  { key: 'capFashion',   file: 'cap-fashion.mp4' },
  { key: 'capEvening',   file: 'cap-evening.mp4' },
  { key: 'showcaseDemo', file: 'showcase-demo.mp4' },
];

// DB rows to repoint. video/poster/clean reference `<clipKey>` resolved to the
// uploaded full/poster/poster URLs respectively.
const DB_ROWS = [
  { id: 'aaaaaaaa-0002-4000-8000-000000000001', label: '#1 Wardrobe styling',   video: 'wardrobe',     clean: 'wardrobe'  },
  // #2 captioned skincare source (o2q2d7) was not recovered → play the clean clip.
  { id: 'aaaaaaaa-0001-4000-8000-000000000001', label: '#2 Skincare daylight',  video: 'skincare',     clean: 'skincare'  },
  { id: 'aaaaaaaa-0001-4000-8000-000000000002', label: '#3 Beauty gloss',       video: 'capBeauty',    clean: 'beauty'    },
  { id: 'aaaaaaaa-0001-4000-8000-000000000003', label: '#4 Jewellery soft',     video: 'capJewellery', clean: 'jewellery' },
  { id: 'aaaaaaaa-0001-4000-8000-000000000004', label: '#5 Fashion drop',       video: 'capFashion',   clean: 'fashion'   },
  { id: 'aaaaaaaa-0001-4000-8000-000000000005', label: '#6 Evening look',       video: 'capEvening',   clean: 'evening'   },
];
// #7 "Clean everyday look" (os6bpi) — no copy recovered. Hidden until provided.
const DEACTIVATE_ID = 'aaaaaaaa-0001-4000-8000-000000000006';

// ---------------------------------------------------------------------------
// ffmpeg helpers
// ---------------------------------------------------------------------------
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg ${c}\n${err.slice(-1200)}`))));
  });
}

async function ffOut(args, ext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relink-'));
  const out = path.join(dir, 'o.' + ext);
  await runFfmpeg([...args, out]);
  const buf = fs.readFileSync(out);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  return buf;
}

const posterBuf = (input) =>
  ffOut(['-y', '-ss', '0.6', '-i', input, '-frames:v', '1',
    '-vf', "scale='min(720,iw)':-2:flags=lanczos", '-q:v', '4'], 'jpg');

const fullBuf = (input) =>
  ffOut(['-y', '-i', input, '-c', 'copy', '-movflags', '+faststart'], 'mp4');

const webBuf = (input) =>
  ffOut(['-y', '-i', input, '-an',
    '-vf', "scale='min(540,iw)':-2:flags=lanczos",
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-crf', '30', '-preset', 'veryfast', '-movflags', '+faststart'], 'mp4');

// ---------------------------------------------------------------------------
async function upload(buffer, ext, contentType, prefix) {
  const key = `${prefix}/${uuidv4()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, { contentType, upsert: false });
  if (error) throw error;
  const { data, error: e2 } = await supabase.storage.from(BUCKET).createSignedUrl(key, 60 * 60 * 24 * 365 * 10);
  if (e2) throw e2;
  return data.signedUrl;
}

async function processClip(clip) {
  const src = path.join(SRC_DIR, clip.file);
  if (!fs.existsSync(src)) {
    console.log(`  ⚠ skip ${clip.key} — ${clip.file} not found`);
    return null;
  }
  console.log(`\n=== ${clip.key} (${clip.file}) ===`);
  const prefix = `relink/${clip.key}`;

  console.log('  [ffmpeg] poster…');
  const poster = await upload(await posterBuf(src), 'jpg', 'image/jpeg', `${prefix}/poster`);
  console.log('  [ffmpeg] full faststart…');
  const full = await upload(await fullBuf(src), 'mp4', 'video/mp4', `${prefix}/full`);
  console.log('  [ffmpeg] web 540p…');
  const web = await upload(await webBuf(src), 'mp4', 'video/mp4', `${prefix}/web`);
  console.log('  ✓ uploaded');
  return { full, web, poster };
}

async function bustRedis() {
  try {
    const { getRedisClient } = require('../src/config/redis');
    const redis = await getRedisClient();
    const keys = await redis.keys('ugc_templates*');
    if (keys.length) { await redis.del(keys); console.log(`\n[redis] flushed ${keys.length} keys`); }
    await redis.quit();
  } catch (e) { console.warn('[redis] skip:', e?.message || e); }
}

async function main() {
  const urls = {};
  for (const clip of CLIPS) {
    urls[clip.key] = await processClip(clip);
  }

  // --- DB repoint ---
  console.log('\n=== repointing DB template rows ===');
  for (const row of DB_ROWS) {
    const v = urls[row.video];
    const c = urls[row.clean];
    if (!v || !c) { console.log(`  ⚠ skip ${row.label} — missing uploaded clip`); continue; }
    const patch = { video_url: v.full, thumbnail_url: v.poster, clean_frame_url: c.poster, is_active: true };
    const { error } = await supabase.from('ugc_templates').update(patch).eq('id', row.id);
    if (error) console.error(`  ✗ ${row.label}: ${error.message}`);
    else console.log(`  ✓ ${row.label}`);
  }

  // #7 — hide until its source clip is recovered.
  const { error: dErr } = await supabase.from('ugc_templates')
    .update({ is_active: false }).eq('id', DEACTIVATE_ID);
  console.log(dErr ? `  ✗ deactivate #7: ${dErr.message}` : '  ✓ #7 Clean everyday look hidden (source not recovered)');

  // --- landing URL map ---
  const pick = (k) => (urls[k] ? { src: urls[k].web, poster: urls[k].poster } : null);
  const landing = {
    wall: {
      fashion: pick('fashion'),
      skincare: pick('skincare'),
      beauty: pick('beauty'),
      jewellery: pick('jewellery'),
      evening: pick('evening'),
      fitness: GYM,
    },
    showcase: {
      demo: pick('showcaseDemo'),
      wardrobe: pick('wardrobe'),
    },
    mockup: {
      evening: pick('evening'),
      skincare: pick('skincare'),
      fitness: GYM,
    },
    // product-mockup thumbnail — reuse the jewellery still ("Diamond Tops").
    logo: urls.jewellery ? urls.jewellery.poster : null,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(landing, null, 2));
  console.log(`\n[json] wrote landing URLs → ${OUT_JSON}`);

  await bustRedis();
  console.log('\nDone.');
  process.exit(0);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
