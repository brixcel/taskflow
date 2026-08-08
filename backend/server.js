// ─── Sentry instrumentation ───────────────────────────────────────────────────
// MUST be required before everything else so the SDK can patch http, express,
// prisma, etc. at module-load time. No-ops cleanly when SENTRY_DSN is absent.
const Sentry = require('./instrument');

require('dotenv').config();

// ─── Startup environment check ───────────────────────────────────────────────
// Fail loudly before the app does anything if required env vars are missing.
// This prevents the server from silently running in an insecure or broken state.
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'CORS_ORIGIN',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'EMAIL_FROM',
  'APP_URL',
];

const hasHttpProvider = Boolean(
  process.env.BREVO_API_KEY ||
  process.env.SENDINBLUE_API_KEY ||
  process.env.RESEND_API_KEY ||
  process.env.EMAIL_API_KEY
);
const requiredToCheck = hasHttpProvider
  ? ['DATABASE_URL', 'JWT_SECRET', 'CORS_ORIGIN', 'APP_URL']
  : REQUIRED_ENV_VARS;

const missing = requiredToCheck.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `[startup] Missing required environment variables:\n  ${missing.join('\n  ')}\n` +
    'Server will not start until these are set.'
  );
  process.exit(1);
}

const express        = require('express');
const cors           = require('cors');
const helmet         = require('helmet');
const rateLimit      = require('express-rate-limit');
const prisma         = require('./prisma');
const logger         = require('./middleware/logger');
const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const taskRoutes     = require('./routes/tasks');
const teamRoutes     = require('./routes/teams');
const commentRoutes  = require('./routes/comments');
const activityRoutes = require('./routes/activities');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Structured HTTP request logging ─────────────────────────────────────────
// Must come before routes so every request is logged.
app.use(logger.httpLogger);

// ─── Security headers ─────────────────────────────────────────────────────────
// helmet sets ~15 HTTP headers that guard against common web vulnerabilities
// (clickjacking, MIME sniffing, cross-origin leaks, etc.).
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow configured origins (comma-separated or single) and all *.vercel.app deployments.
const configuredOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests, mobile apps, or curl with no Origin header
    if (!origin) return callback(null, true);
    const normalized = origin.replace(/\/$/, '');
    try {
      const parsed = new URL(origin);
      if (
        configuredOrigins.includes(normalized) ||
        configuredOrigins.includes('*') ||
        parsed.hostname.endsWith('.vercel.app')
      ) {
        return callback(null, true);
      }
    } catch {
      // Fallback string matching if URL parsing fails
      if (configuredOrigins.includes(normalized)) return callback(null, true);
    }
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Team-Id'],
  credentials: true,
}));

// ─── Body parsing ────────────────────────────────────────────────────────────
// Cap request bodies at 10kb to limit memory exhaustion / DoS via large payloads.
app.use(express.json({ limit: '10kb' }));

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Applied only to the auth routes most susceptible to abuse.
//
// Login / register: 20 attempts per 15 minutes per IP.
//   Prevents brute-force credential stuffing.
//
// Forgot-password:  5 requests per 15 minutes per IP.
//   Tighter limit — prevents email-enumeration abuse where an attacker fires
//   thousands of requests to determine which addresses are registered.
//
// In test mode (NODE_ENV=test) limits are raised so the test suite never hits
// them accidentally, while still exercising the 429 path in dedicated tests.

const isTest = process.env.NODE_ENV === 'test';

const authRateLimiter = rateLimit({
  windowMs:          15 * 60 * 1000, // 15 minutes
  max:               isTest ? 1000 : 20,
  standardHeaders:   true,
  legacyHeaders:     false,
  message:           { error: 'Too many requests, please try again later.' },
  skipSuccessfulRequests: false,
});

const forgotPasswordRateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // 15 minutes
  max:             isTest ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many password reset requests, please try again later.' },
});

// ─── Health check ─────────────────────────────────────────────────────────────
// Checks real DB connectivity — not a hardcoded { status: "ok" }.
// Returns 200 when the DB responds and 503 when it doesn't.
// The /health path is intentionally exempt from rate limiting.

app.get('/health', async (req, res) => {
  try {
    // A lightweight query that exercises the connection pool without touching
    // any application table.
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    logger.error({ err }, 'Health check DB query failed');
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
// Rate limiters are applied per-path, before the route handler.

app.use('/auth/login',          authRateLimiter);
app.use('/auth/register',       authRateLimiter);
app.use('/auth/forgot-password', forgotPasswordRateLimiter);

app.use('/auth',  authRoutes);
app.use('/users', userRoutes);
app.use('/tasks', taskRoutes);
app.use('/teams', teamRoutes);

// Comments and activities are nested under tasks
app.use('/tasks/:taskId/comments',   commentRoutes);
app.use('/tasks/:taskId/activities', activityRoutes);

// ─── Test-error endpoint (non-production only) ───────────────────────────────
// Hitting GET /debug/sentry-test deliberately throws so you can verify that
// errors actually surface in the Sentry dashboard without touching real code.
// Stripped out entirely in production — never reachable by real users.
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug/sentry-test', (_req, _res) => {
    throw new Error('[Sentry test] Deliberate error — confirms error tracking is wired up');
  });
}

// ─── Sentry error handler ─────────────────────────────────────────────────────
// Must come AFTER all routes and BEFORE any other error-handling middleware.
// Captures unhandled exceptions thrown inside route handlers and forwards them
// to Sentry with full request context attached.
Sentry.setupExpressErrorHandler(app);

// ─── Global error handler ─────────────────────────────────────────────────────
// Catches anything Sentry didn't swallow and returns a clean 500 instead of
// leaking a stack trace to the client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  logger.error({ err }, 'Unhandled error');
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status < 500 ? err.message : 'Internal server error' });
});

// Only bind the port when this file is run directly (node server.js / nodemon).
// When required by tests, skip listen so supertest can manage its own port.
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, `Server running on port ${PORT}`);
  });
}

module.exports = app;
