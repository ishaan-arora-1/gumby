const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

async function fetchPreferences(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .single();
  if (error) {
    // Column may not exist yet
    return { items: [] };
  }
  return data?.preferences || { items: [] };
}

async function savePreferences(userId, prefs) {
  const { error } = await supabase
    .from('users')
    .update({ preferences: prefs })
    .eq('id', userId);
  if (error) {
    console.error('Save prefs error:', error.message);
    return false;
  }
  return true;
}

function mergeAnswers(existing, incoming) {
  const items = Array.isArray(existing?.items) ? [...existing.items] : [];
  for (const incomingItem of incoming) {
    const q = (incomingItem.question || '').trim();
    const a = (incomingItem.answer || '').trim();
    if (!q || !a) continue;
    const idx = items.findIndex(
      (it) => (it.question || '').trim().toLowerCase() === q.toLowerCase()
    );
    const record = { question: q, answer: a, updated_at: new Date().toISOString() };
    if (idx >= 0) items[idx] = record;
    else items.push(record);
  }
  // Cap to 30 most recent
  return { ...(existing || {}), items: items.slice(-30) };
}

router.get('/preferences', async (req, res) => {
  const prefs = await fetchPreferences(req.user.id);
  return res.json({ success: true, data: prefs });
});

router.post('/preferences', async (req, res) => {
  const { answers } = req.body;
  if (!Array.isArray(answers)) {
    return res.status(400).json({ success: false, error: 'answers array required' });
  }
  const existing = await fetchPreferences(req.user.id);
  const merged = mergeAnswers(existing, answers);
  const ok = await savePreferences(req.user.id, merged);
  return res.json({ success: ok, data: merged });
});

module.exports = { router, fetchPreferences, savePreferences, mergeAnswers };
