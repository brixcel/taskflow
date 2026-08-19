const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { redis, isRedisAvailable } = require('../config/redis');

/**
 * GET /health
 * General health check endpoint (backward-compatible).
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    requestId: req.id,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /health/live
 * Kubernetes / Container Liveness Probe.
 * Fast, shallow check to verify that the process is responsive.
 */
router.get('/live', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      rssMb: Math.round(mem.rss / (1024 * 1024)),
      heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024)),
      heapTotalMb: Math.round(mem.heapTotal / (1024 * 1024)),
    },
  });
});

/**
 * GET /health/ready
 * Kubernetes / Container Readiness Probe.
 * Deep dependency check verifying Database and Redis availability before routing traffic.
 */
router.get('/ready', async (req, res) => {
  const checks = {
    database: { status: 'unknown' },
    redis: { status: 'unknown' },
  };

  let isReady = true;

  // 1. Check Database Connectivity
  const dbStart = process.hrtime.bigint();
  try {
    // Run lightweight query to ensure connection pool and query engine are operational
    await prisma.$queryRaw`SELECT 1`;
    const dbEnd = process.hrtime.bigint();
    const dbLatencyMs = Number(dbEnd - dbStart) / 1e6;
    checks.database = {
      status: 'up',
      latencyMs: Math.round(dbLatencyMs * 100) / 100,
    };
  } catch (err) {
    isReady = false;
    checks.database = {
      status: 'down',
      error: 'Database connection failed',
    };
  }

  // 2. Check Redis Connectivity (Graceful Degradation if non-critical)
  const redisStart = process.hrtime.bigint();
  try {
    if (redis && typeof redis.get === 'function') {
      await redis.get('__health_ping__');
      const redisEnd = process.hrtime.bigint();
      const redisLatencyMs = Number(redisEnd - redisStart) / 1e6;
      checks.redis = {
        status: 'up',
        latencyMs: Math.round(redisLatencyMs * 100) / 100,
      };
    } else {
      checks.redis = {
        status: 'degraded',
        message: 'Redis client not initialized',
      };
    }
  } catch (err) {
    checks.redis = {
      status: 'degraded',
      error: 'Redis ping failed',
    };
  }

  const statusCode = isReady ? 200 : 503;
  return res.status(statusCode).json({
    status: isReady ? 'ok' : 'error',
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * POST /health/seed
 * Secure administrative database seeder for demo environments.
 * Requires x-admin-secret header matching ADMIN_SEED_SECRET or JWT_SECRET.
 */
router.post('/seed', async (req, res) => {
  try {
    const adminSecret = process.env.ADMIN_SEED_SECRET || process.env.JWT_SECRET;
    const providedSecret = req.headers['x-admin-secret'] || req.body?.adminSecret;

    if (!adminSecret || !providedSecret || providedSecret !== adminSecret) {
      return res.status(401).json({
        error: 'Unauthorized: missing or invalid administrative seed secret (x-admin-secret header required)',
      });
    }

    const { seedRealisticData } = require('../scripts/seed-test-data');
    await seedRealisticData();
    return res.json({
      success: true,
      message: 'Demo accounts and workspaces successfully seeded',
      accounts: [
        { email: 'owner@synctask.local', role: 'owner' },
        { email: 'admin@synctask.local', role: 'admin' },
        { email: 'dev@synctask.local', role: 'member' },
        { email: 'designer@synctask.local', role: 'member' },
        { email: 'qa@synctask.local', role: 'member' },
      ],
    });
  } catch (err) {
    console.error('Error in /health/seed:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
