const crypto = require('crypto');
const { redis } = require('../config/redis');
const { recordAuthEvent } = require('./metrics');

const DEFAULT_SESSION_MAX_AGE_DAYS = 7;
const DEFAULT_MAX_CONCURRENT_SESSIONS = 5;
const HEARTBEAT_THROTTLE_MS = 60 * 1000; // Throttle heartbeat write to 1 min

// In-process lock map to prevent race conditions on concurrent logins for the same user
const userSessionLocks = new Map();

function withUserLock(userId, fn) {
  const prevPromise = userSessionLocks.get(userId) || Promise.resolve();
  let releaseLock;
  const currentLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  const nextPromise = prevPromise
    .catch(() => {})
    .then(() => fn())
    .finally(() => {
      releaseLock();
      if (userSessionLocks.get(userId) === nextPromise) {
        userSessionLocks.delete(userId);
      }
    });

  userSessionLocks.set(userId, nextPromise);
  return nextPromise;
}

/**
 * Resolves session TTL in seconds.
 * Prioritizes SESSION_MAX_AGE_SECONDS (dev/test override) then SESSION_MAX_AGE_DAYS.
 */
function getSessionTTLSeconds() {
  if (process.env.SESSION_MAX_AGE_SECONDS) {
    const sec = parseInt(process.env.SESSION_MAX_AGE_SECONDS, 10);
    if (!isNaN(sec) && sec > 0) return sec;
  }
  if (process.env.SESSION_MAX_AGE_DAYS) {
    const days = parseInt(process.env.SESSION_MAX_AGE_DAYS, 10);
    if (!isNaN(days) && days > 0) return days * 24 * 60 * 60;
  }
  return DEFAULT_SESSION_MAX_AGE_DAYS * 24 * 60 * 60;
}

/**
 * Resolves max allowed active concurrent sessions per user.
 */
function getMaxConcurrentSessions() {
  if (process.env.MAX_CONCURRENT_SESSIONS) {
    const max = parseInt(process.env.MAX_CONCURRENT_SESSIONS, 10);
    if (!isNaN(max) && max > 0) return max;
  }
  return DEFAULT_MAX_CONCURRENT_SESSIONS;
}

function parseUserAgent(ua = '') {
  const uaLower = ua.toLowerCase();

  let browser = 'Web Browser';
  if (uaLower.includes('edg/')) browser = 'Microsoft Edge';
  else if (uaLower.includes('chrome')) browser = 'Google Chrome';
  else if (uaLower.includes('safari') && !uaLower.includes('chrome')) browser = 'Apple Safari';
  else if (uaLower.includes('firefox')) browser = 'Mozilla Firefox';
  else if (uaLower.includes('postman')) browser = 'Postman API';

  let os = 'Unknown OS';
  if (uaLower.includes('windows')) os = 'Windows';
  else if (uaLower.includes('macintosh') || uaLower.includes('mac os')) os = 'macOS';
  else if (uaLower.includes('linux')) os = 'Linux';
  else if (uaLower.includes('iphone') || uaLower.includes('ipad')) os = 'iOS';
  else if (uaLower.includes('android')) os = 'Android';

  const isMobile = /mobile|iphone|ipad|android/i.test(uaLower);

  return { browser, os, isMobile };
}

/**
 * Creates a server-side session in Redis with explicit expiration and
 * atomically enforces concurrent session limits via LRU eviction (least-recently-active).
 */
async function createSession({ userId, teamId = null, userAgent = '', ipAddress = '' }) {
  if (!userId) throw new Error('userId is required to create a session');

  return withUserLock(userId, async () => {
    const ttlSeconds = getSessionTTLSeconds();
    const maxConcurrent = getMaxConcurrentSessions();
    const sessionId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const nowIso = now.toISOString();

    const sessionData = {
      id: sessionId,
      userId,
      teamId,
      userAgent,
      ipAddress,
      createdAt: nowIso,
      lastActiveAt: nowIso,
      expiresAt,
    };

    // 1. Fetch current active sessions for the user to check concurrency limit & IP anomalies
    const userSetKey = `user_sessions:${userId}`;
    const existingSessionIds = await redis.smembers(userSetKey);
    const activeSessions = [];
    const knownIps = new Set();

    for (const sid of existingSessionIds) {
      const raw = await redis.get(`session:${sid}`);
      if (!raw) {
        // Clean up orphaned session from user set
        await redis.srem(userSetKey, sid);
        continue;
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed.ipAddress) knownIps.add(parsed.ipAddress);
        // If session is already expired according to its explicit expiresAt, prune it
        if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
          await redis.del(`session:${sid}`);
          await redis.srem(userSetKey, sid);
          continue;
        }
        activeSessions.push({
          id: sid,
          lastActiveTime: new Date(parsed.lastActiveAt || parsed.createdAt).getTime(),
        });
      } catch (_) {
        await redis.srem(userSetKey, sid);
      }
    }

    const isNewLocation = knownIps.size > 0 && ipAddress && !knownIps.has(ipAddress);
    if (isNewLocation) {
      recordAuthEvent({ event: 'new_ip_session', status: 'info' });
    }

    // 2. Enforce Least-Recently-Active (LRU) Eviction if limit reached or exceeded
    if (activeSessions.length >= maxConcurrent) {
      // Sort ascending: smallest timestamp = least recently active
      activeSessions.sort((a, b) => a.lastActiveTime - b.lastActiveTime);
      const evictCount = (activeSessions.length - maxConcurrent) + 1;
      const toEvict = activeSessions.slice(0, evictCount);

      const pipeline = redis.pipeline();
      for (const ev of toEvict) {
        pipeline.del(`session:${ev.id}`);
        pipeline.srem(userSetKey, ev.id);
      }
      await pipeline.exec();

      recordAuthEvent({ event: 'session_evicted', status: 'success' });
    }

    // 3. Store new session and index in user set atomically
    const pipeline = redis.pipeline();
    pipeline.set(
      `session:${sessionId}`,
      JSON.stringify(sessionData),
      'EX',
      ttlSeconds
    );
    pipeline.sadd(userSetKey, sessionId);
    pipeline.expire(userSetKey, ttlSeconds);
    await pipeline.exec();

    recordAuthEvent({ event: 'session_created', status: 'success' });

    return sessionId;
  });
}

