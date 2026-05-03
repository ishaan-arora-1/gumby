const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.post('/verify', async (req, res) => {
  const authHeader = req.headers.authorization;
  const bodyToken = req.body.token;

  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : bodyToken;

  if (!token) {
    return res.status(400).json({ success: false, error: 'Token is required' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    const displayName = req.body.name
      || user.user_metadata?.full_name
      || user.email?.split('@')[0]
      || 'User';

    if (!existingUser) {
      const { error: insertError } = await supabase.from('users').insert({
        id: user.id,
        email: user.email,
        name: displayName,
        avatar_url: user.user_metadata?.avatar_url || null,
      });
      if (insertError) console.error('User insert error:', insertError);
    }

    return res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: existingUser?.name || displayName,
        avatar_url: user.user_metadata?.avatar_url || existingUser?.avatar_url || null,
      },
    });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

module.exports = router;
