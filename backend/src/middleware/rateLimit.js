/**
 * Rate limiters. Two tiers:
 *
 *   apiLimiter  — broad limit on every /api/* route. Catches abusive
 *                 clients hammering cheap endpoints.
 *   aiLimiter   — tight limit on the expensive AI-generating routes
 *                 (UGC + chat). Each of these calls costs real money
 *                 (FAL / OpenAI / Gemini), so we cap them hard per user.
 *
 * Limits key off the authenticated user id when present, falling back to
 * IP. That way one logged-in user can't burn the whole IP's budget and a
 * shared office IP isn't throttled as a single client.
 */
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

function keyByUserOrIp(req, res) {
  if (req.user && req.user.id) return `user:${req.user.id}`;
  // ipKeyGenerator normalises IPv6 addresses into a stable subnet key.
  return ipKeyGenerator(req, res);
}

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests / minute / client
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { success: false, error: 'Too many requests, please slow down.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 generation requests / minute / client
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: {
    success: false,
    error: 'You are generating too quickly. Please wait a moment and try again.',
  },
});

module.exports = { apiLimiter, aiLimiter };
