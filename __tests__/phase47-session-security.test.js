const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app } = require('../server');
const prisma = require('../prisma');
const { redis } = require('../config/redis');
const {
  createSession,
  validateSession,
  revokeSession,
  revokeOtherSessions,
  revokeAllUserSessions,
  listUserSessions,
  getSessionTTLSeconds,
  getMaxConcurrentSessions,
} = require('../services/session');

describe('Phase A — Production-Grade Session Security Implementation', () => {
  let userA, userB, teamA, tokenA, sessionIdA, tokenB, sessionIdB;

  beforeAll(async () => {
    // Clean up test users
    await prisma.teamMembership.deleteMany({
      where: { user: { email: { in: ['session_sec_a@example.com', 'session_sec_b@example.com'] } } },
    });
    await prisma.team.deleteMany({
      where: { name: { in: ['Session Team A', 'Session Team B'] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: ['session_sec_a@example.com', 'session_sec_b@example.com'] } },
    });

    userA = await prisma.user.create({
      data: {
        email: 'session_sec_a@example.com',
        name: 'User Session A',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUU',
        emailVerified: true,
      },
    });

    teamA = await prisma.team.create({
      data: {
        name: 'Session Team A',
        ownerId: userA.id,
      },
    });

    await prisma.teamMembership.create({
      data: {
        userId: userA.id,
        teamId: teamA.id,
        role: 'owner',
      },
    });

    userB = await prisma.user.create({
      data: {
        email: 'session_sec_b@example.com',
        name: 'User Session B',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUU',
        emailVerified: true,
      },
    });

    // Create baseline sessions in Redis
    sessionIdA = await createSession({
      userId: userA.id,
      teamId: teamA.id,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ipAddress: '192.168.1.100',
    });

    tokenA = jwt.sign(
      { userId: userA.id, teamId: teamA.id, sid: sessionIdA },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '7d' }
    );

    sessionIdB = await createSession({
      userId: userB.id,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      ipAddress: '10.0.0.2',
    });

    tokenB = jwt.sign(
      { userId: userB.id, sid: sessionIdB },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '7d' }
    );
  });

  afterAll(async () => {
    if (userA) await revokeAllUserSessions(userA.id);
    if (userB) await revokeAllUserSessions(userB.id);

    await prisma.teamMembership.deleteMany({
      where: { user: { email: { in: ['session_sec_a@example.com', 'session_sec_b@example.com'] } } },
    });
    await prisma.team.deleteMany({
      where: { name: { in: ['Session Team A', 'Session Team B'] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: ['session_sec_a@example.com', 'session_sec_b@example.com'] } },
    });
    await prisma.$disconnect();
  });

  describe('1. Configurable Session Lifetime & Explicit expiresAt', () => {
    it('stores explicit expiresAt in Redis session payload', async () => {
      const raw = await redis.get(`session:${sessionIdA}`);
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw);

      expect(parsed.id).toBe(sessionIdA);
      expect(parsed.userId).toBe(userA.id);
      expect(parsed.createdAt).toBeDefined();
      expect(parsed.lastActiveAt).toBeDefined();
      expect(parsed.expiresAt).toBeDefined();

      const expiresTime = new Date(parsed.expiresAt).getTime();
      const createdTime = new Date(parsed.createdAt).getTime();
      expect(expiresTime).toBeGreaterThan(createdTime);
    });

    it('rejects and prunes expired session server-side even if Redis key still exists', async () => {
      const expiredSessionId = 'expired-test-sid-' + Date.now();
      const pastTime = new Date(Date.now() - 10000).toISOString();
      const expiredPayload = {
        id: expiredSessionId,
        userId: userA.id,
        createdAt: pastTime,
        lastActiveAt: pastTime,
        expiresAt: pastTime,
      };

      await redis.set(`session:${expiredSessionId}`, JSON.stringify(expiredPayload), 'EX', 3600);
      await redis.sadd(`user_sessions:${userA.id}`, expiredSessionId);

      const validated = await validateSession(expiredSessionId);
      expect(validated).toBeNull();

      // Ensure it was pruned from Redis
      const raw = await redis.get(`session:${expiredSessionId}`);
      expect(raw).toBeNull();
    });

    it('supports developer fast-expiration override (SESSION_MAX_AGE_SECONDS)', async () => {
      const originalEnv = process.env.SESSION_MAX_AGE_SECONDS;
      try {
        process.env.SESSION_MAX_AGE_SECONDS = '1';
        expect(getSessionTTLSeconds()).toBe(1);

        const shortSid = await createSession({ userId: userA.id });
        const initialCheck = await validateSession(shortSid);
        expect(initialCheck).not.toBeNull();

        // Wait 1.1s for expiration
        await new Promise((resolve) => setTimeout(resolve, 1100));

        const postExpiryCheck = await validateSession(shortSid);
        expect(postExpiryCheck).toBeNull();
      } finally {
        if (originalEnv) process.env.SESSION_MAX_AGE_SECONDS = originalEnv;
        else delete process.env.SESSION_MAX_AGE_SECONDS;
      }
    });
  });

  describe('2. Concurrent Session Limits & Least-Recently-Active (LRU) Eviction', () => {
    it('evicts the least-recently active session when MAX_CONCURRENT_SESSIONS is reached', async () => {
      const originalMax = process.env.MAX_CONCURRENT_SESSIONS;
      try {
        process.env.MAX_CONCURRENT_SESSIONS = '3';
        expect(getMaxConcurrentSessions()).toBe(3);

        const testUser = await prisma.user.create({
          data: {
            email: `lru_test_${Date.now()}@example.com`,
            name: 'LRU Test User',
            passwordHash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUU',
          },
        });

        // Create Session 1 (Simulate active 30 mins ago)
        const sid1 = await createSession({ userId: testUser.id, userAgent: 'Browser 1' });
        const raw1 = JSON.parse(await redis.get(`session:${sid1}`));
        raw1.lastActiveAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        await redis.set(`session:${sid1}`, JSON.stringify(raw1), 'EX', 3600);

        // Create Session 2 (Simulate active 10 mins ago)
        const sid2 = await createSession({ userId: testUser.id, userAgent: 'Browser 2' });
        const raw2 = JSON.parse(await redis.get(`session:${sid2}`));
        raw2.lastActiveAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        await redis.set(`session:${sid2}`, JSON.stringify(raw2), 'EX', 3600);

        // Create Session 3 (Simulate active 2 mins ago)
        const sid3 = await createSession({ userId: testUser.id, userAgent: 'Browser 3' });
        const raw3 = JSON.parse(await redis.get(`session:${sid3}`));
        raw3.lastActiveAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        await redis.set(`session:${sid3}`, JSON.stringify(raw3), 'EX', 3600);

        // Currently 3 active sessions (limit reached)
        let active = await listUserSessions(testUser.id);
        expect(active.length).toBe(3);

        // Create Session 4 (Should trigger LRU eviction of Session 1)
        const sid4 = await createSession({ userId: testUser.id, userAgent: 'Browser 4' });

        active = await listUserSessions(testUser.id);
        expect(active.length).toBe(3);

        // Verify sid1 is revoked
        expect(await validateSession(sid1)).toBeNull();

        // Verify sid2, sid3, sid4 remain active
        expect(await validateSession(sid2)).not.toBeNull();
        expect(await validateSession(sid3)).not.toBeNull();
        expect(await validateSession(sid4)).not.toBeNull();

        // Cleanup
        await revokeAllUserSessions(testUser.id);
        await prisma.user.delete({ where: { id: testUser.id } });
      } finally {
        if (originalMax) process.env.MAX_CONCURRENT_SESSIONS = originalMax;
        else delete process.env.MAX_CONCURRENT_SESSIONS;
      }
    });

    it('enforces limit without exceeding maximum during parallel burst logins', async () => {
      const originalMax = process.env.MAX_CONCURRENT_SESSIONS;
      try {
        process.env.MAX_CONCURRENT_SESSIONS = '3';

        const testUser = await prisma.user.create({
          data: {
            email: `burst_test_${Date.now()}@example.com`,
            name: 'Burst Test User',
            passwordHash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUU',
          },
        });

        // Launch 8 simultaneous logins in parallel
        const loginPromises = Array.from({ length: 8 }).map((_, i) =>
          createSession({ userId: testUser.id, userAgent: `Parallel Client ${i}` })
        );

        await Promise.all(loginPromises);

        const activeSessions = await listUserSessions(testUser.id);
        expect(activeSessions.length).toBeLessThanOrEqual(3);

        // Cleanup
        await revokeAllUserSessions(testUser.id);
        await prisma.user.delete({ where: { id: testUser.id } });
      } finally {
        if (originalMax) process.env.MAX_CONCURRENT_SESSIONS = originalMax;
        else delete process.env.MAX_CONCURRENT_SESSIONS;
      }
    });
  });

  describe('3. Atomic "Revoke Others" Endpoint', () => {
    it('POST /auth/sessions/revoke-others revokes all sessions except the caller session', async () => {
      const testUser = await prisma.user.create({
        data: {
          email: `revoke_others_${Date.now()}@example.com`,
          name: 'Revoke Others User',
          passwordHash: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUU',
          emailVerified: true,
        },
      });

      const mainSid = await createSession({ userId: testUser.id, userAgent: 'Main Device' });
      const sidExtra1 = await createSession({ userId: testUser.id, userAgent: 'Extra Device 1' });
      const sidExtra2 = await createSession({ userId: testUser.id, userAgent: 'Extra Device 2' });

      const testToken = jwt.sign(
        { userId: testUser.id, sid: mainSid },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '7d' }
      );

      let listBefore = await listUserSessions(testUser.id, mainSid);
      expect(listBefore.length).toBe(3);

      const res = await request(app)
        .post('/auth/sessions/revoke-others')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.revokedCount).toBe(2);

      // Verify caller session is still valid
      const callerCheck = await validateSession(mainSid);
      expect(callerCheck).not.toBeNull();

      // Verify extra sessions are revoked
      expect(await validateSession(sidExtra1)).toBeNull();
      expect(await validateSession(sidExtra2)).toBeNull();

      const listAfter = await listUserSessions(testUser.id, mainSid);
      expect(listAfter.length).toBe(1);
      expect(listAfter[0].id).toBe(mainSid);
      expect(listAfter[0].isCurrent).toBe(true);

      // Cleanup
      await revokeAllUserSessions(testUser.id);
      await prisma.user.delete({ where: { id: testUser.id } });
    });
  });

  describe('4. Ownership Enforcement & IDOR Protection', () => {
    it('prevents User A from revoking User B session', async () => {
      const res = await request(app)
        .delete(`/auth/sessions/${sessionIdB}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect([403, 404]).toContain(res.status);

      // Verify User B's session was NOT revoked
      const bCheck = await validateSession(sessionIdB);
      expect(bCheck).not.toBeNull();
    });

    it('returns 404 when attempting to revoke an already revoked or nonexistent session', async () => {
      const res = await request(app)
        .delete('/auth/sessions/non-existent-session-id')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('allows user to revoke their own remote session', async () => {
      const tempSid = await createSession({ userId: userA.id, userAgent: 'Temp Device' });

      const res = await request(app)
        .delete(`/auth/sessions/${tempSid}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      expect(await validateSession(tempSid)).toBeNull();
    });
  });

  describe('5. Immediate Rejection of Revoked Session in requireAuth', () => {
    it('returns 401 with SESSION_REVOKED code immediately after revocation', async () => {
      const tempSid = await createSession({ userId: userA.id, teamId: teamA.id });
      const tempToken = jwt.sign(
        { userId: userA.id, teamId: teamA.id, sid: tempSid },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '7d' }
      );

      // 1. Works before revocation
      const okRes = await request(app)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${tempToken}`);
      expect(okRes.status).toBe(200);

      // 2. Revoke session
      await revokeSession(tempSid, userA.id);

      // 3. Immediately fails on next protected API request
      const failRes = await request(app)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${tempToken}`);

      expect(failRes.status).toBe(401);
      expect(failRes.body.code).toBe('SESSION_REVOKED');
      expect(failRes.body.error).toContain('revoked or expired');
    });
  });
});