/**
 * Validates session in Redis, checks explicit expiration, and updates lastActiveAt heartbeat.
 */
async function validateSession(sessionId) {
  if (!sessionId) return null;

  const raw = await redis.get(`session:${sessionId}`);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw);

    // 1. Explicit expiration check
    if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
      await revokeSession(sessionId, session.userId);
      return null;
    }

    const lastActive = new Date(session.lastActiveAt).getTime();
    const ttlSeconds = getSessionTTLSeconds();

    // 2. Heartbeat update throttled to reduce Redis write load
    if (Date.now() - lastActive > HEARTBEAT_THROTTLE_MS) {
      session.lastActiveAt = new Date().toISOString();
      await redis.set(
        `session:${sessionId}`,
        JSON.stringify(session),
        'EX',
        ttlSeconds
      );
      await redis.expire(`user_sessions:${session.userId}`, ttlSeconds);
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Instantly revokes a specific session ID with strict ownership check (IDOR protection).
 * Returns { success: boolean, notFound?: boolean, forbidden?: boolean }
 */
async function revokeSession(sessionId, requestingUserId = null) {
  if (!sessionId) return { success: false, notFound: true };

  const raw = await redis.get(`session:${sessionId}`);
  if (!raw) {
    if (requestingUserId) {
      await redis.srem(`user_sessions:${requestingUserId}`, sessionId);
    }
    return { success: false, notFound: true };
  }

  let sessionOwnerId = null;
  try {
    const parsed = JSON.parse(raw);
    sessionOwnerId = parsed.userId;
  } catch (_) {}

  // IDOR Protection: Confirm the requesting user owns the session
  if (requestingUserId && sessionOwnerId && sessionOwnerId !== requestingUserId) {
    return { success: false, forbidden: true };
  }

  const targetUserId = sessionOwnerId || requestingUserId;

  const pipeline = redis.pipeline();
  pipeline.del(`session:${sessionId}`);
  if (targetUserId) {
    pipeline.srem(`user_sessions:${targetUserId}`, sessionId);
  }
  await pipeline.exec();

  recordAuthEvent({ event: 'session_revoked', status: 'success' });

  return { success: true };
}

/**
 * Revokes all sessions for a user EXCEPT the specified current session.
 * Used for "Log out all other devices".
 */
async function revokeOtherSessions(userId, currentSessionId) {
  if (!userId || !currentSessionId) return 0;

  const userSetKey = `user_sessions:${userId}`;
  const sessionIds = await redis.smembers(userSetKey);
  const toRevoke = sessionIds.filter((sid) => sid !== currentSessionId);

  if (toRevoke.length === 0) return 0;

  const pipeline = redis.pipeline();
  for (const sid of toRevoke) {
    pipeline.del(`session:${sid}`);
    pipeline.srem(userSetKey, sid);
  }
  await pipeline.exec();

  recordAuthEvent({ event: 'session_revoke_others', status: 'success' });

  return toRevoke.length;
}

/**
 * Revokes all sessions belonging to a user.
 */
async function revokeAllUserSessions(userId, exceptSessionId = null) {
  if (!userId) return 0;

  const userSetKey = `user_sessions:${userId}`;
  const sessionIds = await redis.smembers(userSetKey);
  let count = 0;

  const pipeline = redis.pipeline();
  for (const sid of sessionIds) {
    if (sid !== exceptSessionId) {
      pipeline.del(`session:${sid}`);
      pipeline.srem(userSetKey, sid);
      count++;
    }
  }
  await pipeline.exec();

  recordAuthEvent({ event: 'session_revoke_all', status: 'success' });

  return count;
}

/**
 * Lists all active connected devices/sessions for a user.
 */
async function listUserSessions(userId, currentSessionId = null) {
  if (!userId) return [];

  const userSetKey = `user_sessions:${userId}`;
  const sessionIds = await redis.smembers(userSetKey);
  const sessions = [];

  for (const sid of sessionIds) {
    const raw = await redis.get(`session:${sid}`);
    if (!raw) {
      await redis.srem(userSetKey, sid);
      continue;
    }

    try {
      const data = JSON.parse(raw);

      // Skip expired sessions
      if (data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now()) {
        await redis.del(`session:${sid}`);
        await redis.srem(userSetKey, sid);
        continue;
      }

      const { browser, os, isMobile } = parseUserAgent(data.userAgent);

      sessions.push({
        id: data.id,
        browser,
        os,
        isMobile,
        ipAddress: data.ipAddress || '127.0.0.1',
        createdAt: data.createdAt,
        lastActiveAt: data.lastActiveAt,
        expiresAt: data.expiresAt,
        isCurrent: Boolean(currentSessionId && data.id === currentSessionId),
      });
    } catch (_) {}
  }

  // Sort: current session first, then by lastActiveAt descending
  return sessions.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    return new Date(b.lastActiveAt) - new Date(a.lastActiveAt);
  });
}

module.exports = {
  createSession,
  validateSession,
  revokeSession,
  revokeOtherSessions,
  revokeAllUserSessions,
  listUserSessions,
  getSessionTTLSeconds,
  getMaxConcurrentSessions,
};
