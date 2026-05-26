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
const { router: userRoutes } = require('./routes/user');
const { ensureBuckets } = require('./services/storageBootstrap');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
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
app.use('/api/user', userRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, async () => {
  console.log(`Blinkugc backend running on port ${PORT}`);
  await ensureBuckets();
});
