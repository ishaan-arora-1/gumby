const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { openai } = require('../config/openai');
const { getRedisClient } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const { runUGCJob } = require('../services/ugcPipeline');
const { runCreatorJob } = require('../services/creatorPipeline');

// ---------- Public ----------
// Public endpoint for the marketing site — returns a small set of active
// templates with no auth required. Safe because the rows are public-facing
// curated content (the same data we show to authenticated users).
router.get('/featured', async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60');
  const limit = Math.min(parseInt(req.query.limit) || 8, 20);
  try {
    const { data, error } = await supabase
      .from('ugc_templates')
      .select('id, name, actor_name, description, video_url, thumbnail_url, category, tags')
      .eq('is_active', true)
      .or('is_user_generated.is.null,is_user_generated.eq.false')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) {
    // Fallback: try without the user-gen filter for older schemas
    try {
      const { data } = await supabase
        .from('ugc_templates')
        .select('id, name, actor_name, description, video_url, thumbnail_url, category, tags')
        .eq('is_active', true)
        .limit(limit);
      res.json({ success: true, data: data || [] });
    } catch (e) {
      console.error('featured templates error:', e);
      res.json({ success: true, data: [] });
    }
  }
});

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

// ---------- AI script writer ----------

router.post('/script', async (req, res) => {
  const {
    productName,
    productDescription,
    template,
    tone,
    targetSeconds: requestedSeconds,
  } = req.body || {};

  const tplName = template?.name || 'casual UGC';
  const tplActor = template?.actor_name || 'a creator';
  const tplSetting = template?.setting || '';
  const tplSampleScript = template?.sample_script || '';
  const hasProduct = productName && productName.trim().length > 0;
  // Target the voice-over length to match the video duration the user
  // selected (5 or 10s). Kling 3.0 Pro renders fixed-length clips, so an
  // overlong script forces the TTS to speed up and the lip-sync to clip
  // the tail. We size the script to ~2.0 spoken words per second with a
  // hard upper bound, which leaves the creator room to breathe and land
  // the last beat cleanly.
  const targetSeconds = Math.min(15, Math.max(5, Number(requestedSeconds) || 10));
  const wordTarget = Math.round(targetSeconds * 2.0);
  const wordMax = Math.round(targetSeconds * 2.4);

  // We are NOT writing ad copy. We are writing what a real person would
  // actually say into their phone camera while filming a casual video for
  // their followers. The previous prompt drifted into ad-copy territory
  // ("check this out", "here's what it does") which reads as obviously
  // AI-written. The rewrite below forces a personal-story angle:
  // creator talks about *their own* experience, not the product's
  // features.
  const sys = [
    "You write what a real person would say into their phone camera — NOT ad copy, NOT marketing copy, NOT a product pitch.",
    "Imagine a friend casually telling their followers about something they discovered. They are not selling — they are sharing.",
    "Output ONE script ONLY. Plain text. No headings, no quotes, no stage directions, no parentheses, no labels, no asterisks.",
    "",
    "VOICE RULES (these matter — break any of these and the output sounds AI-written):",
    "- First-person personal experience. Lead with what happened to YOU, how YOU feel, what YOU noticed. Examples: 'I recently got something I'm kind of obsessed with…', 'Okay so I've been using this for a few weeks and…', 'I genuinely did not expect to like this as much as I do…'.",
    "- Conversational, mid-sentence energy. Use contractions everywhere (I've, I'm, that's, don't, kinda, gonna). Use casual filler the way humans actually do: 'honestly', 'like', 'okay so', 'real talk', 'kind of', 'lowkey', 'I mean'. Don't overdo it — one or two per script.",
    "- Specific over generic. Mention a tiny concrete detail (a moment, a feeling, a side-effect, a place you used it). Generic adjectives like 'amazing', 'incredible', 'life-changing', 'game-changer' are BANNED.",
    "- No marketing verbs. NEVER use 'check this out', 'you have to try', 'introducing', 'this product', 'this brand', 'features', 'benefits', 'shop now', 'link in bio', 'get yours', 'sponsored', 'partnership'. NEVER address the audience as 'guys' more than once.",
    "- No corporate transitions. NEVER use 'but here's the thing', 'spoiler alert', 'plot twist'.",
    "- The 'CTA' should be a soft personal nudge a friend would say, not ad copy. Good: 'if you've been on the fence I'd just try it', 'do with that what you will', 'felt rude not to share'. Bad: 'click the link', 'shop now', 'don't miss out'.",
    "- Sound mid-thought. It is fine — preferred, even — to start with 'so', 'okay', 'I', or a fragment.",
    "- Vary sentence length. Some short. Some medium. Avoid three same-length sentences in a row.",
    "- No emojis, no hashtags, no brackets, no asterisks. Never mention scripts, AI, ads, or video.",
    "",
    `LENGTH IS A HARD CONSTRAINT. The creator has exactly ${targetSeconds} seconds on camera.`,
    `Write ${wordTarget} words. Absolute maximum ${wordMax} words. Count your words before responding.`,
    `If you go over, the TTS will speed up unnaturally and the lip-sync will clip the ending. Shorter is always better than longer.`,
    `For a ${targetSeconds}-second video: ${targetSeconds <= 5 ? 'one tight sentence, maybe two short fragments. A single beat.' : 'two or three sentences max. One setup, one payoff. No third beat.'}`,
  ].join('\n');

  const userPrompt = hasProduct
    ? [
        `Creator vibe: ${tplActor} filming casually in ${tplSetting}.`,
        tplSampleScript ? `Creator's normal voice (just a tone reference, do NOT copy): "${tplSampleScript}"` : '',
        `What they're talking about: ${productName}`,
        productDescription ? `Context (for YOU, do not parrot this back — translate it into a personal moment): ${productDescription}` : '',
        tone ? `Tone the brand is going for: ${tone}` : '',
        '',
        'Write what this person would actually say into their phone. They are sharing a personal experience with something they like — they are not pitching it. Lead with their own moment ("I recently…", "I\'ve been…", "Okay so I…"). Talk about how it fits into their life, not what the product is or does. End with a casual personal nudge, never an ad CTA.',
      ].filter(Boolean).join('\n')
    : [
        `Creator vibe: ${tplActor} filming casually in ${tplSetting}.`,
        tplSampleScript ? `Creator's normal voice (just a tone reference, do NOT copy): "${tplSampleScript}"` : '',
        tone ? `Tone: ${tone}` : '',
        '',
        'Write what this person would actually say to their followers — a casual personal moment, a small story, an opinion, or something they\'ve been thinking about. First-person. Specific, not generic. Ends on a real human thought, not a CTA. No product placement.',
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
    let script = (completion.choices?.[0]?.message?.content || '').trim();
    // Safety net: if the model overshoots the hard cap, trim to the last
    // sentence boundary that fits. Keeps the script playable inside the
    // fixed video duration even when the prompt instructions drift.
    const words = script.split(/\s+/);
    if (words.length > wordMax) {
      const trimmed = words.slice(0, wordMax).join(' ');
      const lastStop = Math.max(
        trimmed.lastIndexOf('.'),
        trimmed.lastIndexOf('!'),
        trimmed.lastIndexOf('?')
      );
      script = lastStop > wordMax * 3
        ? trimmed.slice(0, lastStop + 1).trim()
        : trimmed.trim();
    }
    return res.json({ success: true, data: { script } });
  } catch (err) {
    console.error('UGC script error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate script' });
  }
});

