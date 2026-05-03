const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const type = req.query.type;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('saved_assets')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (type && type !== 'all') {
      query = query.eq('asset_type', type);
    }

    const { data: assets, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    return res.json({
      success: true,
      data: assets,
      page,
      total_pages: Math.ceil((count || 0) / limit),
      total_count: count || 0,
    });
  } catch (err) {
    console.error('Library fetch error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch library' });
  }
});

router.post('/', async (req, res) => {
  const userId = req.user.id;
  const { assetType, assetId, assetUrl } = req.body;

  if (!assetType || !assetId || !assetUrl) {
    return res.status(400).json({ success: false, error: 'Asset type, ID, and URL are required' });
  }

  try {
    const { data: existing } = await supabase
      .from('saved_assets')
      .select('id')
      .eq('user_id', userId)
      .eq('asset_id', assetId)
      .single();

    if (existing) {
      return res.status(409).json({ success: false, error: 'Asset already saved' });
    }

    const { data: asset, error } = await supabase
      .from('saved_assets')
      .insert({
        id: uuidv4(),
        user_id: userId,
        asset_type: assetType,
        asset_id: assetId,
        asset_url: assetUrl,
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ success: true, data: asset });
  } catch (err) {
    console.error('Save asset error:', err);
    return res.status(500).json({ success: false, error: 'Failed to save asset' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const { data: existing } = await supabase
      .from('saved_assets')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    const { error } = await supabase.from('saved_assets').delete().eq('id', id);
    if (error) throw error;

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete asset error:', err);
    return res.status(500).json({ success: false, error: 'Failed to delete asset' });
  }
});

module.exports = router;
