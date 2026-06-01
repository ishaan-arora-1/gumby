#!/usr/bin/env node
/**
 * Caption the curated UGC template videos through the SAME production
 * pipeline the app uses (services/captioning.js → Whisper + libass).
 *
 *   node scripts/caption-templates.js [--limit 1] [--out <dir>]
 *
 * Pulls the top templates from ugc_templates (is_active, not user-generated)
 * ordered by sort_order, downloads each video_url, and burns captions using
 * a per-index preset map. Output MP4s are written to the chosen directory.
 */

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const supabase = require('../src/config/supabase');
const { captionVideo } = require('../src/services/captioning');

// Per-template caption style, in sorted order. Index 0 = first template.
//   1) white            → bold (white text, default UGC look)
//   2) blue block       → block_blue
//   3) pink block       → pink_pop
//   4) yellow text      → yellow
//   5) blue block       → block_blue
const PRESET_BY_INDEX = ['bold', 'block_blue', 'pink_pop', 'yellow', 'block_blue'];

function parseArgs(argv) {
  const args = { limit: PRESET_BY_INDEX.length, out: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = parseInt(argv[++i], 10) || args.limit;
    else if (a === '--out') args.out = argv[++i];
  }
  return args;
}

async function downloadTo(filePath, url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download failed (${resp.status}) for ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(filePath, buf);
  return buf.length;
}

async function fetchTopTemplates(limit) {
  let { data, error } = await supabase
    .from('ugc_templates')
    .select('id, name, video_url, sample_script, sort_order')
    .eq('is_active', true)
    .or('is_user_generated.is.null,is_user_generated.eq.false')
    .order('sort_order', { ascending: true })
    .limit(limit);
  if (error && /is_user_generated/i.test(error.message || '')) {
    const retry = await supabase
      .from('ugc_templates')
      .select('id, name, video_url, sample_script, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(limit);
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  return data || [];
}

function slugify(s) {
  return String(s || 'template')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'template';
}

async function main() {
  const args = parseArgs(process.argv);
  const outDir = path.resolve(
    args.out || path.join(process.cwd(), 'out', 'captioned-templates')
  );
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`▸ fetching top ${args.limit} template(s) from ugc_templates`);
  const templates = await fetchTopTemplates(args.limit);
  if (templates.length === 0) throw new Error('no active templates found');

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caption-templates-'));
  const results = [];

  try {
    for (let i = 0; i < templates.length; i++) {
      const tpl = templates[i];
      const presetId = PRESET_BY_INDEX[i] || 'bold';
      console.log(
        `\n[${i + 1}/${templates.length}] "${tpl.name}" (sort_order=${tpl.sort_order}) → preset "${presetId}"`
      );
      if (!tpl.video_url) {
        console.warn('  ✗ no video_url — skipping');
        continue;
      }

      const inputPath = path.join(workDir, `in-${i}.mp4`);
      const outName = `${String(i + 1).padStart(2, '0')}-${slugify(tpl.name)}-${presetId}.mp4`;
      const outPath = path.join(outDir, outName);

      console.log(`  ▸ downloading ${tpl.video_url}`);
      const bytes = await downloadTo(inputPath, tpl.video_url);
      console.log(`    ${(bytes / 1024 / 1024).toFixed(2)} MB`);

      console.log('  ▸ captioning (whisper + libass)');
      const stats = await captionVideo({
        inputPath,
        outputPath: outPath,
        scriptHint: tpl.sample_script || undefined,
        presetId,
      });
      console.log(`    ✓ ${stats.cues} cues, ${stats.wordCount} words → ${outPath}`);
      results.push({ name: tpl.name, presetId, outPath });
    }
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n✓ done — ${results.length} captioned video(s) in:\n  ${outDir}`);
  for (const r of results) console.log(`  • ${path.basename(r.outPath)}  [${r.presetId}]`);
  console.log(`\nopen: open "${outDir}"`);
}

main().catch((err) => {
  console.error('\n✗ failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