// ---------- Parse prompt (direct mode) ----------

router.post('/parse-prompt', async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 6) {
    return res.status(400).json({ success: false, error: 'Prompt is too short' });
  }

  try {
    // The parser extracts three independent pieces of context from the
    // free-form prompt: the creator, the product, AND the on-camera action
    // (videoDescription). videoDescription is what we feed straight to
    // Kling 3.0 Pro as the action prompt, so it has to be vivid and
    // specific. If the user didn't describe the action in their prompt,
    // we synthesize a sensible default — the user can still edit it in
    // the Studio card before generating.
    const systemPrompt = [
      'You are a UGC video assistant. The user will give you a free-form prompt describing a video they want to create.',
      'The video may or may not involve a product. Extract structured fields from their prompt and return ONLY a JSON object — no prose, no markdown.',
      '',
      'Fields to extract:',
      '- creatorDescription: Physical appearance + setting of the person in the video (e.g. "20-year-old athletic man in a modern gym"). If not specified, infer a reasonable creator. 1-2 sentences max.',
      '- productName: The product being advertised. Use empty string "" if no product is mentioned or the video is not about a product.',
      '- productDescription: What the product does / key selling points. Empty string if no product.',
      '- videoDescription: A concrete description of what the creator should DO on camera — the action, movement, body language, and interactions. Should describe one continuous shot (no scene cuts). If the user did not specify the action, infer a natural action that matches the creator and product. Be vivid and specific. 1-3 sentences.',
      '- suggestedDuration: 5 or 10 seconds. Default 10. Use 5 only for very simple single-beat concepts.',
      '- includeProduct: boolean — true if the user mentioned a specific product to feature, false otherwise.',
      '',
      'Return: {"creatorDescription":"...","productName":"...","productDescription":"...","videoDescription":"...","suggestedDuration":10,"includeProduct":true}',
    ].join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt.trim() },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);

    // Kling 3.0 Pro only renders 5s or 10s — collapse 15s requests down so
    // we don't promise the user something we can't deliver in one shot.
    const rawDur = Number(parsed.suggestedDuration);
    const suggestedDuration = rawDur >= 8 ? 10 : 5;

    const result = {
      creatorDescription: (parsed.creatorDescription || '').slice(0, 500),
      productName: (parsed.productName || '').slice(0, 200),
      productDescription: (parsed.productDescription || '').slice(0, 500),
      videoDescription: (parsed.videoDescription || '').slice(0, 1000),
      suggestedDuration,
      includeProduct: parsed.includeProduct !== false && (parsed.productName || '').trim().length > 0,
    };

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('UGC parse-prompt error:', err);
    return res.status(500).json({ success: false, error: 'Failed to parse prompt' });
  }
});

