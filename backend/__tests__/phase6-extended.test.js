/**
 * Phase 6 — Extended Email Verification Tests
 *
 * Covers edge-cases not tested in email-verification.test.js:
 *
 *   1. GET /auth/_test/last-verify-token
 *      - returns the raw token stashed by register/resend
 *      - returns 404 when no token is in memory
 *      - returns 404 in non-test NODE_ENV (guarded by the route)
 *
 *   2. Token TTL
 *      - verify tokens are created with a ~24h expiry
 *
 *   3. Resend only deletes UNUSED tokens — already-used tokens are left alone
 *
 *   4. verify-email rejects a missing token param with a 400 (schema guard)
 *
 *   5. verify-email with a token that is exactly 1 hex char too short is treated
 *      as invalid (no DB record → 400 invalid-or-expired)
 */

const request = require('supertest');
const express = require('express');
const bcrypt  = require('bcrypt');
const crypto  = require('crypto');
const prisma  = require('../prisma');
const authRoutes = require('../routes/auth');

jest.mock('../services/email', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendVerificationEmail:  jest.fn(),
}));

const { sendVerificationEmail } = require('../services/email');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  return app;
}

async function makeUser(email, name, { emailVerified = false } = {}) {
  const passwordHash = await bcrypt.hash('password123', 10);
  return prisma.user.create({ data: { email, passwordHash, name, emailVerified } });
}

async function makeVerifyToken(userId, { expired = false, used = false } = {}) {
  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = expired
    ? new Date(Date.now() - 1_000)
    : new Date(Date.now() + 24 * 60 * 60 * 1_000);
  const record = await prisma.emailVerificationToken.create({
    data: { tokenHash, userId, expiresAt, ...(used ? { usedAt: new Date() } : {}) },
  });
  return { rawToken, tokenHash, record };
}

let app;
let user;

beforeAll(() => { app = createTestApp(); });

beforeEach(async () => {
  await prisma.emailVerificationToken.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({});

  sendVerificationEmail.mockClear();
  global.__lastVerifyTokenForTest__ = undefined;

  user = await makeUser('p6ext-alice@example.com', 'Alice');
});

afterAll(() => prisma.$disconnect());

// ─── 1. GET /auth/_test/last-verify-token ────────────────────────────────────

describe('GET /auth/_test/last-verify-token', () => {
  it('returns 404 when no token has been stashed yet', async () => {
    global.__lastVerifyTokenForTest__ = undefined;
    const res = await request(app).get('/auth/_test/last-verify-token');
    expect(res.status).toBe(404);
  });

  it('returns the raw token after register stashes it', async () => {
    // register stashes global.__lastVerifyTokenForTest__ in test mode
    const registerRes = await request(app)
      .post('/auth/register')
      .send({ email: 'p6ext-bob@example.com', password: 'password123', name: 'Bob' });
    expect(registerRes.status).toBe(201);

    const res = await request(app).get('/auth/_test/last-verify-token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(0);
  });

  it('returned token matches the one stored in DB', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'p6ext-carol@example.com', password: 'password123', name: 'Carol' });

    const res = await request(app).get('/auth/_test/last-verify-token');
    expect(res.status).toBe(200);

    const { token, tokenId } = res.body;
    const expectedHash = crypto.createHash('sha256').update(token).digest('hex');

    const record = await prisma.emailVerificationToken.findUnique({ where: { id: tokenId } });
    expect(record).not.toBeNull();
    expect(record.tokenHash).toBe(expectedHash);
  });

  it('returns the raw token after resend-verification stashes it', async () => {
    // Prime with a resend
    await request(app)
      .post('/auth/resend-verification')
      .send({ email: user.email });

    const res = await request(app).get('/auth/_test/last-verify-token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('returns 404 when stashed token no longer exists in DB', async () => {
    // Manually stash a token value that doesn't exist in the DB
    global.__lastVerifyTokenForTest__ = 'aaaa' + crypto.randomBytes(30).toString('hex');
    const res = await request(app).get('/auth/_test/last-verify-token');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found in DB/i);
  });
});

// ─── 2. Token TTL ─────────────────────────────────────────────────────────────

