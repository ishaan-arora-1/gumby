const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { openai, DEFAULT_MODEL } = require('../config/openai');
const { getRedisClient } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const authMiddleware = require('../middleware/auth');
const { fetchPreferences, savePreferences, mergeAnswers } = require('./user');

const IMAGE_BUCKET = 'chat-images';
const IMAGE_MODEL = 'gpt-image-1';

router.use(authMiddleware);

const QUESTIONS_MARKER = '__QUESTIONS__\n';

const ASK_QUESTIONS_TOOL = {
  type: 'function',
  function: {
    name: 'ask_clarifying_questions',
    description:
      "Ask the user 3-4 highly specific, decision-driving clarifying questions before producing a 'build' artifact (post package, campaign, brand kit, content plan, ad set, brief, etc.). " +
      "RULES: " +
      "(1) NEVER call this tool if the same question was already asked and answered earlier in the conversation, OR if the answer is already present in the user's known preferences supplied in the system prompt. " +
      "(2) Questions must be CONCRETE and decision-driving — about audience persona, platform, brand voice tone, content pillars, posting cadence, visual style, primary CTA, success metric, length/format. NEVER vague openers like 'tell me more' or 'what do you want'. " +
      "(3) Each question must have 4-5 concrete options (no generic 'Yes/No'); each option label is a short noun phrase, and every option includes a one-line `description` that gives a vivid example. Include an 'Other' option last when it fits; users can also type a custom answer in a separate field. " +
      "(4) Every question is single-choice only (exactly one option per question). " +
      "(5) Tailor options to the specific brand/topic the user mentioned, not generic placeholders.",
    parameters: {
      type: 'object',
      properties: {
        intro: {
          type: 'string',
          description:
            "One short friendly sentence shown above the questions. Example: 'Love it — a few quick picks to nail the direction.'",
        },
        questions: {
          type: 'array',
          minItems: 3,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'The specific decision-driving question.' },
              type: {
                type: 'string',
                enum: ['single'],
                description: 'Always single — user picks exactly one option per question.',
              },
              options: {
                type: 'array',
                minItems: 4,
                maxItems: 5,
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: 'Short option label (2-4 words).' },
                    description: {
                      type: 'string',
                      description: 'Required one-line concrete example of this option.',
                    },
                  },
                  required: ['label', 'description'],
                },
              },
            },
            required: ['prompt', 'type', 'options'],
          },
        },
      },
      required: ['intro', 'questions'],
    },
  },
};

const GENERATE_AD_IMAGE_TOOL = {
  type: 'function',
  function: {
    name: 'generate_ad_image',
    description:
      'Generate a finished social-media advertisement / Instagram post / story / poster / banner image for the user. ' +
      'WHEN to call: the user asks for any visual deliverable (post, ad, image, creative, banner, poster, mockup, story slide, reel cover, carousel slide, thumbnail, etc.) AND there is enough direction to render it ' +
      '(either gathered from the conversation, the user\'s answers, KNOWN USER PREFERENCES, or attached reference images). ' +
      'NEVER ask another clarifying-questions round if the user has just answered one — proceed to generation. ' +
      'IMPORTANT: Do NOT write any captions, hashtags, or post copy. Just produce the image. The conversational follow-up (describing the vibe and offering a caption) is handled separately. ' +
      'PROMPT REQUIREMENTS: write `prompt` as a single dense visual brief that enumerates EVERY concrete detail: ' +
      'subject(s), pose, scene/background, materials, lighting, time of day, camera angle, depth of field, color palette (with hex when known), ' +
      'mood, brand aesthetic, on-image typography (exact text strings, font style, position, size, color), logo placement, ' +
      'call-to-action text, framing/safe area for the requested aspect, and any product/brand specifics from the conversation. ' +
      'Repeat the user\'s explicit details verbatim. Do NOT invent unrequested elements, do NOT change the product, brand, or text the user specified. ' +
      'If the user attached reference images, the result MUST visually match the referenced subject/product faithfully (same product, same colors, same shape).',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Highly detailed visual brief (60-200 words). Must literally include every concrete detail the user specified — product, colors, copy, layout — without altering them. Do NOT include captions or hashtags here, only visual instructions.',
        },
        use_attached_as_reference: {
          type: 'boolean',
          description:
            'Set true when user-attached images in this turn are the actual product/subject that must appear in the generated image.',
        },
      },
      required: ['prompt'],
    },
  },
};