// ---------- Jobs ----------

router.post('/generate', async (req, res) => {
  const userId = req.user.id;
  const {
    templateId,
    creatorDescription,
    creatorTweaks,
    productName,
    productDescription,
    productImageUrl,
    inspirationImageUrl,
    script,
    videoDescription,
    videoDuration,
  } = req.body || {};

  // Either a templateId or a creatorDescription is required (direct mode)
  const isDirectMode = !templateId && typeof creatorDescription === 'string' && creatorDescription.trim().length > 0;
  if (!templateId && !isDirectMode) {
    return res.status(400).json({ success: false, error: 'templateId or creatorDescription is required' });
  }
  if (!script || !script.trim()) {
    return res.status(400).json({ success: false, error: 'script is required' });
  }

  try {
    let template = null;
    if (templateId) {
      const { data: tplData, error: tplErr } = await supabase
        .from('ugc_templates')
        .select('*')
        .eq('id', templateId)
        .single();
      if (tplErr || !tplData) {
        return res.status(404).json({ success: false, error: 'Template not found' });
      }
      template = tplData;
    }

    const job = {
      id: uuidv4(),
      user_id: userId,
      template_id: templateId || null,
      product_name: productName || '',
      product_image_url: productImageUrl || null,
      product_description: productDescription || '',
      // Optional inspiration photo. When present, the pipeline runs the
      // image through Flux Kontext Pro to produce a creator-in-scene
      // still that seeds the Kling 3.0 Pro video generation.
      inspiration_image_url: typeof inspirationImageUrl === 'string' && inspirationImageUrl.length
        ? inspirationImageUrl
        : null,
      script: script.trim(),
      status: 'queued',
      progress: 0,
    };

    if (template) {
      const cleanTweaks = typeof creatorTweaks === 'string'
        ? creatorTweaks.trim().slice(0, 500)
        : '';
      job.template_snapshot = {
        name: template.name,
        actor_name: template.actor_name,
        setting: template.setting,
        video_url: template.video_url,
        thumbnail_url: template.thumbnail_url,
        aspect_ratio: template.aspect_ratio,
        duration_seconds: template.duration_seconds,
        // Optional user-provided tweaks ("same person but on a beach…").
        // Read by the pipeline to relax the "keep scene identical" rule
        // in the Nano Banana seed image prompt while still locking the
        // template creator's face and identity.
        user_tweaks: cleanTweaks || null,
      };
    } else {
      // Direct mode: store creator description in the snapshot so the
      // pipeline can use it for text-to-video scene generation.
      job.template_snapshot = {
        name: 'Direct prompt',
        actor_name: creatorDescription.trim(),
        setting: null,
        video_url: null,
        thumbnail_url: null,
        aspect_ratio: '9:16',
        duration_seconds: null,
      };
    }

    // Single-shot pipeline: the user's video description + duration are
    // passed straight to Kling 3.0 Pro. No GPT scene decomposition, no
    // intercut B-roll — one prompt, one video generation call.
    const cleanVideoDesc = typeof videoDescription === 'string' ? videoDescription.trim() : '';
    if (cleanVideoDesc) {
      job.video_description = cleanVideoDesc.slice(0, 1000);
    }
    // Kling 3.0 Pro accepts only `"5"` or `"10"` for duration. We collapse
    // anything else (including legacy 15s requests from older clients) to
    // the nearest supported value.
    const rawDuration = Number(videoDuration);
    job.video_duration = rawDuration >= 8 ? 10 : (rawDuration > 0 ? 5 : 10);

    console.log(
      `[ugc:new] user=${userId.slice(0,8)} tpl=${templateId ? templateId.slice(0,8) : 'direct'} ` +
      `mode=single-shot${isDirectMode ? ' (direct)' : ''} ` +
      `inspiration=${job.inspiration_image_url ? 'yes' : 'no'} ` +
      `product_image=${productImageUrl ? 'yes' : 'no'} ` +
      `video_dur=${job.video_duration || 'n/a'}`
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
      // Pre-migration fallback — if new columns aren't there yet, strip
      // them and retry. The pipeline will still run with whatever it has.
      const msg = insErr?.message || '';
      if (/not-null.*template_id|template_id.*not.null/i.test(msg) && isDirectMode) {
        return res.status(400).json({
          success: false,
          error: 'Direct mode requires migration 007. Run: npm run migrate:nullable-template',
        });
      }
      if (/shot_plan|broll_urls|creator_reference_image_url|creator_scene_image_url|inspiration_image_url|video_description|video_duration/i.test(msg)) {
        console.warn('UGC generate: missing columns, retrying without new fields. Please apply latest migrations.');
        delete job.video_description;
        delete job.video_duration;
        delete job.inspiration_image_url;
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

const MAX_CREATOR_DURATION_S = 10; // Kling 3.0 enum is "5" | "10"
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

// ---------- Image uploads (signed URL passthrough) ----------

/**
 * Upload helper used by both product images and inspiration images. Stores
 * the bytes under a user-scoped path in the ugc-videos bucket and returns
 * a long-lived signed URL the iOS client can pass straight into a
 * subsequent /ugc/generate request.
 */
async function uploadImageBase64({ kind, userId, contentType, base64 }) {
  const buf = Buffer.from(base64, 'base64');
  const ext = (contentType || '').includes('jpeg') ? 'jpg'
            : (contentType || '').includes('webp') ? 'webp'
            : 'png';
  const subdir = kind === 'inspiration' ? 'inspirations' : 'products';
  const objectPath = `${subdir}/${userId}/${uuidv4()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('ugc-videos')
    .upload(objectPath, buf, { contentType: contentType || 'image/png', upsert: false });
  if (upErr) throw upErr;
  const { data: signed } = await supabase.storage
    .from('ugc-videos')
    .createSignedUrl(objectPath, 60 * 60 * 24 * 365);
  return signed?.signedUrl || null;
}

router.post('/upload-product-image', async (req, res) => {
  const { contentType, base64 } = req.body || {};
  if (!base64) {
    return res.status(400).json({ success: false, error: 'base64 image required' });
  }
  try {
    const url = await uploadImageBase64({
      kind: 'product',
      userId: req.user.id,
      contentType,
      base64,
    });
    return res.json({ success: true, data: { url } });
  } catch (err) {
    console.error('UGC product image upload error:', err);
    return res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

/**
 * Same shape as /upload-product-image, separate path so the bucket layout
 * makes the intent obvious and so we can attach different access policies
 * later if needed. The returned signed URL is what the iOS client passes
 * to /ugc/generate as `inspirationImageUrl`.
 */
router.post('/upload-inspiration-image', async (req, res) => {
  const { contentType, base64 } = req.body || {};
  if (!base64) {
    return res.status(400).json({ success: false, error: 'base64 image required' });
  }
  try {
    const url = await uploadImageBase64({
      kind: 'inspiration',
      userId: req.user.id,
      contentType,
      base64,
    });
    return res.json({ success: true, data: { url } });
  } catch (err) {
    console.error('UGC inspiration image upload error:', err);
    return res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

module.exports = router;
