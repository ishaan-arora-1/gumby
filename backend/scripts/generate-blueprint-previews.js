/**
 * Renders a preview video for each blueprint template by running the real
 * pipeline once with a demo product image. The finished Supabase URLs are
 * printed at the end — paste them into `previewVideoUrl` /
 * `previewPosterUrl` in src/services/blueprints.js so the gallery cards
 * show actual example videos instead of gradient covers.
 *
 * Costs real FAL credits (~$0.35 per 5s clip, more for 10s), so it runs
 * sequentially and only what you ask for:
 *
 *   node scripts/generate-blueprint-previews.js \
 *     --product-image https://…/demo-serum.jpg \
 *     --product-name "GlowDew Serum" \
 *     [--only handheld-hype,unboxing-asmr]
 *
 * Requires FAL_KEY + Supabase env (same as the server). Jobs are inserted
 * with a system user id (env PREVIEW_USER_ID or the first user row) and
 * creditCost 0 so no one is charged.
 */
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../src/config/supabase');
const { runUGCJob } = require('../src/services/ugcPipeline');
const blueprints = require('../src/services/blueprints');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function main() {
  const productImage = arg('product-image');
  const productName = arg('product-name') || '';
  const only = (arg('only') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!productImage) {
    console.error('Usage: node scripts/generate-blueprint-previews.js --product-image <url> [--product-name "..."] [--only id1,id2]');
    process.exit(1);
  }

  let userId = process.env.PREVIEW_USER_ID;
  if (!userId) {
    const { data } = await supabase.from('users').select('id').limit(1).single();
    userId = data?.id;
  }
  if (!userId) {
    console.error('No user found — set PREVIEW_USER_ID.');
    process.exit(1);
  }

  const targets = blueprints.BLUEPRINTS.filter(
    (b) => !only.length || only.includes(b.id)
  );
  console.log(`Rendering ${targets.length} blueprint preview(s)…`);

  const results = [];
  for (const bp of targets) {
    const prompt = blueprints.compilePrompt(bp, { productName, productDescription: '' });
    const script = bp.creatorSpeaks
      ? blueprints.compileFallbackScript(bp, productName)
      : '';
    const job = {
      id: uuidv4(),
      user_id: userId,
      template_id: null,
      product_name: productName,
      product_image_url: productImage,
      product_description: '',
      script,
      status: 'queued',
      progress: 0,
      video_duration: bp.durationSeconds,
      template_snapshot: {
        blueprint_id: bp.id,
        blueprint_name: `${bp.name} (preview)`,
        prompt,
        attachments: [{ url: productImage, role: 'product' }],
        aspect_ratio: bp.aspectRatio,
        creator_speaks: bp.creatorSpeaks,
        captions_enabled: bp.creatorSpeaks && !!bp.captionPreset,
        caption_preset: bp.captionPreset,
      },
    };
    const { data: inserted, error } = await supabase
      .from('ugc_jobs').insert(job).select().single();
    if (error) {
      console.error(`[${bp.id}] insert failed:`, error.message);
      continue;
    }
    console.log(`\n[${bp.id}] generating (${bp.durationSeconds}s, speaks=${bp.creatorSpeaks})…`);
    await runUGCJob(inserted, { creditCost: 0 });
    const { data: done } = await supabase
      .from('ugc_jobs')
      .select('status, output_video_url, output_thumbnail_url, error')
      .eq('id', inserted.id)
      .single();
    if (done?.status === 'completed') {
      console.log(`[${bp.id}] ✅ ${done.output_video_url}`);
      results.push({ id: bp.id, video: done.output_video_url, poster: done.output_thumbnail_url });
    } else {
      console.error(`[${bp.id}] ❌ ${done?.error || 'failed'}`);
    }
  }

  console.log('\n================ PASTE INTO blueprints.js ================');
  for (const r of results) {
    console.log(`\n// ${r.id}`);
    console.log(`previewVideoUrl: '${r.video}',`);
    console.log(`previewPosterUrl: '${r.poster}',`);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
