const crypto = require('crypto');
const { redis } = require('../config/redis');

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const HEARTBEAT_THROTTLE_MS = 60 * 1000; // Throttle heartbeat write to 1 min

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
 * Creates a server-side session in Redis and indexes it under user's session list
 */
async function createSession({ userId, teamId = null, userAgent = '', ipAddress = '' }) {
  if (!userId) throw new Error('userId is required to create a session');

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const sessionData = {
    id: sessionId,
    userId,
    teamId,
    userAgent,
    ipAddress,
    createdAt: now,
    lastActiveAt: now,
  };

  await redis.set(
    `session:${sessionId}`,
    JSON.stringify(sessionData),
    'EX',
    SESSION_TTL_SECONDS
  );

  await redis.sadd(`user_sessions:${userId}`, sessionId);
  await redis.expire(`user_sessions:${userId}`, SESSION_TTL_SECONDS);

  return sessionId;
}

/**
 * Validates session in Redis and updates lastActiveAt heartbeat
 */
async function validateSession(sessionId) {
  if (!sessionId) return null;

  const raw = await redis.get(`session:${sessionId}`);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw);
    const lastActive = new Date(session.lastActiveAt).getTime();

    // Heartbeat update throttled to reduce Redis write load
    if (Date.now() - lastActive > HEARTBEAT_THROTTLE_MS) {
      session.lastActiveAt = new Date().toISOString();
      await redis.set(
        `session:${sessionId}`,
        JSON.stringify(session),
        'EX',
        SESSION_TTL_SECONDS
      );
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Instantly revokes a specific session ID
 */
async function revokeSession(sessionId, userId = null) {
  if (!sessionId) return false;

  let targetUserId = userId;
  if (!targetUserId) {
    const raw = await redis.get(`session:${sessionId}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        targetUserId = parsed.userId;
      } catch (_) {}
    }
  }

  await redis.del(`session:${sessionId}`);
  if (targetUserId) {
    await redis.srem(`user_sessions:${targetUserId}`, sessionId);
  }
  return true;
}

/**
 * Revokes all sessions belonging to a user (optionally keeping current session active)
 */
async function revokeAllUserSessions(userId, exceptSessionId = null) {
  if (!userId) return 0;

  const sessionIds = await redis.smembers(`user_sessions:${userId}`);
  let count = 0;

  for (const sid of sessionIds) {
    if (sid !== exceptSessionId) {
      await redis.del(`session:${sid}`);
      await redis.srem(`user_sessions:${userId}`, sid);
      count++;
    }
  }

  return count;
}

/**
 * Lists all active connected devices/sessions for a user
 */
async function listUserSessions(userId, currentSessionId = null) {
  if (!userId) return [];

  const sessionIds = await redis.smembers(`user_sessions:${userId}`);
  const sessions = [];

  for (const sid of sessionIds) {
    const raw = await redis.get(`session:${sid}`);
    if (!raw) {
      // Clean up orphaned session ID
      await redis.srem(`user_sessions:${userId}`, sid);
      continue;
    }

    try {
      const data = JSON.parse(raw);
      const { browser, os, isMobile } = parseUserAgent(data.userAgent);

      sessions.push({
        id: data.id,
        browser,
        os,
        isMobile,
        ipAddress: data.ipAddress || '127.0.0.1',
        createdAt: data.createdAt,
        lastActiveAt: data.lastActiveAt,
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
  revokeAllUserSessions,
  listUserSessions,
  SESSION_TTL_SECONDS,
};
