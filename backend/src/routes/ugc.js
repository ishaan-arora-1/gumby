const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { openai } = require('../config/openai');
const { getRedisClient } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const { runUGCJob, VOICE_PRESETS, generateVoicePreview } = require('../services/ugcPipeline');
const { runCreatorJob } = require('../services/creatorPipeline');

router.use(authMiddleware);

// ---------- Templates ----------

router.get('/templates', async (req, res) => {
  // Never let any layer (URLSession on iOS, an intermediate proxy, the
  // browser) cache this response — the catalog includes signed URLs that
  // change whenever the script regenerates videos, and stale URLs are the
  // root cause of "videos keep loading" symptoms in the iOS feed.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const category = (req.query.category || '').trim();

  try {
    const redis = await getRedisClient();
    // v3 cache namespace — bump whenever the schema or URL shape changes so
    // stale Redis entries are bypassed without a manual flush.
    const cacheKey = `ugc_templates_v3:${category || 'all'}:${page}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    // Hidden user-generated creators (created via the chat's text-to-video
    // composer) live in the same table so the /ugc/generate pipeline can
    // reference them, but they must NOT appear in the public Models feed.
    // We attempt the filter first and fall back to an unfiltered query if
    // the column doesn't exist yet (i.e. migration 004 hasn't been applied),
    // so the curated catalog keeps working in either case.
    const buildQ = (withUserGenFilter) => {
      let qb = supabase
        .from('ugc_templates')
        .select('*', { count: 'exact' })
        .eq('is_active', true);
      if (withUserGenFilter) {
        qb = qb.or('is_user_generated.is.null,is_user_generated.eq.false');
      }
      return qb.order('sort_order', { ascending: true });
    };
    let q = buildQ(true);
    if (category) q = q.eq('category', category);

    let { data: templates, error, count } = await q.range(offset, offset + limit - 1);
    if (error && /is_user_generated/i.test(error.message || '')) {
      // Migration 004 hasn't been applied yet — fall back to the legacy
      // (pre-migration) query so the curated catalog keeps loading.
      let fallback = buildQ(false);
      if (category) fallback = fallback.eq('category', category);
      const retry = await fallback.range(offset, offset + limit - 1);
      templates = retry.data;
      error = retry.error;
      count = retry.count;
    }
    if (error) throw error;

    const response = {
      success: true,
      data: templates || [],
      page,
      total_pages: Math.ceil((count || 0) / limit),
      total_count: count || 0,
    };

    await redis.setEx(cacheKey, 300, JSON.stringify(response));
    return res.json(response);
  } catch (err) {
    console.error('UGC templates error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch templates' });
  }
});

router.get('/templates/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ugc_templates')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error('UGC template fetch error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch template' });
  }
});

// ---------- Voices ----------

router.get('/voices', (req, res) => {
  // Strip the internal `sample` line — the iOS app only needs id/label/gender.
  const data = VOICE_PRESETS.map(({ id, label, gender }) => ({ id, label, gender }));
  return res.json({ success: true, data });
});

/**
 * Returns a signed URL to a short MP3 sample for the requested voice. The
 * sample is generated lazily on first call and cached in Supabase Storage,
 * so the second tap onwards is effectively free.
 */
router.get('/voices/:id/preview', async (req, res) => {
  const id = req.params.id;
  if (!VOICE_PRESETS.some((v) => v.id === id)) {
    return res.status(404).json({ success: false, error: 'Unknown voice' });
  }
  try {
    const url = await generateVoicePreview(id);
    return res.json({ success: true, data: { url } });
  } catch (err) {
    console.error('Voice preview error:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Failed to generate preview',
    });
  }
});

// ---------- AI script writer ----------

router.post('/script', async (req, res) => {
  const {
    productName,
    productDescription,
    template,
    tone,
    targetSeconds: requestedSeconds,
  } = req.body || {};

  if (!productName) {
    return res.status(400).json({ success: false, error: 'productName required' });
  }

  const tplName = template?.name || 'casual UGC';
  const tplActor = template?.actor_name || 'a creator';
  const tplSetting = template?.setting || '';
  const tplSampleScript = template?.sample_script || '';
  // Target a ~22s voice-over so the lip-sync video is long enough to host
  // 3 × 5s b-roll cuts via the rich-intercut path (threshold ≈ 21s). This
  // is what keeps the voiceover playing continuously *over* the b-roll
  // instead of falling to the append fallback (which pads silence).
  // Client can override via `targetSeconds` if they want a shorter or
  // longer ad. Template's `duration_seconds` is the CREATOR clip length,
  // not the voice-over length, so we don't read it here anymore.
  const targetSeconds = Math.min(45, Math.max(8, Number(requestedSeconds) || 22));
  const wordTarget = Math.max(20, Math.round(targetSeconds * 2.4));

  const sys = [
    "You are a top-tier UGC ad copywriter who writes scripts that sound like real, unscripted creator videos.",
    "Output ONE script ONLY — plain text, no headings, no quotes, no stage directions, no parentheses.",
    "Sound natural, conversational, contraction-heavy. Use hooks, casual filler ('honestly', 'okay so', 'real talk'), and a soft CTA at the end.",
    "Do NOT use emojis. Do NOT use hashtags. Do NOT use brackets. Do NOT mention scripts/AI/ads.",
    "First sentence must be a strong hook (under 8 words).",
    `Length target: about ${wordTarget} words (${targetSeconds}s spoken).`,
  ].join(' ');

  const userPrompt = [
    `Template: "${tplName}" — performed by ${tplActor} in ${tplSetting}.`,
    tplSampleScript ? `Tone reference (the actor's existing vibe): "${tplSampleScript}"` : '',
    `Product: ${productName}`,
    productDescription ? `What it is: ${productDescription}` : '',
    tone ? `Brand tone: ${tone}` : '',
    'Write the new spoken script, in first-person, that this creator would say about the product. Match the original vibe but talk about the product naturally and end with a soft CTA.',
  ].filter(Boolean).join('\n');

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.9,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userPrompt },
      ],
    });
    const script = (completion.choices?.[0]?.message?.content || '').trim();
    return res.json({ success: true, data: { script } });
  } catch (err) {
    console.error('UGC script error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate script' });
  }
});