const IMAGE_SIZE_BY_ASPECT = {
  square: '1024x1024',
  portrait: '1024x1536',
  landscape: '1536x1024',
};

// User-facing aspect ratios chosen via the iOS composer.
// "post" = Instagram feed square, "story" = full-screen 9:16 Story.
const USER_ASPECT_TO_INTERNAL = {
  post: 'square',
  story: 'portrait',
};

async function fetchAsOpenAIFile(url, index) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch reference image: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const ct = resp.headers.get('content-type') || 'image/png';
  const ext = ct.includes('jpeg') ? 'jpg' : ct.includes('webp') ? 'webp' : 'png';
  return await OpenAI.toFile(buf, `reference-${index}.${ext}`, { type: ct });
}

async function runImageGeneration({ prompt, aspect, referenceUrls }) {
  const size = IMAGE_SIZE_BY_ASPECT[aspect] || IMAGE_SIZE_BY_ASPECT.square;
  const strictPrompt =
    `Render EXACTLY the following brief without adding, removing, or altering any specified detail. ` +
    `Stay faithful to the product, brand, colors, and on-image text the user specified. ` +
    `Do not invent elements that were not requested.\n\n${prompt}`;

  if (referenceUrls && referenceUrls.length > 0) {
    const refs = [];
    for (let i = 0; i < Math.min(referenceUrls.length, 4); i++) {
      try {
        refs.push(await fetchAsOpenAIFile(referenceUrls[i], i));
      } catch (e) {
        console.error('Reference download failed:', e?.message || e);
      }
    }
    if (refs.length > 0) {
      const result = await openai.images.edit({
        model: IMAGE_MODEL,
        image: refs.length === 1 ? refs[0] : refs,
        prompt: strictPrompt,
        size,
      });
      return result.data?.[0]?.b64_json;
    }
  }

  const result = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt: strictPrompt,
    size,
    quality: 'high',
    n: 1,
  });
  return result.data?.[0]?.b64_json;
}

async function uploadGeneratedImage({ b64, conversationId }) {
  const buffer = Buffer.from(b64, 'base64');
  const path = `generated/${conversationId}/${uuidv4()}.png`;
  const { error: upErr } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, buffer, { contentType: 'image/png', upsert: false });
  if (upErr) throw upErr;

  // Prefer a long-lived signed URL so display does not depend on bucket public-read policy.
  const { data: signed, error: signErr } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (!signErr && signed?.signedUrl) {
    console.log('Generated image (signed):', signed.signedUrl);
    return signed.signedUrl;
  }

  const { data: pub } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  console.log('Generated image (public):', pub.publicUrl);
  return pub.publicUrl;
}

function parseStoredQuestions(content) {
  if (typeof content !== 'string' || !content.startsWith(QUESTIONS_MARKER)) return null;
  try {
    return JSON.parse(content.slice(QUESTIONS_MARKER.length));
  } catch {
    return null;
  }
}

function historyMessageToOpenAI(m) {
  const parsed = parseStoredQuestions(m.content);
  if (parsed) {
    const summary = parsed.questions
      .map((q, i) => {
        const opts = (q.options || [])
          .map((o) => o.label)
          .join(', ');
        return `Q${i + 1} (${q.type}): ${q.prompt}\n   Options offered: ${opts}`;
      })
      .join('\n');
    return {
      role: 'assistant',
      content:
        `I previously asked the user these clarifying questions (do NOT re-ask them):\n` +
        `${parsed.intro}\n${summary}`,
    };
  }
  return {
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content || '',
  };
}

