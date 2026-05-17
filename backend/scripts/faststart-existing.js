#!/usr/bin/env node
/**
 * One-shot fix: download every ugc_templates.video_url, re-mux with
 * `+faststart` (moves the moov atom to the front of the file), upload the
 * fixed version back to Supabase Storage, and update the row.
 *
 * Why: Kling outputs MP4s with the moov atom at the END, which makes iOS
 * AVPlayer download the entire file before it can render the first frame —
 * that's the "videos just keep loading" symptom in the feed. After this
 * remux, playback begins within ~1 second.
 *
 * Idempotent — safe to re-run. Only re-mux'd videos get a new signed URL;
 * old objects stay in storage but are unreferenced.
 */

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../src/config/supabase');

const BUCKET = 'ugc-videos';

async function downloadBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed (${r.status}) for ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function ensureFaststartMP4(inputBuffer) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'faststart-'));
  const inPath = path.join(tmpDir, 'in.mp4');
  const outPath = path.join(tmpDir, 'out.mp4');
  fs.writeFileSync(inPath, inputBuffer);
  await new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y', '-i', inPath, '-c', 'copy', '-movflags', '+faststart', outPath,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
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

/** Probe the first 256KB of a remote MP4 and report whether moov is at the front. */
async function isFaststart(url) {
  const r = await fetch(url, { headers: { Range: 'bytes=0-262144' } });
  if (!r.ok && r.status !== 206) throw new Error(`probe failed ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const moovIdx = buf.indexOf(Buffer.from('moov'));
  const mdatIdx = buf.indexOf(Buffer.from('mdat'));
  if (moovIdx === -1) return false; // moov is past the first 256KB — definitely slow-start
  if (mdatIdx === -1) return true;   // moov found, no mdat yet — front-loaded
  return moovIdx < mdatIdx;
}

function slugFromName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function main() {
  const { data: rows, error } = await supabase
    .from('ugc_templates')
    .select('id,name,video_url')
    .order('sort_order');
  if (error) throw error;

  const filterArg = process.argv[2];
  const work = filterArg ? rows.filter((r) => r.name === filterArg) : rows;

  console.log(`Probing ${work.length} template${work.length > 1 ? 's' : ''}…\n`);

  const results = [];
  for (const row of work) {
    process.stdout.write(`• ${row.name}: `);
    try {
      const fast = await isFaststart(row.video_url);
      if (fast) {
        console.log('already faststart ✓');
        results.push({ name: row.name, action: 'skip', ok: true });
        continue;
      }
      console.log('SLOW-START — fixing…');
      const original = await downloadBuffer(row.video_url);
      console.log(`  downloaded ${(original.length / 1024 / 1024).toFixed(1)}MB`);
      const fixed = await ensureFaststartMP4(original);
      console.log(`  remuxed → ${(fixed.length / 1024 / 1024).toFixed(1)}MB`);

      const slug = slugFromName(row.name);
      const newPath = `templates/${slug}/video/${uuidv4()}.mp4`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, fixed, { contentType: 'video/mp4', upsert: false });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(newPath, 60 * 60 * 24 * 365 * 10);
      if (signErr) throw signErr;

      const { error: updErr } = await supabase
        .from('ugc_templates')
        .update({ video_url: signed.signedUrl })
        .eq('id', row.id);
      if (updErr) throw updErr;
      console.log(`  ✓ updated ${row.name}\n`);
      results.push({ name: row.name, action: 'fixed', ok: true });
    } catch (e) {
      console.log(`✗ ${e.message || e}`);
      results.push({ name: row.name, action: 'error', ok: false, error: e.message });
    }
  }

  // Bust Redis cache
  try {
    const { getRedisClient } = require('../src/config/redis');
    const redis = await getRedisClient();
    const keys = await redis.keys('ugc_templates*');
    if (keys.length) await redis.del(keys);
    await redis.quit();
    console.log(`\n[redis] flushed ${keys.length} cache keys`);
  } catch (e) {
    console.warn('[redis] skipped:', e.message);
  }

  console.log('\n=== summary ===');
  for (const r of results) {
    const tag = r.ok ? (r.action === 'skip' ? '·' : '✓') : '✗';
    console.log(`${tag} ${r.name} (${r.action}${r.error ? ': ' + r.error : ''})`);
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
