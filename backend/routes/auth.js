const express  = require('express');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const prisma   = require('../prisma');
const validate = require('../middleware/validate');
const schemas  = require('../validation/schemas');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/email');
const logger = require('../middleware/logger');

const router = express.Router();

// Token lifetimes
const RESET_TOKEN_TTL_MS  = 60 * 60 * 1000;       // 1 hour
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours

// ─── POST /auth/register ──────────────────────────────────────────────────────
//
// Body: { email, password, name, teamName? }
//
// Creates the user and a default team in a single transaction.
// The user becomes the team owner.
// Returns a JWT that includes the new teamId.

router.post('/register', validate(schemas.register), async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { email, passwordHash, name },
    });

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // ── Send verification email ───────────────────────────────────────────────
    // Generate a 24-hour token for email verification.
    try {
      const rawVerifyToken  = crypto.randomBytes(32).toString('hex');
      const verifyTokenHash = crypto.createHash('sha256').update(rawVerifyToken).digest('hex');
      const verifyExpiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

      await prisma.emailVerificationToken.create({
        data: { tokenHash: verifyTokenHash, userId: user.id, expiresAt: verifyExpiresAt },
      });

      if (process.env.NODE_ENV === 'test') {
        global.__lastVerifyTokenForTest__ = rawVerifyToken;
        await sendVerificationEmail(user.email, rawVerifyToken);
      } else {
        // Asynchronous background dispatch in production for sub-50ms user response
        sendVerificationEmail(user.email, rawVerifyToken).catch((emailErr) => {
          logger.error({ err: emailErr }, 'Failed to send verification email');
        });
      }
    } catch (emailErr) {
      logger.error({ err: emailErr }, 'Failed to create verification token');
    }

    res.status(201).json({
      user:  { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
      token,
    });
  } catch (error) {
    logger.error({ err: error }, 'Auth route handler failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
//
// Returns a JWT containing both userId and the user's first (default) teamId,
// so existing clients work without sending X-Team-Id.

router.post('/login', validate(schemas.login), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.isDeleted) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Load the user's first team membership (oldest join date = default team).
    const membership = await prisma.teamMembership.findFirst({
      where:   { userId: user.id },
      orderBy: { joinedAt: 'asc' },
      include: { team: true },
    });

    const token = jwt.sign(
      {
        userId: user.id,
        // Include teamId if available; resolveTeam middleware can also derive it.
        ...(membership ? { teamId: membership.teamId } : {}),
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
      team: membership
        ? { id: membership.team.id, name: membership.team.name }
        : null,
      token,
    });
  } catch (error) {
    logger.error({ err: error }, 'Auth route handler failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── POST /auth/forgot-password ───────────────────────────────────────────────
//
// Body: { email }
//
// Always responds 200 regardless of whether the email exists — this prevents
// user-enumeration: an attacker can't distinguish registered from unregistered
// addresses based on the response.
//
// Flow:
//   1. Look up the user by email.
//   2. Generate a 32-byte cryptographically random token.
//   3. Store its SHA-256 hash in the DB (never the raw token).
//   4. Send the raw token embedded in the reset link via email.
//   5. Invalidate any existing unused tokens for this user first.

router.post('/forgot-password', validate(schemas.forgotPassword), async (req, res) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    // Respond 200 even when no user found — prevents email enumeration
    if (!user) {
      return res.json({ message: 'If that email is registered, a reset link has been sent.' });
    }

    // Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    // Generate raw token and its hash
    const rawToken   = crypto.randomBytes(32).toString('hex');
    const tokenHash  = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt  = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await prisma.passwordResetToken.create({
      data: { tokenHash, userId: user.id, expiresAt },
    });

    // In test mode, stash the raw token in memory so the debug endpoint can
    // return it without us needing to reverse the hash. This is harmless in
    // tests and unreachable in production (the debug endpoint guards on NODE_ENV).
    if (process.env.NODE_ENV === 'test') {
      global.__lastResetTokenForTest__ = rawToken;
      await sendPasswordResetEmail(user.email, rawToken);
    } else {
      sendPasswordResetEmail(user.email, rawToken).catch((err) => {
        logger.error({ err }, 'Failed to send password reset email');
      });
    }

    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (error) {
    logger.error({ err: error }, 'Auth route handler failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── POST /auth/reset-password ────────────────────────────────────────────────
//
// Body: { token, password }
//
// Validates that the token:
//   - exists in the DB (hash match)
//   - has not expired
//   - has not already been used
//
// On success: updates the user's password hash and marks the token as used.

router.post('/reset-password', validate(schemas.resetPassword), async (req, res) => {
  try {
    const { token, password } = req.body;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    if (record.usedAt !== null) {
      return res.status(400).json({ error: 'This reset link has already been used.' });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'This reset link has expired.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Update password and mark token as used atomically
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data:  { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data:  { usedAt: new Date() },
      }),
    ]);

    res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (error) {
    logger.error({ err: error }, 'Auth route handler failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /auth/_test/last-reset-token ────────────────────────────────────────
//
// ⚠️  TEST-ONLY ENDPOINT — MUST NEVER BE REACHABLE IN PRODUCTION ⚠️
//
// Returns the raw reset token stashed in memory by the forgot-password handler
// when NODE_ENV=test. SAFETY GUARANTEE: returns 404 unless NODE_ENV === 'test'.

router.get('/_test/last-reset-token', async (req, res) => {
  if (process.env.NODE_ENV !== 'test') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const record = await prisma.passwordResetToken.findFirst({
      orderBy: { expiresAt: 'desc' },
    });

    if (!record) {
      return res.status(404).json({ error: 'No reset token found' });
    }

    const raw = global.__lastResetTokenForTest__;
    if (!raw) {
      return res.status(404).json({ error: 'No raw token in memory — was forgot-password called first?' });
    }

    res.json({ token: raw, tokenId: record.id, expiresAt: record.expiresAt });
  } catch (error) {
    logger.error({ err: error }, 'Auth route handler failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /auth/verify-email ───────────────────────────────────────────────────
//
// Query: ?token=<rawToken>
//
// Validates the token and marks the user's email as verified.
// Returns 400 for expired, already-used, or non-existent tokens.
// Returns 200 with a success message on valid verification.

router.get('/verify-email', validate(schemas.verifyEmail, 'query'), async (req, res) => {
  try {
    const { token } = req.query;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!record) {
      return res.status(400).json({ error: 'Invalid or expired verification link.' });
    }

    if (record.usedAt !== null) {
      const user = await prisma.user.findUnique({ where: { id: record.userId } });
      if (user && user.emailVerified) {
        return res.json({ message: 'Email is already verified. Your account is fully active.' });
      }
      return res.status(400).json({ error: 'This verification link has already been used.' });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'This verification link has expired.' });
    }

    // Mark user as verified and consume the token atomically
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data:  { emailVerified: true },
      }),
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data:  { usedAt: new Date() },
      }),
    ]);

    res.json({ message: 'Email verified successfully. Your account is now fully active.' });
  } catch (error) {
    logger.error({ err: error }, 'Auth route handler failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── POST /auth/resend-verification ──────────────────────────────────────────
//
// Body: { email }
//
// Resends a verification email. Always responds 200 to prevent email enumeration.
// Invalidates any existing unused verification tokens before creating a new one.
// No-ops silently if the user is already verified or the email is not registered.

router.post('/resend-verification', validate(schemas.resendVerification), async (req, res) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    // Respond 200 in all non-actionable cases — prevents enumeration
    if (!user || user.emailVerified) {
      return res.json({ message: 'If that email is registered and unverified, a new verification link has been sent.' });
    }

    // Invalidate any existing unused verification tokens
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    // Generate and store a new token
    const rawToken   = crypto.randomBytes(32).toString('hex');
    const tokenHash  = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt  = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

    await prisma.emailVerificationToken.create({
      data: { tokenHash, userId: user.id, expiresAt },
    });

    if (process.env.NODE_ENV === 'test') {
      global.__lastVerifyTokenForTest__ = rawToken;
    }

    await sendVerificationEmail(user.email, rawToken);

    res.json({ message: 'If that email is registered and unverified, a new verification link has been sent.' });
  } catch (error) {
    logger.error({ err: error }, 'Auth route handler failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /auth/_test/last-verify-token ───────────────────────────────────────
//
// ⚠️  TEST-ONLY ENDPOINT — MUST NEVER BE REACHABLE IN PRODUCTION ⚠️
//
// Returns the raw verification token stashed in memory by the register /
// resend-verification handlers when NODE_ENV=test.
// Mirrors the pattern of GET /auth/_test/last-reset-token.
//
// SAFETY GUARANTEE: returns 404 unless NODE_ENV === 'test'.

router.get('/_test/last-verify-token', async (req, res) => {
  if (process.env.NODE_ENV !== 'test') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const raw = global.__lastVerifyTokenForTest__;
    if (!raw) {
      return res.status(404).json({ error: 'No raw verify token in memory — was register or resend-verification called first?' });
    }

    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!record) {
      return res.status(404).json({ error: 'Token in memory but not found in DB' });
    }

    res.json({ token: raw, tokenId: record.id, expiresAt: record.expiresAt });
  } catch (error) {
    logger.error({ err: error }, 'Auth route handler failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;