// ---------- Product B-roll shot suggestions ----------

/**
 * Auto-draft 2-3 shot ideas for the user's product B-roll. Given the
 * script + product info + creator description, GPT outputs visual shot
 * descriptions like "Holding the bag in both hands, smiling at camera"
 * that we then feed to Kling Elements. The user can edit/replace these
 * before kicking off generation.
 */
router.post('/shots/suggest', async (req, res) => {
  const {
    productName = '',
    productDescription = '',
    productTone = '',
    creatorDescription = '',
    script = '',
    shotCount: rawCount,
  } = req.body || {};

  const shotCount = Math.min(3, Math.max(2, parseInt(rawCount, 10) || 3));

  const sys = [
    "You're a UGC ad director planning B-roll shots for a short vertical ad.",
    "You will return ONLY a JSON object with a 'shots' array — no prose, no markdown.",
    "Each shot must be one short sentence (max 22 words) describing a single concrete visual where the creator physically interacts with the product.",
    "Shots should escalate from intro (showing the product) to active use to finishing moment.",
    "NO camera jargon, NO music notes, NO transitions. Just what's happening on screen.",
    "Avoid mentioning brand names other than the product.",
  ].join(' ');

  const userPrompt = [
    `Creator: ${creatorDescription || 'an early-20s lifestyle creator on camera'}`,
    `Product: ${productName}`,
    productDescription ? `What it does: ${productDescription}` : '',
    productTone ? `Tone: ${productTone}` : '',
    script ? `Voice-over script (so shots match the words):\n"${script.slice(0, 1200)}"` : '',
    `Return JSON: {"shots":[{"description":"..."}, ...]} with exactly ${shotCount} shots.`,
  ].filter(Boolean).join('\n');

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: userPrompt },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content || '{}';
    let parsed = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    const shots = Array.isArray(parsed?.shots) ? parsed.shots : [];
    const cleaned = shots
      .map((s) => ({
        description: typeof s?.description === 'string'
          ? s.description.trim()
          : (typeof s === 'string' ? s.trim() : ''),
      }))
      .filter((s) => s.description.length > 0)
      .slice(0, shotCount);

    // Defensive fallback so the UI never sees an empty array.
    if (cleaned.length === 0) {
      const fallback = [
        { description: `Holding the ${productName || 'product'} in their hand, smiling at camera in their bedroom.` },
        { description: `Close-up of the ${productName || 'product'}: gently turning it to show the label.` },
        { description: `Using the ${productName || 'product'} for the first time on camera, reacting naturally.` },
      ].slice(0, shotCount);
      return res.json({ success: true, data: { shots: fallback, fallback: true } });
    }

    return res.json({ success: true, data: { shots: cleaned } });
  } catch (err) {
    console.error('UGC shots/suggest error:', err);
    return res.status(500).json({ success: false, error: 'Failed to suggest shots' });
  }
});

