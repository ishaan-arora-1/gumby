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

// Permanently delete the authenticated user's account and all associated data.
// Required by Apple Guideline 5.1.1(v) for any app that supports account creation.
router.delete('/account', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing bearer token' });
  }

  try {
    const { data: { user }, error: getUserError } = await supabase.auth.getUser(token);
    if (getUserError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const userId = user.id;

    // Best-effort cascade. RLS-protected tables are removed via the service role.
    const tables = [
      'messages',
      'conversations',
      'posts',
      'moodboards',
      'saved_assets',
      'models',
      'ugc_jobs',
      'ugc_creator_jobs',
    ];
    for (const table of tables) {
      const { error: delError } = await supabase.from(table).delete().eq('user_id', userId);
      if (delError) console.error(`Delete from ${table} failed:`, delError);
    }

    const { error: userRowError } = await supabase.from('users').delete().eq('id', userId);
    if (userRowError) console.error('Delete users row failed:', userRowError);

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error('Auth delete failed:', authDeleteError);
      return res.status(500).json({ success: false, error: 'Could not delete auth user' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Account deletion error:', err);
    return res.status(500).json({ success: false, error: 'Account deletion failed' });
  }
});

module.exports = router;
