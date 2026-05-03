const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { getRedisClient } = require('../config/redis');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/models', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const redis = await getRedisClient();
    const cacheKey = `models:${page}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const { data: models, error, count } = await supabase
      .from('models')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const response = {
      success: true,
      data: models,
      page,
      total_pages: Math.ceil((count || 0) / limit),
      total_count: count || 0,
    };

    await redis.setEx(cacheKey, 600, JSON.stringify(response));
    return res.json(response);
  } catch (err) {
    console.error('Models error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch models' });
  }
});

router.get('/moodboards', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const redis = await getRedisClient();
    const cacheKey = `moodboards:${page}`;
    const cached = await redis.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    const { data: moodboards, error, count } = await supabase
      .from('moodboards')
      .select('*', { count: 'exact' })
      .order('title', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const response = {
      success: true,
      data: moodboards,
      page,
      total_pages: Math.ceil((count || 0) / limit),
      total_count: count || 0,
    };

    await redis.setEx(cacheKey, 600, JSON.stringify(response));
    return res.json(response);
  } catch (err) {
    console.error('Moodboards error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch moodboards' });
  }
});

module.exports = router;