// ---------- Jobs ----------

router.post('/generate', async (req, res) => {
  const userId = req.user.id;
  const {
    templateId,
    productName,
    productDescription,
    productImageUrl,
    script,
    voiceId,
  } = req.body || {};

  if (!templateId || !script || !script.trim()) {
    return res.status(400).json({ success: false, error: 'templateId and script are required' });
  }

  try {
    const { data: template, error: tplErr } = await supabase
      .from('ugc_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    if (tplErr || !template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    const job = {
      id: uuidv4(),
      user_id: userId,
      template_id: templateId,
      template_snapshot: {
        name: template.name,
        actor_name: template.actor_name,
        setting: template.setting,
        video_url: template.video_url,
        thumbnail_url: template.thumbnail_url,
        aspect_ratio: template.aspect_ratio,
        duration_seconds: template.duration_seconds,
      },
      product_name: productName || '',
      product_image_url: productImageUrl || null,
      product_description: productDescription || '',
      script: script.trim(),
      voice_id: voiceId || template.voice_id || 'Rachel',
      status: 'queued',
      progress: 0,
    };

    // Optional product shot plan — drives the Kling Elements B-roll +
    // intercut step. Defensive parse so we never insert garbage even if the
    // client misbehaves; clamp to 3 shots max (one minute total max ad len).
    const rawShots = Array.isArray(req.body?.shotPlan) ? req.body.shotPlan : [];
    const shotPlan = rawShots
      .map((s) => ({
        description: typeof s?.description === 'string' ? s.description.trim() : '',
        duration_seconds: Number.isFinite(Number(s?.durationSeconds))
          ? Math.min(10, Math.max(5, Math.round(Number(s.durationSeconds))))
          : 5,
      }))
      .filter((s) => s.description.length > 0 && s.description.length <= 400)
      .slice(0, 3);
    if (shotPlan.length > 0) {
      job.shot_plan = shotPlan;
    }
    // Diagnostic: easy to grep for, so we can confirm at a glance which
    // ingredients each generation actually received (this was useful when
    // a video came out lip-sync-only and we needed to know whether the
    // client even sent shots/product image).
    console.log(
      `[ugc:new] user=${userId.slice(0,8)} tpl=${templateId.slice(0,8)} ` +
      `product_image=${productImageUrl ? 'yes' : 'no'} ` +
      `shots=${shotPlan.length} ` +
      `voice=${job.voice_id}`
    );

    let inserted;
    try {
      const { data, error: insErr } = await supabase
        .from('ugc_jobs')
        .insert(job)
        .select()
        .single();
      if (insErr) throw insErr;
      inserted = data;
    } catch (insErr) {
      // Pre-migration fallback — if the `shot_plan` column isn't there yet,
      // strip the shot plan and retry. The pipeline will still run, just
      // without B-roll.
      const msg = insErr?.message || '';
      if (job.shot_plan && /shot_plan|broll_urls|creator_reference_image_url/i.test(msg)) {
        console.warn('UGC generate: shot_plan column missing, retrying without it. Please apply migrations/005_product_shots.sql');
        delete job.shot_plan;
        const { data, error: retryErr } = await supabase
          .from('ugc_jobs')
          .insert(job)
          .select()
          .single();
        if (retryErr) throw retryErr;
        inserted = data;
      } else {
        throw insErr;
      }
    }

    // Fire-and-forget the pipeline. Errors are captured into the job row.
    setImmediate(() => {
      runUGCJob(inserted).catch((e) => console.error('Background runUGCJob error:', e));
    });

    return res.status(202).json({ success: true, data: inserted });
  } catch (err) {
    console.error('UGC generate error:', err);
    return res.status(500).json({ success: false, error: 'Failed to start generation' });
  }
});

