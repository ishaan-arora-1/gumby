const { createClient } = require('redis');

let realClient = null;
let initStarted = false;

// Public wrapper: every method swallows errors so a degraded Redis
// (unreachable, dropped connection, auth fail) can never crash an API
// handler. If Redis is down, get() returns null (so the route falls
// through to the DB) and setEx/del become no-ops.
const safeRedis = {
  async get(key) {
    if (!realClient) return null;
    try {
      return await realClient.get(key);
    } catch (err) {
      // log once, don't spam — comment out if even this is too noisy
      // console.warn('Redis get failed:', err.message);
      return null;
    }
  },
  async setEx(key, ttl, value) {
    if (!realClient) return;
    try {
      await realClient.setEx(key, ttl, value);
    } catch (err) {
      // swallow
    }
  },
  async del(key) {
    if (!realClient) return;
    try {
      await realClient.del(key);
    } catch (err) {
      // swallow
    }
  },
};

function startInit() {
  if (initStarted) return;
  initStarted = true;

  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not set — caching disabled (no-op).');
    return;
  }

  const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
      // If we can't reach Redis quickly, give up — don't queue commands
      // forever waiting for it to come back.
      connectTimeout: 3000,
      reconnectStrategy: (retries) => {
        if (retries > 3) return false; // stop retrying after 3 attempts
        return Math.min(retries * 500, 2000);
      },
    },
  });

  client.on('error', (err) => {
    // Avoid log spam: only print once per error type.
    if (!startInit._lastErr || startInit._lastErr !== err.message) {
      console.error('Redis error:', err.message);
      startInit._lastErr = err.message;
    }
  });
  client.on('ready', () => {
    console.log('Redis connected');
    realClient = client;
  });
  client.on('end', () => {
    realClient = null;
  });

  client.connect().catch((err) => {
    console.error('Redis initial connect failed, continuing without cache:', err.message);
  });
}

// Kick off init the first time anyone requests the client.
async function getRedisClient() {
  startInit();
  return safeRedis;
}

module.exports = { getRedisClient };
