/**
 * Syncs blueprint preview URLs from the database into
 * src/services/blueprints.js.
 *
 * generate-blueprint-previews.js runs the real pipeline, so every finished
 * preview lives in ugc_jobs (blueprint_name tagged "(preview)"). This script
 * takes the LATEST completed preview job per blueprint and rewrites that
 * blueprint's `previewVideoUrl` / `previewPosterUrl` in place — no manual
 * copy-pasting of signed URLs.
 *
 *   node scripts/sync-blueprint-previews.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('../src/config/supabase');

const BLUEPRINTS_PATH = path.join(__dirname, '../src/services/blueprints.js');

(async () => {
  const { data, error } = await supabase.from('ugc_jobs')
    .select('status, output_video_url, output_thumbnail_url, template_snapshot, created_at')
    .like('template_snapshot->>blueprint_name', '%(preview)%')
    .eq('status', 'completed')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const latest = {};
  for (const j of data) latest[j.template_snapshot.blueprint_id] = j;

  let src = fs.readFileSync(BLUEPRINTS_PATH, 'utf8');
  let patched = 0;
  for (const [id, j] of Object.entries(latest)) {
    const rx = new RegExp(
      "(id: '" + id + "',[\\s\\S]*?)previewVideoUrl: (?:null|'[^']*'),\\n(\\s*)previewPosterUrl: (?:null|'[^']*'),"
    );
    if (!rx.test(src)) {
      console.error(`no blueprint entry matched for ${id} — skipped`);
      continue;
    }
    src = src.replace(
      rx,
      "$1previewVideoUrl: '" + j.output_video_url + "',\n$2previewPosterUrl: '" +
        (j.output_thumbnail_url || j.output_video_url) + "',"
    );
    patched++;
  }
  fs.writeFileSync(BLUEPRINTS_PATH, src);

  delete require.cache[require.resolve(BLUEPRINTS_PATH)];
  const b = require(BLUEPRINTS_PATH).publicBlueprints();
  console.log(`patched ${patched} | previews: ${b.filter((x) => x.preview_video_url).length}/${b.length}`);
  const missing = b.filter((x) => !x.preview_video_url).map((x) => x.id);
  console.log('missing:', missing.join(', ') || 'none');
})().catch((e) => { console.error(e); process.exit(1); });