router.get('/jobs', async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const { data: jobs, error, count } = await supabase
      .from('ugc_jobs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    return res.json({
      success: true,
      data: jobs || [],
      page,
      total_pages: Math.ceil((count || 0) / limit),
      total_count: count || 0,
    });
  } catch (err) {
    console.error('UGC jobs list error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch jobs' });
  }
});

router.get('/jobs/:id', async (req, res) => {
  const userId = req.user.id;
  try {
    const { data, error } = await supabase
      .from('ugc_jobs')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();
    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error('UGC job fetch error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch job' });
  }
});

router.delete('/jobs/:id', async (req, res) => {
  const userId = req.user.id;
  try {
    const { error } = await supabase
      .from('ugc_jobs')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error('UGC job delete error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete job' });
  }
});

// ---------- Standalone creator generation (text-to-video) ----------
//
// This is the chat's "describe your creator" path — the user types a prompt
// like "early 20s girl in a sunlit bedroom showing off a hoodie" and we
// generate a fresh on-camera persona via Kling 2.6 Pro text-to-video. The
// produced clip can either stand on its own (option C in the funnel) or be
// promoted into a hidden ugc_templates row that feeds the standard
// ElevenLabs TTS + sync-lipsync pipeline (option B).

const MAX_CREATOR_DURATION_S = 10; // Kling 2.6 enum is "5" | "10"
const MIN_PROMPT_LEN = 6;

router.post('/creator/generate', async (req, res) => {
  const userId = req.user.id;
  const {
    prompt,
    aspectRatio,
    durationSeconds,
  } = req.body || {};

  const cleanPrompt = (typeof prompt === 'string' ? prompt : '').trim();
  if (cleanPrompt.length < MIN_PROMPT_LEN) {
    return res.status(400).json({
      success: false,
      error: 'Describe the creator in a few more words (at least 6 characters).',
    });
  }

  // Whitelist the aspect ratio to values Kling 2.6 accepts.
  const aspect = ['9:16', '16:9', '1:1'].includes(aspectRatio) ? aspectRatio : '9:16';
  const duration = Number(durationSeconds) === 10 ? 10 : 5;

  try {
    const job = {
      id: uuidv4(),
      user_id: userId,
      prompt: cleanPrompt,
      aspect_ratio: aspect,
      duration_seconds: duration,
      status: 'queued',
      progress: 0,
    };
    const { data: inserted, error: insErr } = await supabase
      .from('ugc_creator_jobs')
      .insert(job)
      .select()
      .single();
    if (insErr) {
      if (/ugc_creator_jobs/i.test(insErr.message || '') &&
          /does not exist|schema cache/i.test(insErr.message || '')) {
        return res.status(503).json({
          success: false,
          error: 'Creator generation needs the latest migration applied. Paste backend/migrations/004_ugc_creator_jobs.sql into the Supabase SQL editor.',
        });
      }
      throw insErr;
    }

    setImmediate(() => {
      runCreatorJob(inserted).catch((e) =>
        console.error('Background runCreatorJob error:', e)
      );
    });

    return res.status(202).json({ success: true, data: inserted });
  } catch (err) {
    console.error('UGC creator generate error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to start creator generation',
    });
  }
});

router.get('/creator/jobs/:id', async (req, res) => {
  const userId = req.user.id;
  try {
    const { data, error } = await supabase
      .from('ugc_creator_jobs')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();
    if (error || !data) {
      return res.status(404).json({ success: false, error: 'Creator job not found' });
    }
    return res.json({ success: true, data });
  } catch (err) {
    console.error('UGC creator job fetch error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch creator job' });
  }
});

router.get('/creator/jobs', async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  try {
    const { data, error, count } = await supabase
      .from('ugc_creator_jobs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return res.json({
      success: true,
      data: data || [],
      page,
      total_pages: Math.ceil((count || 0) / limit),
      total_count: count || 0,
    });
  } catch (err) {
    console.error('UGC creator jobs list error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch creator jobs' });
  }
});

