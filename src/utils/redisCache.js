import { redisClient, isRedisReady } from "../config/redis.js";

export async function cacheGet(key) {
  if (!(await isRedisReady())) return null;
  try {
    return await redisClient.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlSeconds = 60) {
  if (!(await isRedisReady())) return false;
  try {
    await redisClient.set(key, value, { EX: ttlSeconds });
    return true;
  } catch {
    return false;
  }
}

export async function cacheDel(key) {
  if (!(await isRedisReady())) return;
  try {
    await redisClient.del(key);
  } catch {
    /* ignore */
  }
}

export async function cacheDelByPrefix(prefix) {
  if (!(await isRedisReady())) return;
  try {
    const keys = await redisClient.keys(`${prefix}*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch {
    /* ignore */
  }
}

export async function getOrSetJSON(key, ttlSeconds, fetchFn) {
  const cached = await cacheGet(key);
  if (cached) {
    return { data: JSON.parse(cached), fromCache: true };
  }

  const data = await fetchFn();
  await cacheSet(key, JSON.stringify(data), ttlSeconds);
  return { data, fromCache: false };
}