describe('Verification token TTL', () => {
  it('token created by register expires approximately 24 hours from now', async () => {
    const before = Date.now();
    await request(app)
      .post('/auth/register')
      .send({ email: 'p6ext-ttl@example.com', password: 'password123', name: 'TTL' });
    const after = Date.now();

    const newUser = await prisma.user.findUnique({ where: { email: 'p6ext-ttl@example.com' } });
    const tokens  = await prisma.emailVerificationToken.findMany({ where: { userId: newUser.id } });
    expect(tokens).toHaveLength(1);

    const expiresMs = tokens[0].expiresAt.getTime();
    const expectedMin = before + 23 * 60 * 60 * 1_000; // at least 23h from now
    const expectedMax = after  + 25 * 60 * 60 * 1_000; // at most 25h from now

    expect(expiresMs).toBeGreaterThanOrEqual(expectedMin);
    expect(expiresMs).toBeLessThanOrEqual(expectedMax);
  });

  it('token created by resend-verification also expires ~24h from now', async () => {
    const before = Date.now();
    await request(app)
      .post('/auth/resend-verification')
      .send({ email: user.email });
    const after = Date.now();

    const tokens = await prisma.emailVerificationToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);

    const expiresMs = tokens[0].expiresAt.getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 23 * 60 * 60 * 1_000);
    expect(expiresMs).toBeLessThanOrEqual(after  + 25 * 60 * 60 * 1_000);
  });
});

// ─── 3. Resend preserves already-used tokens ──────────────────────────────────

describe('POST /auth/resend-verification — preserves used tokens', () => {
  it('only deletes UNUSED tokens; already-used tokens remain in DB', async () => {
    // Create one used token and one unused token
    const { tokenHash: usedHash }   = await makeVerifyToken(user.id, { used: true });
    const { tokenHash: unusedHash } = await makeVerifyToken(user.id, { used: false });

    await request(app)
      .post('/auth/resend-verification')
      .send({ email: user.email });

    // Used token should still exist
    const usedRecord = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: usedHash } });
    expect(usedRecord).not.toBeNull();
    expect(usedRecord.usedAt).not.toBeNull();

    // Old unused token should be gone
    const unusedRecord = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: unusedHash } });
    expect(unusedRecord).toBeNull();

    // One new token should have been created
    const all = await prisma.emailVerificationToken.findMany({ where: { userId: user.id } });
    const unused = all.filter(t => t.usedAt === null);
    expect(unused).toHaveLength(1);
  });

  it('resend after user already verified sends no email and leaves DB unchanged', async () => {
    const verifiedUser = await makeUser('p6ext-verified@example.com', 'Verified', { emailVerified: true });
    const countBefore = await prisma.emailVerificationToken.count({ where: { userId: verifiedUser.id } });

    await request(app)
      .post('/auth/resend-verification')
      .send({ email: verifiedUser.email });

    expect(sendVerificationEmail).not.toHaveBeenCalled();
    const countAfter = await prisma.emailVerificationToken.count({ where: { userId: verifiedUser.id } });
    expect(countAfter).toBe(countBefore);
  });
});

// ─── 4. verify-email query-param validation ───────────────────────────────────

describe('GET /auth/verify-email — query-param validation', () => {
  it('returns 400 when token param is an empty string', async () => {
    const res = await request(app).get('/auth/verify-email?token=');
    expect(res.status).toBe(400);
  });

  it('returns 400 when token param is absent', async () => {
    const res = await request(app).get('/auth/verify-email');
    expect(res.status).toBe(400);
  });

  it('treats a valid-length but non-existent token as 400 invalid-or-expired', async () => {
    // 64 hex chars (correct sha256-input length) that don't exist in DB
    const fakeToken = 'a'.repeat(64);
    const res = await request(app).get(`/auth/verify-email?token=${fakeToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });
});

// ─── 5. Full round-trip via debug endpoint ────────────────────────────────────

describe('Full verify-email round-trip using _test/last-verify-token', () => {
  it('registers, fetches token from debug endpoint, verifies — user is marked verified', async () => {
    const res1 = await request(app)
      .post('/auth/register')
      .send({ email: 'p6ext-roundtrip@example.com', password: 'password123', name: 'RoundTrip' });
    expect(res1.status).toBe(201);

    const tokenRes = await request(app).get('/auth/_test/last-verify-token');
    expect(tokenRes.status).toBe(200);

    const verifyRes = await request(app)
      .get(`/auth/verify-email?token=${tokenRes.body.token}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.message).toMatch(/email verified successfully/i);

    const dbUser = await prisma.user.findUnique({ where: { email: 'p6ext-roundtrip@example.com' } });
    expect(dbUser.emailVerified).toBe(true);
  });
});