/**
 * The user's reusable creator "Library" — every completed creator clip they
 * have ever generated, sorted newest-first. This is the source of truth for
 * the "Library" tab on the Models screen and the Library toggle on the chat
 * welcome screen, so they can re-pick a previously generated model instead
 * of regenerating one each time.
 */
router.get('/library', async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;
  try {
    const { data, error, count } = await supabase
      .from('ugc_creator_jobs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return res.json({
      success: true,
      data: data || [],
      page,
      total_pages: Math.ceil((count || 0) / limit),
      total_count: count || 0,
    });
  } catch (err) {
    console.error('UGC library list error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch library' });
  }
});

router.delete('/creator/jobs/:id', async (req, res) => {
  const userId = req.user.id;
  try {
    const { error } = await supabase
      .from('ugc_creator_jobs')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error('UGC creator job delete error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete creator job' });
  }
});

/**
 * Promotes a completed user-generated creator clip into a hidden
 * ugc_templates row so the existing /ugc/script and /ugc/generate endpoints
 * can treat it like any curated template. The row is `is_active=false` and
 * `is_user_generated=true` so it never shows up in the public Models feed.
 *
 * Idempotent: if the creator job has already been promoted, returns the
 * existing template.
 */
router.post('/creator/jobs/:id/promote-to-template', async (req, res) => {
  const userId = req.user.id;
  try {
    const { data: job, error: jobErr } = await supabase
      .from('ugc_creator_jobs')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();
    if (jobErr || !job) {
      return res.status(404).json({ success: false, error: 'Creator job not found' });
    }
    if (job.status !== 'completed' || !job.video_url) {
      return res.status(400).json({
        success: false,
        error: 'Creator video is not ready yet',
      });
    }
    if (job.template_id) {
      const { data: existing } = await supabase
        .from('ugc_templates')
        .select('*')
        .eq('id', job.template_id)
        .single();
      if (existing) return res.json({ success: true, data: existing });
    }

    const sampleScript = (req.body?.sampleScript || '').toString().trim()
      || 'Honestly, I have been obsessed with this and I had to tell you about it.';
    const actorName = (req.body?.actorName || '').toString().trim() || 'Your creator';

    const tpl = {
      id: uuidv4(),
      name: actorName === 'Your creator' ? 'Custom creator' : actorName,
      actor_name: actorName,
      actor_avatar_url: job.thumbnail_url || null,
      description: job.prompt.slice(0, 240),
      setting: 'Generated from your prompt',
      video_url: job.video_url,
      thumbnail_url: job.thumbnail_url || job.video_url,
      sample_script: sampleScript,
      voice_id: 'Rachel',
      aspect_ratio: job.aspect_ratio || '9:16',
      duration_seconds: job.duration_seconds || 5,
      tags: ['custom'],
      category: 'custom',
      sort_order: 999,
      is_active: false,
      is_user_generated: true,
      owner_user_id: userId,
    };
    const { data: inserted, error: insErr } = await supabase
      .from('ugc_templates')
      .insert(tpl)
      .select()
      .single();
    if (insErr) throw insErr;

    await supabase
      .from('ugc_creator_jobs')
      .update({ template_id: inserted.id })
      .eq('id', job.id);

    return res.json({ success: true, data: inserted });
  } catch (err) {
    console.error('UGC creator promote error:', err);
    return res.status(500).json({ success: false, error: 'Failed to promote creator' });
  }
});

// ---------- Product image upload (signed URL passthrough) ----------

router.post('/upload-product-image', async (req, res) => {
  const { contentType, base64 } = req.body || {};
  if (!base64) {
    return res.status(400).json({ success: false, error: 'base64 image required' });
  }
  try {
    const buf = Buffer.from(base64, 'base64');
    const ext = (contentType || '').includes('jpeg') ? 'jpg'
              : (contentType || '').includes('webp') ? 'webp'
              : 'png';
    const path = `products/${req.user.id}/${uuidv4()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('ugc-videos')
      .upload(path, buf, { contentType: contentType || 'image/png', upsert: false });
    if (upErr) throw upErr;
    const { data: signed } = await supabase.storage
      .from('ugc-videos')
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    return res.json({ success: true, data: { url: signed?.signedUrl } });
  } catch (err) {
    console.error('UGC product image upload error:', err);
    return res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

module.exports = router;
