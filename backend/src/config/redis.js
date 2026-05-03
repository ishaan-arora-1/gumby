const { createClient } = require('redis');

let redisClient = null;

async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => console.error('Redis error:', err));
    await redisClient.connect();
    console.log('Redis connected');
  }
  return redisClient;
}

module.exports = { getRedisClient };