function formatPreferencesForPrompt(prefs) {
  const items = Array.isArray(prefs?.items) ? prefs.items : [];
  if (items.length === 0) return '';
  const lines = items.map((it) => `- ${it.question}: ${it.answer}`);
  return (
    '\n\nKNOWN USER PREFERENCES (carried over from past conversations — treat as authoritative; ' +
    "do NOT call ask_clarifying_questions about anything already covered here, just use these values):\n" +
    lines.join('\n')
  );
}

function lastAssistantWasQuestions(history) {
  const reversed = [...(history || [])].reverse();
  for (const m of reversed) {
    if (m.role === 'assistant') {
      return parseStoredQuestions(m.content) != null;
    }
  }
  return false;
}

function extractAnswersFromUserMessage(text) {
  // The iOS client sends answers as: "Here are my answers:\n• Question — A1, A2\n..."
  if (typeof text !== 'string') return [];
  if (!/here are my answers/i.test(text)) return [];
  const lines = text.split('\n').slice(1);
  const out = [];
  for (const line of lines) {
    const m = line.match(/^[•\-\*]\s*(.+?)\s+[—–-]\s+(.+?)\s*$/);
    if (m) {
      const q = m[1].trim();
      const a = m[2].trim();
      if (q && a && a !== '(skipped)') out.push({ question: q, answer: a });
    }
  }
  return out;
}

