const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { openai } = require('../config/openai');
const { getRedisClient } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const { runUGCJob } = require('../services/ugcPipeline');
const { runCreatorJob } = require('../services/creatorPipeline');
const credits = require('../services/credits');

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
  const limit = 5;
  const offset = (page - 1) * limit;
  const category = (req.query.category || '').trim();

  try {
    const redis = await getRedisClient();
    // v5 cache namespace — bump whenever the schema or URL shape changes so
    // stale Redis entries are bypassed without a manual flush. (v5: curated
    // templates now expose captioned preview video_url + clean_frame_url.)
    const cacheKey = `ugc_templates_v5:${category || 'all'}:${page}`;
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

  const tplActor = template?.actor_name || 'a creator';
  const tplSetting = template?.setting || '';
  const tplSampleScript = template?.sample_script || '';
  const hasProduct = productName && productName.trim().length > 0;

  // Word budget tuned per duration. 5s clips don't fit the old 2.0/2.4
  // wps budget — the model would write 10 words and the safety-net trim
  // would chop the CTA off, leaving fragments like "I have been using
  // this for two days". Bumping to 2.4/2.8 wps for short clips gives
  // room for a proper 3-beat script (reaction → reason → soft CTA),
  // while 10s+ keeps the slower 2.0/2.4 cadence that feels natural.
  const targetSeconds = Math.min(15, Math.max(5, Number(requestedSeconds) || 10));
  const wpsTarget = targetSeconds <= 5 ? 2.4 : 2.0;
  const wpsMax    = targetSeconds <= 5 ? 2.8 : 2.4;
  const wordTarget = Math.round(targetSeconds * wpsTarget);
  const wordMax    = Math.round(targetSeconds * wpsMax);

  // Voice rules: punchy UGC creator. Excited, complete, confident. The
  // previous version banned excited adjectives and CTAs which forced the
  // model into stilted "personal essay" output — that's not how short
  // UGC reads. Gen Z punchy + a soft CTA is the right vibe.
  const sys = [
    "You write a short UGC ad script — what a Gen Z creator would actually say into their phone camera.",
    "Output ONE script ONLY. Plain text. No headings, no quotes, no stage directions, no parentheses, no labels, no asterisks, no emojis, no hashtags.",
    "",
    "VIBE:",
    "- Excited. Confident. Like you just discovered something great and have to tell a friend.",
    "- First-person. 'I love this', 'I'm obsessed', 'I cannot stop using it' — that energy.",
    "- Gen Z language is welcome: 'honestly', 'literally', 'lowkey', 'no but', 'okay so', 'for real', 'I am obsessed', 'this slaps', 'trust me'. Use 1-2 per script max — sprinkled, not stuffed.",
    "- Specific details land harder than generic praise. Mention a small concrete thing (the shade, the smell, the feel, a moment you noticed). But don't ban excited adjectives — 'so good', 'amazing', 'obsessed' all read as natural in this register.",
    "",
    "STRUCTURE:",
    `- For a ${targetSeconds}-second video: ${
      targetSeconds <= 5
        ? '2 to 3 SHORT complete sentences in a [reaction] → [reason / detail] → [soft CTA] shape.'
        : '3 to 4 sentences in a [hook / personal moment] → [reason / detail] → [soft CTA] shape.'
    }`,
    "- Soft CTAs are GOOD and expected. End with: 'get it', 'you need this', 'trust me', 'add to cart', 'do it', 'go grab one', 'just buy it'. NEVER use corporate phrases like 'shop now', 'click the link', 'link in bio', 'sponsored', 'limited time', 'don't miss out'.",
    "- COMPLETE SENTENCES ONLY. Every sentence must finish. The script MUST land — the last sentence is the CTA and it has to be there. Mid-thought fragments are WRONG output.",
    "",
    "EXAMPLES of the energy / length for a 5-second video (use as tone reference, NOT to copy):",
    "- 'This lip gloss is everything. The shade hits different. Get it.'",
    "- 'Lowkey obsessed with this protein. So clean and actually works. You need it.'",
    "- 'This serum literally changed my skin. I am not even kidding. Trust me, grab one.'",
    "",
    "EXAMPLES for a 10-second video:",
    "- 'Okay so I have been wearing this gloss every day for a week and the color is insane. Compliments nonstop. If you have been on the fence, just get it.'",
    "- 'This protein powder is literally the cleanest I have tried — mixes perfectly, tastes amazing, no bloat. Honestly, get it as soon as you can.'",
    "",
    `LENGTH IS A HARD CONSTRAINT. ${wordTarget} words is the sweet spot. ${wordMax} words absolute maximum. Count your words mentally before responding — overlong scripts make the TTS speed up and the lip-sync clips the ending.`,
  ].join('\n');

  const userPrompt = hasProduct
    ? [
        `Creator vibe: ${tplActor} filming casually in ${tplSetting || 'a clean phone-shot setting'}.`,
        tplSampleScript ? `Creator's normal voice (tone reference, do NOT copy verbatim): "${tplSampleScript}"` : '',
        `Product being featured: ${productName}`,
        productDescription ? `Why it's good (translate into excited natural reactions — don't recite this verbatim): ${productDescription}` : '',
        tone ? `Brand tone hint: ${tone}` : '',
        '',
        `Write a complete punchy UGC script for this product. ${
          targetSeconds <= 5
            ? '2-3 short sentences. Reaction → reason → soft CTA. End with something like "get it" or "you need this".'
            : '3-4 sentences. Hook → detail → CTA. End with a soft "get it" / "trust me" / "go grab one" line.'
        } The final sentence MUST be the CTA — never trail off into a fragment.`,
      ].filter(Boolean).join('\n')
    : [
        `Creator vibe: ${tplActor} filming casually in ${tplSetting || 'a clean phone-shot setting'}.`,
        tplSampleScript ? `Creator's normal voice (tone reference): "${tplSampleScript}"` : '',
        tone ? `Tone: ${tone}` : '',
        '',
        'Write what this person would casually say to their followers — a small personal moment, opinion, or thought. First-person, complete sentences, lands on a real ending. No product placement.',
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
    script = trimScriptToWordBudget(script, wordMax);
    return res.json({ success: true, data: { script } });
  } catch (err) {
    console.error('UGC script error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate script' });
  }
});

