const { createClient } = require('redis');

let redisClient = null;
let redisInitialized = false;

// No-op stand-in returned when Redis is unavailable. Lets routes call
// .get / .setEx / .del without branching — caching simply becomes a no-op
// and the underlying database query runs every time.
const noopRedis = {
  get: async () => null,
  setEx: async () => {},
  del: async () => {},
  isNoop: true,
};

async function getRedisClient() {
  if (redisInitialized) return redisClient;

  redisInitialized = true;

  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not set — caching disabled (no-op client).');
    redisClient = noopRedis;
    return redisClient;
  }

  try {
    const client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => console.error('Redis error:', err.message));
    await client.connect();
    console.log('Redis connected');
    redisClient = client;
    return redisClient;
  } catch (err) {
    console.error('Redis unavailable, using no-op cache:', err.message);
    redisClient = noopRedis;
    return redisClient;
  }
}

module.exports = { getRedisClient };
