const Redis = require('ioredis');

let redis = null;

const createRedisClient = () => {
  try {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('error', (err) => {
      console.warn('Redis connection error:', err.message);
    });

    redis.on('connect', () => {
      console.log('Connected to Redis');
    });
  } catch (err) {
    console.warn('Failed to initialize Redis:', err.message);
    redis = null;
  }

  return redis;
};

const getRedis = () => redis;

module.exports = { createRedisClient, getRedis };
