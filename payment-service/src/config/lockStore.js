const Redis = require('ioredis');

let redisClient = null;

const getRedisClient = () => {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT, 10) || 6379,
    maxRetriesPerRequest: 3,
  });

  redisClient.on('error', (err) => {
    console.warn('Redis lock store error:', err.message);
  });

  return redisClient;
};

const buildSeatLockKey = (eventId, seatId) => `seat.lock:${eventId}:${seatId}`;

const validateSeatLock = async ({ userId, eventId, seatId, sessionToken }) => {
  if (!eventId || !seatId) {
    return false;
  }

  const redis = getRedisClient();
  const rawLock = await redis.get(buildSeatLockKey(eventId, seatId));
  if (!rawLock) {
    return false;
  }

  try {
    const lock = JSON.parse(rawLock);
    if (Number(lock.event_id ?? lock.eventId) !== Number(eventId)) {
      return false;
    }
    if (String(lock.seat_id ?? lock.seatId) !== String(seatId)) {
      return false;
    }
    if (userId && Number(lock.user_id ?? lock.userId) !== Number(userId)) {
      return false;
    }
    if (sessionToken && String(lock.session_token ?? lock.sessionToken) !== String(sessionToken)) {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
};

const deleteSeatLock = async ({ eventId, seatId }) => {
  if (!eventId || !seatId) {
    return;
  }

  const redis = getRedisClient();
  await redis.del(buildSeatLockKey(eventId, seatId));
};

const disconnectLockStore = async () => {
  if (!redisClient) {
    return;
  }

  try {
    await redisClient.quit();
  } catch (err) {
    console.warn('Failed to close Redis lock store:', err.message);
  } finally {
    redisClient = null;
  }
};

module.exports = {
  validateSeatLock,
  deleteSeatLock,
  disconnectLockStore,
};