/**
 * Safety net for when the model overshoots the word budget.
 *
 * The old version sliced the FIRST `wordMax` words then trimmed to the
 * last sentence boundary inside that slice — which reliably chopped the
 * CTA (which sits at the end of the script) and left a half-formed
 * fragment like "I've been wearing this for two days." That's exactly
 * the "cut-short" output users were reporting.
 *
 * New approach: drop earlier sentences one at a time until the script
 * fits the word budget, preserving the LAST sentence (the CTA). If even
 * one sentence is over budget, return it as-is — the TTS will speed up
 * but the script stays a complete thought, which is what matters.
 */
function trimScriptToWordBudget(script, wordMax) {
  const words = script.split(/\s+/).filter(Boolean);
  if (words.length <= wordMax) return script;

  const sentences = (script.match(/[^.!?]+[.!?]+/g) || [])
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 1) return script.trim();

  let kept = [...sentences];
  while (
    kept.length > 1 &&
    kept.join(' ').split(/\s+/).filter(Boolean).length > wordMax
  ) {
    kept.shift();
  }
  return kept.join(' ').trim();
}

// ---------- Parse prompt (direct mode) ----------
//
// We used to classify composer attachments as product/inspiration/both via
// a GPT-4o-mini vision call. The inspiration upload affordance has been
// removed from both clients, so every attachment is now treated as a
// product image — the vision call is gone, saving a round-trip + cost.

