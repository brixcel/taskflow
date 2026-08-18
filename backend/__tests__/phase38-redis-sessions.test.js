require('dotenv').config();
const request = require('supertest');
const { app } = require('../server');
const prisma = require('../prisma');
const { sanitizeValue } = require('../middleware/sanitize');
const { validateSession, listUserSessions } = require('../services/session');

describe('Phase 38 — Server-Side Redis Sessions, Universal Input Sanitizer & Instant Token Revocation', () => {
  let userOwner, userMember;
  let tokenOwner, tokenMember;
  let team;

  beforeAll(async () => {
    // 1. Register Owner
    const regOwner = await request(app)
      .post('/auth/register')
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
      .send({
        name: 'Session Lead',
        email: `session-lead-${Date.now()}@example.com`,
        password: 'Password123!',
        teamName: 'Security Ops Team',
      });

    userOwner = regOwner.body.user;
    tokenOwner = regOwner.body.token;

    const teamsRes = await request(app)
      .get('/teams/me')
      .set('Authorization', `Bearer ${tokenOwner}`);
    team = teamsRes.body.teams[0];

    // 2. Register Member
    const regMember = await request(app)
      .post('/auth/register')
      .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')
      .send({
        name: 'Remote Freelancer',
        email: `freelance-session-${Date.now()}@example.com`,
        password: 'Password123!',
        teamName: 'Temp Freelance Team',
      });

    userMember = regMember.body.user;
    tokenMember = regMember.body.token;

    await prisma.teamMembership.create({
      data: {
        userId: userMember.id,
        teamId: team.id,
        role: 'member',
      },
    });
  });

  afterAll(async () => {
    try {
      if (team) await prisma.team.deleteMany({ where: { id: team.id } });
      if (userOwner) await prisma.user.deleteMany({ where: { id: { in: [userOwner.id, userMember?.id] } } });
      await prisma.$disconnect();
    } catch (_) {}
  });

  describe('1. Universal Deep Input Sanitization (Charter C15)', () => {
    it('recursively sanitizes nested objects and arrays, stripping script execution tags', () => {
      const maliciousPayload = {
        title: 'Task <script>alert("XSS")</script>',
        nested: {
          description: '<img src=x onerror="stealCookies()">Clean text',
          tags: ['<b>Bold</b>', '<iframe src="http://evil.com"></iframe>tag2'],
        },
      };

      const sanitized = sanitizeValue(maliciousPayload);

      expect(sanitized.title).toBe('Task');
      expect(sanitized.nested.description).toBe('Clean text');
      expect(sanitized.nested.tags).toEqual(['Bold', 'tag2']);
    });
  });

  describe('2. Session Creation & Active Device Listing', () => {
    it('creates server-side Redis session on login and lists device information', async () => {
      const loginRes = await request(app)
        .post('/auth/login')
        .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36')
        .send({
          email: userOwner.email,
          password: 'Password123!',
        });

      expect(loginRes.status).toBe(200);
      const newSessionToken = loginRes.body.token;

      // Fetch active sessions
      const sessionsRes = await request(app)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${newSessionToken}`);

      expect(sessionsRes.status).toBe(200);
      expect(Array.isArray(sessionsRes.body.sessions)).toBe(true);
      expect(sessionsRes.body.sessions.length).toBeGreaterThanOrEqual(1);

      const current = sessionsRes.body.sessions.find((s) => s.isCurrent === true);
      expect(current).toBeDefined();
      expect(current.browser).toBe('Google Chrome');
      expect(current.os).toBe('macOS');
      expect(current.isMobile).toBe(false);
    });
  });

  describe('3. Instant Token & Session Revocation', () => {
    it('instantly revokes session on POST /auth/logout and blocks subsequent requests with 401', async () => {
      // 1. Log in to get fresh session
      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          email: userOwner.email,
          password: 'Password123!',
        });
      const sessionToken = loginRes.body.token;

      // 2. Verify token works before logout
      const beforeLogout = await request(app)
        .get('/tasks')
        .set('Authorization', `Bearer ${sessionToken}`)
        .set('X-Team-Id', team.id);
      expect(beforeLogout.status).toBe(200);

      // 3. Log out (revokes session ID in Redis)
      const logoutRes = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${sessionToken}`);
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // 4. Verify subsequent request with same token is instantly blocked
      const afterLogout = await request(app)
        .get('/tasks')
        .set('Authorization', `Bearer ${sessionToken}`)
        .set('X-Team-Id', team.id);
      expect(afterLogout.status).toBe(401);
      expect(afterLogout.body.code).toBe('SESSION_REVOKED');
    });

    it('allows signing out of all devices via POST /auth/logout-all', async () => {
      // Log in on Device 1
      const dev1 = await request(app)
        .post('/auth/login')
        .send({ email: userOwner.email, password: 'Password123!' });

      // Log in on Device 2
      const dev2 = await request(app)
        .post('/auth/login')
        .send({ email: userOwner.email, password: 'Password123!' });

      // Revoke all sessions
      const logoutAll = await request(app)
        .post('/auth/logout-all')
        .set('Authorization', `Bearer ${dev1.body.token}`);
      expect(logoutAll.status).toBe(200);

      // Both tokens must now be rejected
      const checkDev1 = await request(app)
        .get('/tasks')
        .set('Authorization', `Bearer ${dev1.body.token}`)
        .set('X-Team-Id', team.id);
      expect(checkDev1.status).toBe(401);

      const checkDev2 = await request(app)
        .get('/tasks')
        .set('Authorization', `Bearer ${dev2.body.token}`)
        .set('X-Team-Id', team.id);
      expect(checkDev2.status).toBe(401);
    });
  });

  describe('4. Team Member Eviction Instant Invalidation', () => {
    it('instantly invalidates member sessions when owner removes them from team', async () => {
      // 1. Fresh login for owner
      const ownerLogin = await request(app)
        .post('/auth/login')
        .send({ email: userOwner.email, password: 'Password123!' });
      const currentOwnerToken = ownerLogin.body.token;

      // 2. Member logs in
      const memberLogin = await request(app)
        .post('/auth/login')
        .send({ email: userMember.email, password: 'Password123!' });
      const memberToken = memberLogin.body.token;

      // 3. Member can access tasks
      const beforeEvict = await request(app)
        .get('/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Team-Id', team.id);
      expect(beforeEvict.status).toBe(200);

      // 4. Owner removes member from team
      const deleteMemberRes = await request(app)
        .delete(`/teams/${team.id}/members/${userMember.id}`)
        .set('Authorization', `Bearer ${currentOwnerToken}`);
      expect(deleteMemberRes.status).toBe(204);

      // 5. Member session is immediately revoked on next request
      const afterEvict = await request(app)
        .get('/tasks')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Team-Id', team.id);
      expect(afterEvict.status).toBe(401);
    });
  });
});
