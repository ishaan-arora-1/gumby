const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const userId = req.user.id;
  const { month, year } = req.query;

  if (!month || !year) {
    return res.status(400).json({ success: false, error: 'Month and year are required' });
  }

  try {
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    const { data: posts, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date', { ascending: true });

    if (error) throw error;

    return res.json({ success: true, data: posts });
  } catch (err) {
    console.error('Calendar fetch error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch posts' });
  }
});

router.post('/', async (req, res) => {
  const userId = req.user.id;
  const { content, imageUrls, scheduledDate, platform } = req.body;

  if (!content || !scheduledDate || !platform) {
    return res.status(400).json({ success: false, error: 'Content, scheduled date, and platform are required' });
  }

  try {
    const { data: post, error } = await supabase
      .from('posts')
      .insert({
        id: uuidv4(),
        user_id: userId,
        content,
        image_urls: imageUrls || [],
        scheduled_date: scheduledDate,
        platform,
        status: 'planned',
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ success: true, data: post });
  } catch (err) {
    console.error('Create post error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create post' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const updates = req.body;

  try {
    const { data: existing } = await supabase
      .from('posts')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const allowedFields = ['content', 'image_urls', 'scheduled_date', 'platform', 'status'];
    const sanitized = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) sanitized[key] = updates[key];
    }

    const { data: post, error } = await supabase
      .from('posts')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ success: true, data: post });
  } catch (err) {
    console.error('Update post error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update post' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const { data: existing } = await supabase
      .from('posts')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) throw error;

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete post error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete post' });
  }
});

module.exports = router;
