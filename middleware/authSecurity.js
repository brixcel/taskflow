const rateLimit = require('express-rate-limit');
const logger = require('./logger');

// Known disposable / burner email domains used for spam registrations
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'throwawaymail.com',
  'yopmail.com',
  'sharklasers.com',
  'getairmail.com',
  'dispostable.com',
]);

/**
 * 1. Login Rate Limiter (Brute-Force & Credential Stuffing Protection)
 * Max 10 attempts per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please wait 15 minutes before trying again.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
});

/**
 * 2. Registration Rate Limiter (Anti-Account-Farming / Mass Signup Scripts)
 * Max 10 registrations per hour per IP
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many accounts created from this IP. Please try again later.',
    code: 'REGISTRATION_RATE_LIMIT_EXCEEDED',
  },
});

/**
 * 3. Invisible Honeypot Guard
 * Rejects automated bot scripts that automatically fill in hidden form fields.
 */
function honeypotGuard(req, res, next) {
  const honeypotVal = req.body.hp_company_url || req.body.hp_website || req.body.website;

  if (honeypotVal && typeof honeypotVal === 'string' && honeypotVal.trim().length > 0) {
    if (logger && logger.warn) {
      logger.warn({ ip: req.ip, honeypotVal }, 'Spam bot signup blocked via honeypot');
    }
    return res.status(400).json({
      error: 'Invalid registration submission.',
      code: 'BOT_DETECTED',
    });
  }
  next();
}

/**
 * 4. Disposable Email Guard
 * Rejects burner / disposable email domains commonly used by spam scripts.
 */
function disposableEmailGuard(req, res, next) {
  const email = (req.body.email || '').toLowerCase().trim();
  const domain = email.split('@')[1];

  if (domain && DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return res.status(400).json({
      error: 'Disposable email addresses are not permitted. Please use a valid email.',
      code: 'DISPOSABLE_EMAIL_REJECTED',
    });
  }
  next();
}

/**
 * 5. Human Submission Timing Guard
 * Blocks superhuman sub-second script submissions (< 400ms) in non-test mode.
 */
function timingGuard(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();

  const formTime = req.body._formTime;
  if (formTime) {
    const elapsedMs = Date.now() - Number(formTime);
    if (elapsedMs < 400 && elapsedMs >= 0) {
      return res.status(400).json({
        error: 'Registration submission completed too quickly. Please try again.',
        code: 'TIMING_ANOMALY_DETECTED',
      });
    }
  }
  next();
}

module.exports = {
  authLimiter,
  registerLimiter,
  honeypotGuard,
  disposableEmailGuard,
  timingGuard,
  DISPOSABLE_EMAIL_DOMAINS,
};