router.post('/parse-prompt', async (req, res) => {
  const { prompt, attachments } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 6) {
    return res.status(400).json({ success: false, error: 'Prompt is too short' });
  }

  try {
    // The parser extracts three independent pieces of context from the
    // free-form prompt: the creator, the product, AND the action
    // (videoDescription). videoDescription is what we feed straight to
    // Kling 3.0 Pro as the action prompt, so it has to be vivid and
    // specific. If the user didn't describe the action in their prompt,
    // we synthesize a sensible default — the user can still edit it in
    // the Studio card before generating.
    //
    // CRITICAL: videoDescription must NOT use camera-aware language
    // ("looks at camera", "talks to camera", "in front of the mirror",
    // etc.). Kling reads those phrases literally and either renders a
    // visible camera/mirror in the frame or biases the shot toward an
    // unflattering webcam look. We want a fly-on-the-wall description
    // of what the creator is doing in their space — the model already
    // knows the output is a video, so framing the action as filmed
    // double-encodes it and breaks the result.
    const systemPrompt = [
      'You are a UGC video assistant. The user will give you a free-form prompt describing a video they want to create.',
      'The video may or may not involve a product. Extract structured fields from their prompt and return ONLY a JSON object — no prose, no markdown.',
      '',
      'Fields to extract:',
      '- creatorDescription: Physical appearance + setting of the person in the video (e.g. "20-year-old athletic woman in a modern gym"). If not specified, infer a reasonable creator. 1-2 sentences max.',
      '- productName: The product being advertised. Use empty string "" if no product is mentioned or the video is not about a product.',
      '- productDescription: What the product does / key selling points. Empty string if no product.',
      '- videoDescription: A concrete description of what the creator IS DOING in the scene — the action, the movement, the body language, the interaction with the product (if any). Describe it as if you were watching the moment happen naturally in front of you. One continuous shot (no cuts).',
      '   STRICT RULES for videoDescription:',
      '   - DO NOT use camera or recording language. NEVER write "to camera", "on camera", "at the camera", "for the viewer", "directly at us", "for the audience".',
      '   - DO NOT use mirror or reflection language. NEVER write "in front of the mirror", "looking in the mirror", "mirror selfie", "vanity mirror selfie".',
      '   - DO NOT describe the shot itself. NEVER write "the shot opens with", "the camera pans", "close-up of", "we see", "phone video".',
      '   - DO write what the creator does, where they look, what they touch, how they move, what their face does. Example: "She picks up the bottle, holds it close to her face, smells it, smiles slightly, then sets it down on the counter."',
      '   - 1-3 sentences. Specific, vivid, present-tense.',
      '- suggestedDuration: 5 or 10 seconds. Default 10. Use 5 only for very simple single-beat concepts.',
      '- includeProduct: boolean — true if the user mentioned a specific product to feature, false otherwise.',
      '',
      'Return: {"creatorDescription":"...","productName":"...","productDescription":"...","videoDescription":"...","suggestedDuration":10,"includeProduct":true}',
    ].join('\n');

    // All attachments are products now. We don't run a vision call —
    // we just echo the URLs back tagged as 'product' so the clients can
    // route them into the product slot.
    const attachmentList = Array.isArray(attachments)
      ? attachments
          .filter((a) => a && typeof a.url === 'string' && a.url.length > 0)
          .slice(0, 4)
          .map((a) => ({ url: a.url, kind: 'product' }))
      : [];

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

    // Uploading any image implies "I want a product in this video," even
    // when the prompt text itself doesn't name one.
    const hasProductAttachment = attachmentList.length > 0;

    const result = {
      creatorDescription: (parsed.creatorDescription || '').slice(0, 500),
      productName: (parsed.productName || '').slice(0, 200),
      productDescription: (parsed.productDescription || '').slice(0, 500),
      videoDescription: (parsed.videoDescription || '').slice(0, 1000),
      suggestedDuration,
      includeProduct:
        hasProductAttachment ||
        (parsed.includeProduct !== false && (parsed.productName || '').trim().length > 0),
      attachments: attachmentList,
    };

    if (attachmentList.length) {
      console.log(
        `[parse-prompt] ${attachmentList.length} attachment(s) routed to product`
      );
    }

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
    captionsEnabled,
    captionPreset,
    creatorEthnicity,
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

    // Captions default ON. The pipeline reads this off template_snapshot to
    // avoid a DB migration, same pattern we use for user_tweaks.
    const wantsCaptions = captionsEnabled !== false;
    const captionPresetSafe = typeof captionPreset === 'string' && captionPreset.length
      ? captionPreset.slice(0, 32)
      : null;

    // Creator ethnicity is only meaningful in direct mode (templates
    // already fix the creator's identity). Whitelist the allowed values
    // — anything else is dropped so the picker can't be used to inject
    // arbitrary prompt text.
    const ETHNICITY_WHITELIST = new Set(['Indian', 'Asian American', 'Asian']);
    const ethnicitySafe = typeof creatorEthnicity === 'string'
      && ETHNICITY_WHITELIST.has(creatorEthnicity.trim())
      ? creatorEthnicity.trim()
      : null;

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
        // Caption-free seed still. Present only on curated templates (whose
        // video_url is a captioned preview); the pipeline uses it as the
        // seed frame instead of extracting one from the captioned video.
        // NULL for history-reuse templates → pipeline falls back to frame
        // extraction. `?? null` so older rows without the column don't blow
        // up the snapshot.
        clean_frame_url: template.clean_frame_url ?? null,
        aspect_ratio: template.aspect_ratio,
        duration_seconds: template.duration_seconds,
        // Optional user-provided tweaks ("same person but on a beach…").
        // Read by the pipeline to relax the "keep scene identical" rule
        // in the Nano Banana seed image prompt while still locking the
        // template creator's face and identity.
        user_tweaks: cleanTweaks || null,
        captions_enabled: wantsCaptions,
        caption_preset: captionPresetSafe,
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
        captions_enabled: wantsCaptions,
        caption_preset: captionPresetSafe,
        // Direct-mode-only. Pipeline weaves this into the Nano Banana +
        // Kling prompts as "a good-looking <ethnicity> creator —".
        user_ethnicity: ethnicitySafe,
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

    // ---- Credit preflight ----
    // 5-second video costs 50 credits, 10-second video costs 100. We
    // check (not debit) here so we can return a clean 402 to the client
    // before the heavy work begins. The debit happens once the job row
    // is inserted — that way we have a stable jobId to use as the
    // ledger's ref_id (and we can refund against it on failure).
    //
    // The whole credit system is bypassed when `credits.isEnabled()`
    // returns false (default until RAZORPAY_KEY_ID is set), so iOS +
    // web clients keep generating videos for free during local dev.
    const enforceCredits = credits.isEnabled();
    let requiredCredits = 0;
    if (enforceCredits) {
      requiredCredits = credits.creditsForVideoDuration(job.video_duration);
      const currentBalance = await credits.getBalance(userId);
      if (currentBalance < requiredCredits) {
        return res.status(402).json({
          success: false,
          error: 'insufficient_credits',
          data: {
            balance: currentBalance,
            required: requiredCredits,
            shortfall: requiredCredits - currentBalance,
          },
        });
      }
    }

    console.log(
      `[ugc:new] user=${userId.slice(0,8)} tpl=${templateId ? templateId.slice(0,8) : 'direct'} ` +
      `mode=single-shot${isDirectMode ? ' (direct)' : ''} ` +
      `inspiration=${job.inspiration_image_url ? 'yes' : 'no'} ` +
      `product_image=${productImageUrl ? 'yes' : 'no'} ` +
      `video_dur=${job.video_duration || 'n/a'} ` +
      `credits=${enforceCredits ? requiredCredits : 'off'}`
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

    // Debit credits now that we have a stable jobId for the ledger row.
    // If this trips a race condition (concurrent jobs draining the
    // balance), the SQL CHECK constraint fires and we surface 402.
    // Skipped entirely when credits are disabled (no RAZORPAY_KEY_ID).
    if (enforceCredits) {
      try {
        await credits.spendForJob(userId, requiredCredits, inserted.id);
      } catch (spendErr) {
        if (spendErr.code === 'INSUFFICIENT_CREDITS') {
          // Roll the unused job row back so it doesn't clutter history.
          await supabase.from('ugc_jobs').delete().eq('id', inserted.id);
          return res.status(402).json({
            success: false,
            error: 'insufficient_credits',
            data: { required: requiredCredits },
          });
        }
        throw spendErr;
      }
    }

    // Fire-and-forget the pipeline. Errors are captured into the job row
    // and refunded by the pipeline itself when it flips to 'failed'.
    // `creditCost: 0` tells the pipeline there's nothing to refund.
    setImmediate(() => {
      runUGCJob(inserted, { creditCost: enforceCredits ? requiredCredits : 0 })
        .catch((e) => console.error('Background runUGCJob error:', e));
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

/**
 * Reuse a completed UGC job as a template.
 *
 * Same idea as `/creator/jobs/:id/promote-to-template` but sourced from
 * a finished ad instead of a standalone creator clip. The user taps
 * "Use" on a history item — we mint a hidden ugc_templates row pointing
 * at the job's output_video_url, and the existing template pipeline
 * does the rest (extract seed frame, integrate the new product, etc.).
 *
 * Idempotent on a per-job basis: if the same job has already been
 * promoted, returns the same template instead of creating a duplicate.
 */
router.post('/jobs/:id/use', async (req, res) => {
  const userId = req.user.id;
  try {
    const { data: job, error: jobErr } = await supabase
      .from('ugc_jobs')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();
    if (jobErr || !job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    if (job.status !== 'completed' || !job.output_video_url) {
      return res.status(400).json({
        success: false,
        error: 'Video is not ready to reuse yet',
      });
    }

    // Idempotency — if a template was already minted for this job, return it.
    const reuseTag = `reuse:${job.id}`;
    {
      const { data: existing } = await supabase
        .from('ugc_templates')
        .select('*')
        .contains('tags', [reuseTag])
        .eq('owner_user_id', userId)
        .maybeSingle();
      if (existing) return res.json({ success: true, data: existing });
    }

    const snapshot = job.template_snapshot || {};
    const actorName = snapshot.actor_name || snapshot.name || 'Your creator';
    const setting = snapshot.setting || 'Generated from your previous video';

    const tpl = {
      id: uuidv4(),
      name: job.product_name ? `${actorName} · ${job.product_name}` : actorName,
      actor_name: actorName,
      actor_avatar_url: job.output_thumbnail_url || null,
      description: (job.product_name || job.script || '').slice(0, 240),
      setting,
      video_url: job.output_video_url,
      thumbnail_url: job.output_thumbnail_url || job.output_video_url,
      // The previous script is a useful starting point — the user can
      // rewrite or keep it. AI script rewrites still work normally.
      sample_script: job.script || 'Honestly, I have been obsessed with this and I had to tell you.',
      aspect_ratio: snapshot.aspect_ratio || '9:16',
      duration_seconds: job.video_duration || snapshot.duration_seconds || 10,
      tags: ['custom', reuseTag],
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

    return res.json({ success: true, data: inserted });
  } catch (err) {
    console.error('UGC job reuse error:', err);
    return res.status(500).json({ success: false, error: 'Failed to reuse video' });
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
  const subdir = kind === 'inspiration' ? 'inspirations'
              : kind === 'attachment' ? 'attachments'
              : 'products';
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

/**
 * Unified attachment upload used by the prompt composer. We don't know yet
 * whether the image is a product, an inspiration, or both — that's decided
 * by /parse-prompt via GPT-4o-mini vision classification once all the
 * uploads finish. The returned signed URL is what the client passes back
 * to /parse-prompt as `attachments: [{ url }]`.
 */
router.post('/upload-attachment', async (req, res) => {
  const { contentType, base64 } = req.body || {};
  if (!base64) {
    return res.status(400).json({ success: false, error: 'base64 image required' });
  }
  try {
    const url = await uploadImageBase64({
      kind: 'attachment',
      userId: req.user.id,
      contentType,
      base64,
    });
    return res.json({ success: true, data: { url } });
  } catch (err) {
    console.error('UGC attachment upload error:', err);
    return res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

module.exports = router;
