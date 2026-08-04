const express  = require('express');
const bcrypt   = require('bcrypt');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const prisma   = require('../prisma');
const validate = require('../middleware/validate');
const schemas  = require('../validation/schemas');
const { sendPasswordResetEmail } = require('../services/email');

const router = express.Router();

// Token lifetime: 1 hour
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// ─── POST /auth/register ──────────────────────────────────────────────────────
//
// Body: { email, password, name, teamName? }
//
// Creates the user and a default team in a single transaction.
// The user becomes the team owner.
// Returns a JWT that includes the new teamId.

router.post('/register', validate(schemas.register), async (req, res) => {
  try {
    const { email, password, name, teamName } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Use a transaction so the user, team, and membership are all created
    // atomically — a partial failure leaves nothing behind.
    const resolvedTeamName = teamName || `${name}'s Team`;

    const { user, team } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { email, passwordHash, name },
      });

      const newTeam = await tx.team.create({
        data: {
          name:    resolvedTeamName,
          ownerId: newUser.id,
        },
      });

      await tx.teamMembership.create({
        data: {
          userId: newUser.id,
          teamId: newTeam.id,
          role:   'owner',
        },
      });

      return { user: newUser, team: newTeam };
    });

    const token = jwt.sign(
      { userId: user.id, teamId: team.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      user:  { id: user.id, email: user.email, name: user.name },
      team:  { id: team.id, name: team.name },
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message, stack: error.stack });
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
    if (!user) {
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
      user: { id: user.id, email: user.email, name: user.name },
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
//
// This endpoint returns the raw reset token for the most recent
// PasswordResetToken row in the database. It exists solely so the
// test-password-reset.sh script can retrieve the token without reading
// the database directly, since we only store the SHA-256 hash in prod.
//
// SAFETY GUARANTEE: the route returns 404 unless NODE_ENV === 'test'.
// Any other value — including 'development', 'staging', or production
// (where NODE_ENV is typically unset or 'production') — gets a 404.
// This means:
//   • The endpoint never ships enabled on a real server.
//   • Running the dev server normally (NODE_ENV=development) returns 404.
//   • CI and the test script must explicitly set NODE_ENV=test.
//
// DO NOT remove the NODE_ENV guard. DO NOT add this route to any
// production router. DO NOT log or expose raw tokens anywhere else.

router.get('/_test/last-reset-token', async (req, res) => {
  if (process.env.NODE_ENV !== 'test') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    // Find the most recently created unused token
    const record = await prisma.passwordResetToken.findFirst({
      orderBy: { expiresAt: 'desc' },
    });

    if (!record) {
      return res.status(404).json({ error: 'No reset token found' });
    }

    // We only store the hash, so we can't reverse it — instead, we store
    // the raw token temporarily in a module-level variable set by the
    // forgot-password handler when NODE_ENV=test.
    //
    // Return it from the in-memory store set during the forgot-password call.
    const raw = global.__lastResetTokenForTest__;
    if (!raw) {
      return res.status(404).json({ error: 'No raw token in memory — was forgot-password called first?' });
    }

    res.json({ token: raw, tokenId: record.id, expiresAt: record.expiresAt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;
