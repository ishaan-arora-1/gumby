const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { openai, DEFAULT_MODEL } = require('../config/openai');
const { getRedisClient } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const { fetchPreferences, savePreferences, mergeAnswers } = require('./user');

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
  const { conversationId, message, imageUrls, mode } = req.body;
  const userId = req.user.id;

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
      '\n\nRESPONSE FORMAT: Use GitHub-flavored Markdown for every reply. Use ## or ### for section headings, short bullet lists where helpful, **bold** for labels or key phrases, and blank lines between sections. Keep paragraphs concise.' +
      "\n\nWhen the user asks you to BUILD, CREATE, MAKE, DESIGN, LAUNCH, or DRAFT something concrete (a website, post package, campaign, brand kit, content plan, ad set, brief, etc.), AND key direction is missing (audience, brand voice, primary platform, content pillars, visual tone, success metric, etc.), you MUST call the `ask_clarifying_questions` tool instead of replying in text. " +
      "HARD RULES on when NOT to call the tool: " +
      "(a) The conversation already contains the user's answers to clarifying questions — proceed directly using them. " +
      "(b) The KNOWN USER PREFERENCES above already cover the missing direction — proceed directly using them. " +
      "(c) The user is greeting, brainstorming, asking a factual question, or iterating on existing work. " +
      "(d) You already asked questions earlier in this conversation. " +
      "If you call the tool, the questions MUST be specific and brand-tailored (not generic) and each option MUST include a vivid one-line description.";
    const systemPrompts = {
      captions:
        'You are a social media caption expert. Help create engaging, platform-optimized captions with relevant hashtags.' +
        buildAddon,
      ideas:
        'You are a creative social media strategist. Generate innovative content ideas, campaign concepts, and trending topic suggestions.' +
        buildAddon,
      build:
        'You are a social media content builder. Help create complete post packages including copy, hashtags, posting schedule, and content strategy.' +
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

    const baseSystem = systemPrompts[mode] || systemPrompts.captions;
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

    res.write(`data: ${JSON.stringify({ type: 'start', conversationId: convId })}\n\n`);

    const stream = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: messagesForOpenAI,
      stream: true,
      tools: [ASK_QUESTIONS_TOOL],
      tool_choice: forceTextResponse ? 'none' : 'auto',
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

    // Detect a clarifying-questions tool call
    let questionsPayload = null;
    for (const idx of Object.keys(toolCallAcc)) {
      const call = toolCallAcc[idx];
      if (call.name === 'ask_clarifying_questions' && call.argsBuffer) {
        try {
          questionsPayload = JSON.parse(call.argsBuffer);
        } catch (e) {
          console.error('Failed to parse tool args:', e, call.argsBuffer);
        }
      }
    }

    const assistantMsgId = uuidv4();
    let storedContent = fullResponse;

    if (questionsPayload) {
      storedContent = QUESTIONS_MARKER + JSON.stringify(questionsPayload);
      res.write(
        `data: ${JSON.stringify({
          type: 'questions',
          messageId: assistantMsgId,
          payload: questionsPayload,
        })}\n\n`
      );
    }

    await supabase.from('messages').insert({
      id: assistantMsgId,
      conversation_id: convId,
      role: 'assistant',
      content: storedContent,
      image_urls: [],
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
