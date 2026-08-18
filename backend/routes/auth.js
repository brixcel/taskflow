const express  = require('express');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const prisma   = require('../prisma');
const validate = require('../middleware/validate');
const schemas  = require('../validation/schemas');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/email');
const {
  createSession,
  revokeSession,
  revokeOtherSessions,
  revokeAllUserSessions,
  listUserSessions,
} = require('../services/session');
const requireAuth = require('../middleware/auth');
const {
  authLimiter,
  registerLimiter,
  honeypotGuard,
  disposableEmailGuard,
  timingGuard,
} = require('../middleware/authSecurity');
const turnstileGuard = require('../middleware/turnstileGuard');
const logger = require('../middleware/logger');
const { recordAuthEvent } = require('../services/metrics');

const router = express.Router();

// Token lifetimes: 1 hour for reset, 24 hours for email verification
const RESET_TOKEN_TTL_MS  = 60 * 60 * 1000;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// ─── POST /auth/register ──────────────────────────────────────────────────────
//
// Body: { email, password, name, teamName? }
//
// Creates the user and a default team if teamName is provided.
// Generates an email verification token and dispatches the verification email.
// Returns a JWT and user object with emailVerified: false.

router.post(
  '/register',
  registerLimiter,
  honeypotGuard,
  disposableEmailGuard,
  timingGuard,
  turnstileGuard,
  validate(schemas.register),
  async (req, res, next) => {
    try {
      const { email, password, name, teamName } = req.body;

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(409).json({ error: 'A user with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: { email, passwordHash, name, emailVerified: false },
      });

      let defaultTeam = null;
      if (teamName) {
        defaultTeam = await prisma.team.create({
          data: {
            name: teamName,
            ownerId: user.id,
            memberships: {
              create: { userId: user.id, role: 'owner' },
            },
          },
        });
      }

      // Generate email verification token
      const rawToken  = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);

      await prisma.emailVerificationToken.create({
        data: { tokenHash, userId: user.id, expiresAt },
      });

      if (process.env.NODE_ENV === 'test') {
        global.__lastVerifyTokenForTest__ = rawToken;
      }

      // Send verification email
      await sendVerificationEmail(user.email, rawToken);

      // Create Server-Side Session in Redis
      const sessionId = await createSession({
        userId: user.id,
        teamId: defaultTeam ? defaultTeam.id : null,
        userAgent: req.headers['user-agent'] || '',
        ipAddress: req.ip || '127.0.0.1',
      });

      const token = jwt.sign(
        {
          userId: user.id,
          sid: sessionId,
          ...(defaultTeam ? { teamId: defaultTeam.id } : {}),
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      recordAuthEvent({ event: 'register', status: 'success' });

      res.status(201).json({
        user:  { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified },
        token,
      });
    } catch (error) {
      if (logger && logger.error) logger.error({ err: error }, 'POST /auth/register error');
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  }
);

// ─── POST /auth/login ─────────────────────────────────────────────────────────
//
// Returns a JWT containing both userId and the user's first (default) teamId,
// and includes emailVerified in user object for frontend banner display.

router.post('/login', authLimiter, turnstileGuard, validate(schemas.login), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      recordAuthEvent({ event: 'login', status: 'failed' });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      recordAuthEvent({ event: 'login', status: 'failed' });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Load the user's first team membership (oldest join date = default team).
    const membership = await prisma.teamMembership.findFirst({
      where:   { userId: user.id },
      orderBy: { joinedAt: 'asc' },
      include: { team: true },
    });

    // Create Server-Side Session in Redis
    const sessionId = await createSession({
      userId: user.id,
      teamId: membership ? membership.teamId : null,
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || '127.0.0.1',
    });

    const token = jwt.sign(
      {
        userId: user.id,
        sid: sessionId,
        // Include teamId if available; resolveTeam middleware can also derive it.
        ...(membership ? { teamId: membership.teamId } : {}),
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    recordAuthEvent({ event: 'login', status: 'success' });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: Boolean(user.emailVerified),
      },
      team: membership
        ? { id: membership.team.id, name: membership.team.name }
        : null,
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /auth/sessions — List Active Sessions & Devices ────────────

router.get('/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await listUserSessions(req.userId, req.sessionId);
    res.json({ sessions });
  } catch (error) {
    console.error('GET /auth/sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
});

// ─── POST /auth/logout — Revoke Current Session ───────────────────

router.post('/logout', requireAuth, async (req, res) => {
  try {
    if (req.sessionId) {
      await revokeSession(req.sessionId, req.userId);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('POST /auth/logout error:', error);
    res.status(500).json({ error: 'Failed to log out' });
  }
});

// ─── POST /auth/logout-all — Revoke All Sessions Across Devices ────

router.post('/logout-all', requireAuth, async (req, res) => {
  try {
    const count = await revokeAllUserSessions(req.userId);
    res.json({ success: true, message: `Signed out of ${count} active session(s)` });
  } catch (error) {
    console.error('POST /auth/logout-all error:', error);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

// ─── POST /auth/sessions/revoke-others — Revoke All Other Sessions ───────────

router.post('/sessions/revoke-others', requireAuth, async (req, res) => {
  try {
    const count = await revokeOtherSessions(req.userId, req.sessionId);
    res.json({
      success: true,
      message: `Signed out of ${count} other active session(s)`,
      revokedCount: count,
    });
  } catch (error) {
    console.error('POST /auth/sessions/revoke-others error:', error);
    res.status(500).json({ error: 'Failed to revoke other sessions' });
  }
});

// ─── DELETE & POST /auth/sessions/:sessionId — Revoke Remote Session ────────

const handleRevokeSingleSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await revokeSession(sessionId, req.userId);
    if (result.notFound) {
      return res.status(404).json({ error: 'Session not found or already revoked' });
    }
    if (result.forbidden) {
      return res.status(403).json({ error: 'You are not authorized to revoke this session' });
    }
    res.json({ success: true, message: 'Session revoked successfully' });
  } catch (error) {
    console.error('Revoke session error:', error);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
};

router.delete('/sessions/:sessionId', requireAuth, handleRevokeSingleSession);
router.post('/sessions/:sessionId/revoke', requireAuth, handleRevokeSingleSession);

// ─── GET /auth/verify-email ───────────────────────────────────────────────────
//
// Query: ?token=<raw_token>
//
// Validates token hash, expiry, used status, and marks user as emailVerified: true.

router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'Verification token is required.' });
    }

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record) {
      return res.status(400).json({ error: 'Invalid or expired verification token.' });
    }

    // Idempotent: if user is already verified, return success
    if (record.user?.emailVerified) {
      return res.json({ message: 'Your email address is already verified.' });
    }

    if (record.usedAt !== null) {
      return res.status(400).json({ error: 'This verification link has already been used.' });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'This verification link has expired.' });
    }

    // Atomically mark user verified and token as used
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

    res.json({ message: 'Email verified successfully! Your account is now fully active.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── POST /auth/resend-verification ───────────────────────────────────────────
//
// Body: { email }
//
// Always returns 200 to prevent email enumeration.
// If unverified, invalidates older unused tokens and sends a new link.

router.post('/resend-verification', validate(schemas.resendVerification), async (req, res) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    // Respond 200 even when no user found or user already verified — prevents email enumeration
    if (!user || user.emailVerified) {
      return res.json({ message: 'If that email is registered, a verification link has been sent.' });
    }

    // Invalidate any existing unused tokens for this user
    await prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    // Generate raw token and its hash
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

    res.json({ message: 'If that email is registered, a verification link has been sent.' });
  } catch (error) {
    console.error(error);
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
    // return it without us needing to reverse the hash.
    if (process.env.NODE_ENV === 'test') {
      global.__lastResetTokenForTest__ = rawToken;
    }

    await sendPasswordResetEmail(user.email, rawToken);

    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (error) {
    console.error(error);
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
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /auth/_test/last-reset-token ────────────────────────────────────────
//
// ⚠️  TEST-ONLY ENDPOINT — MUST NEVER BE REACHABLE IN PRODUCTION ⚠️

router.get('/_test/last-reset-token', async (req, res) => {
  if (process.env.NODE_ENV !== 'test') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const raw = global.__lastResetTokenForTest__;
    if (!raw) {
      return res.status(404).json({ error: 'No raw token in memory — was forgot-password called first?' });
    }

    const record = await prisma.passwordResetToken.findFirst({
      orderBy: { expiresAt: 'desc' },
    });

    if (!record) {
      return res.status(404).json({ error: 'No reset token found' });
    }

    res.json({ token: raw, tokenId: record.id, expiresAt: record.expiresAt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /auth/_test/last-verify-token ───────────────────────────────────────
//
// ⚠️  TEST-ONLY ENDPOINT — MUST NEVER BE REACHABLE IN PRODUCTION ⚠️

router.get('/_test/last-verify-token', async (req, res) => {
  if (process.env.NODE_ENV !== 'test') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const raw = global.__lastVerifyTokenForTest__;
    if (!raw) {
      return res.status(404).json({ error: 'No raw token in memory — was register or resend called first?' });
    }

    const record = await prisma.emailVerificationToken.findFirst({
      orderBy: { expiresAt: 'desc' },
    });

    if (!record) {
      return res.status(404).json({ error: 'No verification token found' });
    }

    res.json({ token: raw, tokenId: record.id, expiresAt: record.expiresAt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;
