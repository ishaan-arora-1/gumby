const supabase = require('../config/supabase');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ success: false, error: 'Authentication failed' });
  }
}

module.exports = authMiddleware;
