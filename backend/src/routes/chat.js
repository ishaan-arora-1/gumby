const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { getModel } = require('../config/gemini');
const { getRedisClient } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

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

    const systemPrompts = {
      captions: 'You are a social media caption expert. Help create engaging, platform-optimized captions with relevant hashtags.',
      ideas: 'You are a creative social media strategist. Generate innovative content ideas, campaign concepts, and trending topic suggestions.',
      build: 'You are a social media content builder. Help create complete post packages including copy, hashtags, posting schedule, and content strategy.',
    };

    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(20);

    const chatHistory = (history || []).map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    const model = getModel();
    const chat = model.startChat({
      history: chatHistory.slice(0, -1),
      systemInstruction: systemPrompts[mode] || systemPrompts.captions,
    });

    const parts = [{ text: message || 'Describe this image for social media.' }];

    if (imageUrls && imageUrls.length > 0) {
      for (const url of imageUrls) {
        try {
          const response = await fetch(url);
          const buffer = await response.arrayBuffer();
          const base64 = Buffer.from(buffer).toString('base64');
          const mimeType = response.headers.get('content-type') || 'image/jpeg';
          parts.push({ inlineData: { data: base64, mimeType } });
        } catch (imgErr) {
          console.error('Failed to fetch image:', imgErr);
        }
      }
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: ${JSON.stringify({ type: 'start', conversationId: convId })}\n\n`);

    const result = await chat.sendMessageStream(parts);
    let fullResponse = '';

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
      }
    }

    const assistantMsgId = uuidv4();
    await supabase.from('messages').insert({
      id: assistantMsgId,
      conversation_id: convId,
      role: 'assistant',
      content: fullResponse,
      image_urls: [],
    });

    res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMsgId, conversationId: convId })}\n\n`);
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
