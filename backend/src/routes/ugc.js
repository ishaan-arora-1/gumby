const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { openai } = require('../config/openai');
const { getRedisClient } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const { runUGCJob, VOICE_PRESETS } = require('../services/ugcPipeline');

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

    let q = supabase
      .from('ugc_templates')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (category) q = q.eq('category', category);

    const { data: templates, error, count } = await q.range(offset, offset + limit - 1);
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
  return res.json({ success: true, data: VOICE_PRESETS });
});

// ---------- AI script writer ----------

router.post('/script', async (req, res) => {
  const {
    productName,
    productDescription,
    template,
    tone,
  } = req.body || {};

  if (!productName) {
    return res.status(400).json({ success: false, error: 'productName required' });
  }

  const tplName = template?.name || 'casual UGC';
  const tplActor = template?.actor_name || 'a creator';
  const tplSetting = template?.setting || '';
  const tplSampleScript = template?.sample_script || '';
  const targetSeconds = template?.duration_seconds || 14;
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

    const { data: inserted, error: insErr } = await supabase
      .from('ugc_jobs')
      .insert(job)
      .select()
      .single();
    if (insErr) throw insErr;

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
