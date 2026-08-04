/**
 * Password Reset Tests — Phase 5 Requirement
 *
 * Covers:
 *   1. POST /auth/forgot-password always returns 200 (prevents email enumeration)
 *   2. Email service is called with correct recipient and token (mocked)
 *   3. POST /auth/reset-password rejects expired tokens
 *   4. POST /auth/reset-password rejects already-used tokens
 *   5. Valid token successfully updates password
 */

const request  = require('supertest');
const express  = require('express');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');
const prisma   = require('../prisma');
const authRoutes = require('../routes/auth');

// Mock the email service before requiring auth routes
jest.mock('../services/email', () => ({
  sendPasswordResetEmail: jest.fn(),
}));

const { sendPasswordResetEmail } = require('../services/email');

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  return app;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let app;
let user;

async function makeUser(email, name, password = 'password123') {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.create({ data: { email, passwordHash, name } });
}

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  // Clear all test data before each test
  await prisma.passwordResetToken.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({});

  // Reset the mock
  sendPasswordResetEmail.mockClear();

  user = await makeUser('alice@example.com', 'Alice');
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /auth/forgot-password', () => {
  it('returns 200 even when email does not exist (prevents enumeration)', async () => {
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'nonexistent@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if that email is registered/i);

    // Email should NOT have been called
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('creates a reset token and calls the email service for a valid user', async () => {
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: user.email });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if that email is registered/i);

    // Email service should have been called with correct recipient
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      user.email,
      expect.any(String) // the raw token (64 hex chars)
    );

    // Verify token was stored in DB
    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).toBeNull();
    expect(tokens[0].expiresAt).toBeInstanceOf(Date);
  });

  it('invalidates any existing unused tokens when creating a new one', async () => {
    // Create an old unused token
    const oldTokenHash = crypto.createHash('sha256').update('old-token').digest('hex');
    await prisma.passwordResetToken.create({
      data: {
        tokenHash: oldTokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // Request a new reset
    await request(app)
      .post('/auth/forgot-password')
      .send({ email: user.email });

    // Old token should be deleted
    const oldToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: oldTokenHash },
    });
    expect(oldToken).toBeNull();

    // Only the new token should remain
    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(tokens).toHaveLength(1);
  });
});

describe('POST /auth/reset-password', () => {
  let rawToken;
  let tokenHash;

  beforeEach(async () => {
    // Create a valid token for the user
    rawToken  = crypto.randomBytes(32).toString('hex');
    tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      },
    });
  });

  it('rejects a token that does not exist in the DB', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'nonexistent-token-abcd1234', password: 'newpassword123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or expired/i);
  });

  it('rejects an expired token', async () => {
    // Update token to be expired
    await prisma.passwordResetToken.update({
      where: { tokenHash },
      data:  { expiresAt: new Date(Date.now() - 1000) }, // 1 second ago
    });

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: rawToken, password: 'newpassword123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it('rejects a token that has already been used', async () => {
    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { tokenHash },
      data:  { usedAt: new Date() },
    });

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: rawToken, password: 'newpassword123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been used/i);
  });

  it('successfully resets password with a valid token', async () => {
    const newPassword = 'brandnewpassword456';

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: rawToken, password: newPassword });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password updated successfully/i);

    // Verify password was updated
    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    const passwordMatches = await bcrypt.compare(newPassword, updatedUser.passwordHash);
    expect(passwordMatches).toBe(true);

    // Verify token was marked as used
    const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    expect(token.usedAt).not.toBeNull();
    expect(token.usedAt).toBeInstanceOf(Date);
  });

  it('does not allow reusing the same token after a successful reset', async () => {
    // First reset succeeds
    await request(app)
      .post('/auth/reset-password')
      .send({ token: rawToken, password: 'newpassword123' });

    // Second attempt with the same token fails
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: rawToken, password: 'anotherpassword789' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been used/i);
  });
});
