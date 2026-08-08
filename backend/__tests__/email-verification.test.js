/**
 * Email Verification Tests — Phase 6 Requirement
 *
 * Covers:
 *   1. POST /auth/register sends a verification email and stores a token
 *   2. GET /auth/verify-email marks the user verified with a valid token
 *   3. GET /auth/verify-email rejects an expired token
 *   4. GET /auth/verify-email rejects an already-used token
 *   5. POST /auth/resend-verification creates a new token (invalidating the old one)
 *   6. POST /auth/resend-verification is a no-op for already-verified users
 *   7. POST /auth/login includes emailVerified in the response
 */

const request  = require('supertest');
const express  = require('express');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');
const prisma   = require('../prisma');
const authRoutes = require('../routes/auth');

// Mock the email service — we verify it's called, not that it actually sends
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let app;
let user;

async function makeUser(email, name, password = 'password123', emailVerified = false) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.create({ data: { email, passwordHash, name, emailVerified } });
}

async function makeVerifyToken(userId, { expired = false, used = false } = {}) {
  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = expired
    ? new Date(Date.now() - 1000)              // 1 second in the past
    : new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

  const record = await prisma.emailVerificationToken.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
      ...(used ? { usedAt: new Date() } : {}),
    },
  });

  return { rawToken, tokenHash, record };
}

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  // Clear all test data before each test
  await prisma.emailVerificationToken.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({});

  // Reset mocks
  sendVerificationEmail.mockClear();
  global.__lastVerifyTokenForTest__ = undefined;

  user = await makeUser('alice@example.com', 'Alice');
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── Registration ─────────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('sends a verification email after successful registration', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'bob@example.com', password: 'password123', name: 'Bob' });

    expect(res.status).toBe(201);

    // emailVerified should be false on fresh registration
    expect(res.body.user.emailVerified).toBe(false);

    // Email service should have been called with the correct recipient
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      'bob@example.com',
      expect.any(String),
    );

    // Token should be stored in the DB
    const newUser = await prisma.user.findUnique({ where: { email: 'bob@example.com' } });
    const tokens  = await prisma.emailVerificationToken.findMany({ where: { userId: newUser.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).toBeNull();
  });

  it('returns emailVerified: false in the registration response', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'carol@example.com', password: 'password123', name: 'Carol' });

    expect(res.status).toBe(201);
    expect(res.body.user).toHaveProperty('emailVerified', false);
  });
});

// ─── GET /auth/verify-email ───────────────────────────────────────────────────

describe('GET /auth/verify-email', () => {
  it('marks the user verified with a valid token', async () => {
    const { rawToken } = await makeVerifyToken(user.id);

    const res = await request(app)
      .get(`/auth/verify-email?token=${rawToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/email verified successfully/i);

    // User should now be verified
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated.emailVerified).toBe(true);
  });

  it('marks the token as used after successful verification', async () => {
    const { rawToken, tokenHash } = await makeVerifyToken(user.id);

    await request(app).get(`/auth/verify-email?token=${rawToken}`);

    const token = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    expect(token.usedAt).not.toBeNull();
    expect(token.usedAt).toBeInstanceOf(Date);
  });

  it('rejects an expired token', async () => {
    const { rawToken } = await makeVerifyToken(user.id, { expired: true });

    const res = await request(app)
      .get(`/auth/verify-email?token=${rawToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);

    // User should NOT be verified
    const unchanged = await prisma.user.findUnique({ where: { id: user.id } });
    expect(unchanged.emailVerified).toBe(false);
  });

  it('rejects an already-used token', async () => {
    const { rawToken } = await makeVerifyToken(user.id, { used: true });

    const res = await request(app)
      .get(`/auth/verify-email?token=${rawToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been used/i);
  });

  it('rejects a token that does not exist', async () => {
    const res = await request(app)
      .get('/auth/verify-email?token=nonexistent-token-abcdef1234567890');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('returns 400 when token query param is missing', async () => {
    const res = await request(app).get('/auth/verify-email');

    expect(res.status).toBe(400);
  });

  it('returns idempotent 200 when token is reused for an already-verified user', async () => {
    const { rawToken } = await makeVerifyToken(user.id);

    // First use succeeds
    const first = await request(app).get(`/auth/verify-email?token=${rawToken}`);
    expect(first.status).toBe(200);

    // Second use is idempotent (returns 200 with already verified message)
    const second = await request(app).get(`/auth/verify-email?token=${rawToken}`);
    expect(second.status).toBe(200);
    expect(second.body.message).toMatch(/already verified/i);
  });
});

// ─── POST /auth/resend-verification ──────────────────────────────────────────

describe('POST /auth/resend-verification', () => {
  it('sends a new verification email for an unverified user', async () => {
    const res = await request(app)
      .post('/auth/resend-verification')
      .send({ email: user.email });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if that email is registered/i);

    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      user.email,
      expect.any(String),
    );
  });

  it('invalidates the old token when resending', async () => {
    const { tokenHash: oldHash } = await makeVerifyToken(user.id);

    await request(app)
      .post('/auth/resend-verification')
      .send({ email: user.email });

    // Old token should be gone
    const oldRecord = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: oldHash },
    });
    expect(oldRecord).toBeNull();

    // A new token should exist
    const tokens = await prisma.emailVerificationToken.findMany({
      where: { userId: user.id },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).toBeNull();
  });

  it('is a no-op (200) for an already-verified user', async () => {
    const verifiedUser = await makeUser('verified@example.com', 'Verified', 'password123', true);

    const res = await request(app)
      .post('/auth/resend-verification')
      .send({ email: verifiedUser.email });

    expect(res.status).toBe(200);
    // Email service should NOT be called
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('returns 200 even when the email is not registered (prevents enumeration)', async () => {
    const res = await request(app)
      .post('/auth/resend-verification')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if that email is registered/i);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});

// ─── POST /auth/login — emailVerified in response ────────────────────────────

describe('POST /auth/login', () => {
  it('includes emailVerified: false for an unverified user', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('emailVerified', false);
  });

  it('includes emailVerified: true for a verified user', async () => {
    const verifiedUser = await makeUser('dave@example.com', 'Dave', 'password123', true);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: verifiedUser.email, password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('emailVerified', true);
  });
});