router.post('/send', async (req, res) => {
  const { conversationId, message, imageUrls, mode, aspectRatio } = req.body;
  const userId = req.user.id;
  const userAspect = USER_ASPECT_TO_INTERNAL[aspectRatio] || null;

  if (!message && (!imageUrls || imageUrls.length === 0)) {
    return res.status(400).json({ success: false, error: 'Message or images required' });
  }

  try {
    let convId = conversationId;

    if (!convId) {
      const title = message ? message.substring(0, 50) : 'Image conversation';
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({ id: uuidv4(), user_id: userId, title })
        .select()
        .single();

      if (convError) throw convError;
      convId = conv.id;
    }

    const userMsgId = uuidv4();
    await supabase.from('messages').insert({
      id: userMsgId,
      conversation_id: convId,
      role: 'user',
      content: message || '',
      image_urls: imageUrls || [],
    });

    // Auto-save any answers the user just submitted into their persistent preferences
    const submittedAnswers = extractAnswersFromUserMessage(message);
    if (submittedAnswers.length > 0) {
      try {
        const existing = await fetchPreferences(userId);
        const merged = mergeAnswers(existing, submittedAnswers);
        await savePreferences(userId, merged);
      } catch (e) {
        console.error('Save inline prefs error:', e?.message || e);
      }
    }

    const userPrefs = await fetchPreferences(userId);
    const prefsBlock = formatPreferencesForPrompt(userPrefs);

    const buildAddon =
      "\n\nRESPONSE FORMAT (STRICT — failure to follow this is a bug):\n" +
      "• Write in GitHub-flavored Markdown.\n" +
      "• Every reply MUST contain real line breaks. NEVER return a single block of text.\n" +
      "• Put a BLANK LINE (\\n\\n) between every paragraph, before and after every heading, and before and after every bullet list. Keep paragraphs to 1–3 sentences.\n" +
      "• Use ### for short section headings when the answer has multiple parts. Use **bold** sparingly for labels.\n" +
      "• Use - bullet lists (each on its own line) for any list of 2 or more items.\n" +
      "• Warm, conversational tone — talk WITH the user, not AT them.\n" +
      "EXAMPLE of well-formatted reply:\n" +
      "```\n" +
      "Here is the direction I would take.\n\n" +
      "### Vibe\n\n" +
      "Soft sunset palette with airy negative space — feels premium without trying too hard.\n\n" +
      "### What is on the post\n\n" +
      "- A single hero shot of the product on linen.\n" +
      "- A short headline in the upper third.\n" +
      "- A quiet logo lockup bottom-right.\n\n" +
      "Want me to push it warmer, or try a punchier theme?\n" +
      "```\n" +
      'ABSOLUTE STYLE RULES: NEVER use emojis anywhere in your replies. NEVER produce hashtags unless the user explicitly asks for them. Do not append hashtag blocks to messages. Do not write social-media captions unless the user explicitly asks for a caption.\n' +
      "\n\nMODE HINT vs USER INTENT: The user's selected mode (Ideas / Captions / Posts) is only a HINT used when the user's intent is ambiguous. " +
      "If the user's prompt explicitly asks for something specific (e.g. 'generate a post / image / ad', 'just give me captions', 'brainstorm ideas', 'design a poster'), ALWAYS follow the user's explicit request — even if it contradicts the selected mode. " +
      "Only fall back to the selected mode when the user's prompt does not explicitly state what kind of output they want. " +
      "Mode meanings when no explicit intent is given: " +
      "Ideas → brainstorm angles, hooks, campaign concepts (text only, no hashtags). " +
      "Captions → only when the user explicitly asks for a caption, write one strong caption (no emojis). " +
      "Posts → produce a finished Instagram-style image via `generate_ad_image`.\n\n" +
      'For any visual deliverable (post, ad, image, creative, banner, poster, mockup, story slide, reel cover, carousel slide, thumbnail) you MUST call the `generate_ad_image` tool — never describe what the image would look like in text instead. ' +
      'Make the `prompt` an exhaustive visual brief that includes every concrete detail (product, colors with hex when known, on-image text strings, layout, lighting, mood, brand voice). NEVER alter, drop, or invent product names / on-image text the user specified. ' +
      'When you call `generate_ad_image`, do NOT also write any text in the same turn — the system will handle the conversational follow-up after the image is rendered. ' +
      "If the user attached images this turn, set `use_attached_as_reference: true` and ensure the generated image preserves the same product, packaging, colors, and shape.\n\n" +
      "When the user asks you to BUILD, CREATE, MAKE, DESIGN, LAUNCH, or DRAFT something concrete AND key direction is missing (audience, brand voice, primary platform, content pillars, visual tone, success metric, etc.), call the `ask_clarifying_questions` tool BEFORE generating an image. " +
      "HARD RULES on when NOT to call `ask_clarifying_questions`: " +
      "(a) The conversation already contains the user's answers to clarifying questions — proceed directly using them (call `generate_ad_image` if a visual was requested). " +
      "(b) The KNOWN USER PREFERENCES above already cover the missing direction — proceed directly using them. " +
      "(c) The user is greeting, brainstorming, asking a factual question, or iterating on existing work. " +
      "(d) You already asked questions earlier in this conversation. " +
      "If you call the questions tool, the questions MUST be specific and brand-tailored (not generic) and each option MUST include a vivid one-line description.";
    const systemPrompts = {
      ideas:
        'You are a creative social media strategist focused on brainstorming. Generate innovative content ideas, campaign concepts, and trending angle suggestions. Default output is text only — only generate images if the user explicitly asks for one.' +
        buildAddon,
      captions:
        'You are a social media caption expert. Help create engaging, platform-optimized captions with relevant hashtags. Default output is text only — only generate images if the user explicitly asks for one.' +
        buildAddon,
      posts:
        'You are a social media post designer focused on producing finished Instagram-style ad images. Default behavior: when the user asks for a post or visual, immediately call `generate_ad_image`. Only respond with text-only ideas/captions if the user explicitly asks for that instead of a visual.' +
        buildAddon,
      // Backwards-compat: older clients may still send "build".
      build:
        'You are a social media post designer focused on producing finished Instagram-style ad images. Default behavior: when the user asks for a post or visual, immediately call `generate_ad_image`. Only respond with text-only ideas/captions if the user explicitly asks for that instead of a visual.' +
        buildAddon,
    };

    const { data: history } = await supabase
      .from('messages')
      .select('role, content, image_urls')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20);

    const priorMessages = (history || []).slice(0, -1).map(historyMessageToOpenAI);

    const userContent = [];
    const userText = message || 'Describe this image for social media.';
    userContent.push({ type: 'text', text: userText });
    if (imageUrls && imageUrls.length > 0) {
      for (const url of imageUrls) {
        userContent.push({ type: 'image_url', image_url: { url } });
      }
    }

    const baseSystem = systemPrompts[mode] || systemPrompts.ideas;
    const fullSystem = baseSystem + prefsBlock;

    const messagesForOpenAI = [
      { role: 'system', content: fullSystem },
      ...priorMessages,
      { role: 'user', content: userContent },
    ];

    // If the last assistant turn was a questions card (i.e. user is now answering),
    // force a text response so we never re-ask.
    const forceTextResponse =
      lastAssistantWasQuestions(history || []) || submittedAnswers.length > 0;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'start', conversationId: convId })}\n\n`);

    const stream = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: messagesForOpenAI,
      stream: true,
      tools: [ASK_QUESTIONS_TOOL, GENERATE_AD_IMAGE_TOOL],
      tool_choice: forceTextResponse ? 'auto' : 'auto',
    });

    let fullResponse = '';
    // Accumulate tool-call args (streamed in fragments)
    const toolCallAcc = {}; // index -> { name, argsBuffer }

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        fullResponse += delta.content;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: delta.content })}\n\n`);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallAcc[idx]) toolCallAcc[idx] = { name: '', argsBuffer: '' };
          if (tc.function?.name) toolCallAcc[idx].name = tc.function.name;
          if (tc.function?.arguments) toolCallAcc[idx].argsBuffer += tc.function.arguments;
        }
      }
    }

    // Detect tool calls (clarifying-questions and/or image-generation)
    let questionsPayload = null;
    let imageArgs = null;
    for (const idx of Object.keys(toolCallAcc)) {
      const call = toolCallAcc[idx];
      if (!call.argsBuffer) continue;
      if (call.name === 'ask_clarifying_questions') {
        try {
          questionsPayload = JSON.parse(call.argsBuffer);
        } catch (e) {
          console.error('Failed to parse questions tool args:', e, call.argsBuffer);
        }
      } else if (call.name === 'generate_ad_image') {
        try {
          imageArgs = JSON.parse(call.argsBuffer);
        } catch (e) {
          console.error('Failed to parse image tool args:', e, call.argsBuffer);
        }
      }
    }

    const assistantMsgId = uuidv4();
    let storedContent = fullResponse;
    let storedImageUrls = [];

    if (questionsPayload) {
      storedContent = QUESTIONS_MARKER + JSON.stringify(questionsPayload);
      res.write(
        `data: ${JSON.stringify({
          type: 'questions',
          messageId: assistantMsgId,
          payload: questionsPayload,
        })}\n\n`
      );
    } else if (imageArgs && imageArgs.prompt) {
      // Discard any pre-image text the model may have written — the rule is that
      // image turns produce ONLY the image, then a fresh conversational follow-up.
      fullResponse = '';
      res.write(`data: ${JSON.stringify({ type: 'image_status', text: 'starting' })}\n\n`);

      try {
        const referenceUrls = imageArgs.use_attached_as_reference && Array.isArray(imageUrls) && imageUrls.length > 0
          ? imageUrls
          : [];
        const chosenAspect = userAspect || 'square';
        const b64 = await runImageGeneration({
          prompt: imageArgs.prompt,
          aspect: chosenAspect,
          referenceUrls,
        });
        if (!b64) throw new Error('Image generation returned no data');
        const publicUrl = await uploadGeneratedImage({ b64, conversationId: convId });
        storedImageUrls = [publicUrl];
        res.write(
          `data: ${JSON.stringify({
            type: 'image',
            url: publicUrl,
            messageId: assistantMsgId,
          })}\n\n`
        );

        // Stream a short, conversational follow-up message describing the vibe of
        // the image we just rendered and offering options (caption, different
        // theme, tweaks). No emojis, no hashtags, no captions in this message.
        const followupSystem =
          "You are Gumby, a warm marketing copilot. The user just received a freshly generated image.\n\n" +
          "Write a short conversational message structured EXACTLY like this (with REAL blank lines between every paragraph):\n\n" +
          "Paragraph 1: one sentence describing the overall vibe / aesthetic of the image you just produced.\n\n" +
          "Paragraph 2: one or two sentences on what the image represents and how it lines up with what the user asked for.\n\n" +
          "Paragraph 3: a closing question — ask whether they would like a caption to go with this post, or whether they would prefer a different theme / variation. Offer to tweak it.\n\n" +
          "ABSOLUTE RULES:\n" +
          "- Use Markdown with a BLANK LINE between every paragraph. Never return a single block of text.\n" +
          "- Do NOT write a caption.\n" +
          "- Do NOT include hashtags.\n" +
          "- Do NOT use emojis.\n" +
          "- Speak as the designer of the image, in first person.\n" +
          "- Keep the entire reply under 90 words.";

        const followupMessages = [
          { role: 'system', content: followupSystem },
          {
            role: 'user',
            content:
              `User request: ${message || '(image only)'}\n\n` +
              `Visual brief used: ${imageArgs.prompt}\n\n` +
              `Aspect: ${chosenAspect === 'portrait' ? 'Instagram Story (9:16)' : 'Instagram Post (1:1)'}\n\n` +
              `Now write the conversational follow-up.`,
          },
        ];

        const followStream = await openai.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: followupMessages,
          stream: true,
        });
        for await (const fc of followStream) {
          const t = fc.choices?.[0]?.delta?.content;
          if (t) {
            fullResponse += t;
            res.write(`data: ${JSON.stringify({ type: 'chunk', text: t })}\n\n`);
          }
        }
        storedContent = fullResponse;
      } catch (genErr) {
        console.error('Image generation error:', genErr?.message || genErr);
        const friendly =
          'Something went sideways while generating that image. Want me to try again, or tweak the direction first?';
        fullResponse = friendly;
        storedContent = fullResponse;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: friendly })}\n\n`);
      }
    }

    await supabase.from('messages').insert({
      id: assistantMsgId,
      conversation_id: convId,
      role: 'assistant',
      content: storedContent,
      image_urls: storedImageUrls,
    });

    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        messageId: assistantMsgId,
        conversationId: convId,
      })}\n\n`
    );
    res.end();

    try {
      const redis = await getRedisClient();
      for (let p = 1; p <= 10; p++) {
        await redis.del(`chat_history:${userId}:${p}`);
      }
    } catch {}
  } catch (err) {
    console.error('Chat send error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Failed to process message' });
    }
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    res.end();
  }
});

