const { verifyTurnstileToken } = require('../services/turnstile');

/**
 * turnstileGuard.js — Express Middleware to enforce Cloudflare Turnstile verification
 * Checks req.body.turnstileToken or header 'x-turnstile-token'
 */
async function turnstileGuard(req, res, next) {
  // If TURNSTILE_SECRET_KEY is not configured (e.g. dev/test mode), allow request through
  if (!process.env.TURNSTILE_SECRET_KEY) {
    return next();
  }

  const token = req.body?.turnstileToken || req.headers['x-turnstile-token'];
  const clientIp = req.ip || req.connection?.remoteAddress;

  const result = await verifyTurnstileToken(token, clientIp);

  if (!result.success) {
    return res.status(400).json({
      error: 'CAPTCHA verification failed. Please refresh and try again.',
      code: 'TURNSTILE_FAILED',
      errorCodes: result.errorCodes || [],
    });
  }

  next();
}

module.exports = turnstileGuard;
