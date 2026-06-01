require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const exploreRoutes = require('./routes/explore');
const calendarRoutes = require('./routes/calendar');
const libraryRoutes = require('./routes/library');
const ugcRoutes = require('./routes/ugc');
const creditsRoutes = require('./routes/credits');
const webhookRoutes = require('./routes/webhooks');
const { router: userRoutes } = require('./routes/user');
const { ensureBuckets } = require('./services/storageBootstrap');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway (and most PaaS) terminate TLS at a proxy and forward the real
// client IP in X-Forwarded-For. Without this, express-rate-limit would
// see every request as coming from the proxy's single IP.
app.set('trust proxy', 1);

app.use(helmet());

// CORS: lock browser access to an allowlist from ALLOWED_ORIGINS
// (comma-separated). Requests with no Origin header (native iOS app,
// curl, server-to-server) are always allowed — CORS only governs
// browsers. If ALLOWED_ORIGINS is unset we fall back to allowing all
// origins so local dev isn't broken, but log a warning.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn(
    'ALLOWED_ORIGINS not set — allowing all CORS origins. Set it in production.'
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // non-browser client
      if (allowedOrigins.length === 0) return callback(null, true); // dev fallback
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(morgan('dev'));

// IMPORTANT: webhook routes must be mounted BEFORE express.json() so the
// Razorpay HMAC verifier can hash the exact raw request bytes. Each
// webhook route opts back in to `express.raw()` itself.
app.use('/api/webhooks', webhookRoutes);

app.use(express.json({ limit: '10mb' }));

// Broad per-client rate limit on the rest of the API. Mounted AFTER the
// webhook route above so Razorpay payment callbacks are never throttled.
// The expensive AI routes layer a tighter aiLimiter on top (see routes).
app.use('/api', apiLimiter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/explore', exploreRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/ugc', ugcRoutes);
app.use('/api/credits', creditsRoutes);
app.use('/api/user', userRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, async () => {
  console.log(`Blinkugc backend running on port ${PORT}`);
  // Log the resolved ffmpeg binary so deploy regressions (e.g. Azure App
  // Service stripping ffmpeg-static during a redeploy) are obvious in the
  // first lines of the log instead of mysteriously dropping captions.
  try {
    const { ffmpegPath } = require('./config/ffmpeg');
    console.log(`ffmpeg path: ${ffmpegPath}`);
  } catch (e) {
    console.warn('ffmpeg path resolver missing:', e?.message || e);
  }
  await ensureBuckets();
});