router.get('/history', async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const redis = await getRedisClient();
    const cacheKey = `chat_history:${userId}:${page}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const { data: conversations, error, count } = await supabase
      .from('conversations')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const enriched = await Promise.all(
      (conversations || []).map(async (conv) => {
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('content')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return { ...conv, last_message: lastMsg?.content || '' };
      })
    );

    const response = {
      success: true,
      data: enriched,
      page,
      total_pages: Math.ceil((count || 0) / limit),
      total_count: count || 0,
    };

    await redis.setEx(cacheKey, 300, JSON.stringify(response));
    return res.json(response);
  } catch (err) {
    console.error('History error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

router.get('/:id/messages', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!conv) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const { data: messages, error, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return res.json({
      success: true,
      data: messages,
      page,
      total_pages: Math.ceil((count || 0) / limit),
      total_count: count || 0,
    });
  } catch (err) {
    console.error('Messages error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!conv) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    await supabase.from('messages').delete().eq('conversation_id', id);
    await supabase.from('conversations').delete().eq('id', id);

    try {
      const redis = await getRedisClient();
      for (let p = 1; p <= 10; p++) {
        await redis.del(`chat_history:${userId}:${p}`);
      }
    } catch {}

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete conversation error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete conversation' });
  }
});

module.exports = router;
