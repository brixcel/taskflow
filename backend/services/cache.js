const { redis } = require('../config/redis');

// Cache TTL presets in seconds
const TTL = {
  SHORT: 60, // 1 minute
  ANALYTICS: 120, // 2 minutes
  PROJECTS: 300, // 5 minutes
  MEMBERS: 300, // 5 minutes
  USER_TEAMS: 300, // 5 minutes
};

/**
 * Cache-Aside helper: returns cached JSON if present; otherwise invokes fetchFn,
 * stores the result in Redis with TTL, and returns the fresh value.
 *
 * @param {string} key - Redis cache key
 * @param {number} ttlSeconds - Time-to-live in seconds
 * @param {Function} fetchFn - Async function returning data on cache miss
 * @returns {Promise<any>}
 */
async function getOrSet(key, ttlSeconds, fetchFn) {
  if (!key) return fetchFn();

  try {
    const cached = await redis.get(key);
    if (cached !== null && cached !== undefined) {
      return JSON.parse(cached);
    }
  } catch (err) {
    // If Redis read fails, proceed directly to DB fetch
  }

  const freshData = await fetchFn();

  if (freshData !== null && freshData !== undefined) {
    try {
      await redis.set(key, JSON.stringify(freshData), 'EX', ttlSeconds);
    } catch (err) {
      // Redis write failure is non-fatal
    }
  }

  return freshData;
}

/**
 * Deletes one or more specific cache keys
 */
async function invalidate(...keys) {
  const flatKeys = keys.flat().filter(Boolean);
  if (flatKeys.length === 0) return 0;

  try {
    return await redis.del(...flatKeys);
  } catch {
    return 0;
  }
}

/**
 * Invalides all high-frequency caches for a team
 */
async function invalidateTeamCache(teamId) {
  if (!teamId) return;

  const teamKeys = [
    `cache:team:${teamId}:members`,
    `cache:team:${teamId}:projects`,
    `cache:team:${teamId}:analytics`,
  ];

  await invalidate(teamKeys);
}

/**
 * Invalides user-scoped caches (e.g. joined teams list)
 */
async function invalidateUserCache(userId) {
  if (!userId) return;
  await invalidate(`cache:user:${userId}:teams`);
}

module.exports = {
  getOrSet,
  invalidate,
  invalidateTeamCache,
  invalidateUserCache,
  TTL,
};
