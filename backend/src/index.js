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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));

// IMPORTANT: webhook routes must be mounted BEFORE express.json() so the
// Razorpay HMAC verifier can hash the exact raw request bytes. Each
// webhook route opts back in to `express.raw()` itself.
app.use('/api/webhooks', webhookRoutes);

app.use(express.json({ limit: '10mb' }));

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
