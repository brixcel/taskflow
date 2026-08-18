const request = require('supertest');
const { app } = require('../server');
const prisma = require('../prisma');
const {
  getMetrics,
  getMetricsContentType,
  resetMetrics,
  recordHttpRequest,
  recordAiRequest,
  recordAiTokens,
  recordAiError,
  recordDbQuery,
  recordRedisOp,
  recordAuthEvent,
} = require('../services/metrics');
const { normalizePath } = require('../middleware/metricsMiddleware');
const {
  generateTaskFromPrompt,
  breakdownTaskIntoSubtasks,
  generateProjectPlan,
  generateProductivityInsights,
  interpretNaturalSearchPrompt,
} = require('../services/ai');
const { getOrSet, invalidate } = require('../services/cache');

describe('Phase 41: Production Observability & Prometheus Metrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  // ─── 1. Prometheus Metrics Exposition (/metrics) ───────────────────────────
  describe('1. Prometheus Metrics Endpoint (/metrics)', () => {
    it('returns 200 with standard Prometheus text/plain content type', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(typeof res.text).toBe('string');
      expect(res.text.length).toBeGreaterThan(50);
    });

    it('exposes default Node.js process and memory telemetry', async () => {
      const metricsText = await getMetrics();
      // Should include default Prometheus Node.js process metrics
      expect(metricsText).toContain('taskflow_process_cpu_');
      expect(metricsText).toContain('taskflow_process_resident_memory_bytes');
      expect(metricsText).toContain('taskflow_nodejs_heap_size_total_bytes');
    });

    it('exposes registered custom TaskFlow metric definitions and HELP comments', async () => {
      const metricsText = await getMetrics();
      expect(metricsText).toContain('# HELP taskflow_http_requests_total');
      expect(metricsText).toContain('# TYPE taskflow_http_requests_total counter');
      expect(metricsText).toContain('# HELP taskflow_http_request_duration_seconds');
      expect(metricsText).toContain('# TYPE taskflow_http_request_duration_seconds histogram');
      expect(metricsText).toContain('# HELP taskflow_ai_requests_total');
      expect(metricsText).toContain('# HELP taskflow_ai_tokens_total');
      expect(metricsText).toContain('# HELP taskflow_db_queries_total');
      expect(metricsText).toContain('# HELP taskflow_redis_operations_total');
    });
  });

  // ─── 2. HTTP Traffic Telemetry & Route Normalization ───────────────────────
  describe('2. HTTP Traffic Telemetry & Route Normalization', () => {
    it('records HTTP request counts, status codes, and duration on incoming traffic', async () => {
      await request(app).get('/health');
      await request(app).get('/health/live');

      const metricsText = await getMetrics();
      expect(metricsText).toContain('taskflow_http_requests_total');
      expect(metricsText).toContain('route="/health"');
      expect(metricsText).toContain('status_code="200"');
    });

    it('tracks 404 and client error status codes correctly', async () => {
      await request(app).get('/unmatched-probe-subpath-404');

      const metricsText = await getMetrics();
      expect(metricsText).toContain('status_code="404"');
    });

    it('normalizes parameterized URLs to prevent Prometheus label cardinality explosion', () => {
      // UUID normalization
      expect(normalizePath('/tasks/123e4567-e89b-12d3-a456-426614174000')).toBe('/tasks/:id');
      expect(normalizePath('/teams/123e4567-e89b-12d3-a456-426614174000/projects')).toBe('/teams/:id/projects');

      // Numeric ID normalization
      expect(normalizePath('/tasks/98765')).toBe('/tasks/:id');
      expect(normalizePath('/users/42/settings')).toBe('/users/:id/settings');

      // CUID normalization
      expect(normalizePath('/tasks/cm123456789012345678901234')).toBe('/tasks/:id');

      // Long token normalization
      expect(normalizePath('/verify-email?token=abcdef0123456789abcdef0123456789')).toBe('/verify-email');
      expect(normalizePath('/reset-password/abcdef0123456789abcdef0123456789')).toBe('/reset-password/:token');

      // Root path
      expect(normalizePath('/')).toBe('/');
      expect(normalizePath('')).toBe('/');
    });
  });

  // ─── 3. AI Token & Cost Firewall Telemetry ─────────────────────────────────
  describe('3. AI Token & Request Telemetry (Cost Firewall)', () => {
    it('records AI requests and token counts during task generation', async () => {
      const result = await generateTaskFromPrompt({
        prompt: 'Build high-converting checkout landing page for marketing team',
      });

      expect(result).toBeDefined();
      expect(result.title).toBeDefined();

      const metricsText = await getMetrics();
      expect(metricsText).toContain('taskflow_ai_requests_total');
      expect(metricsText).toContain('feature="generateTaskFromPrompt"');
      expect(metricsText).toContain('taskflow_ai_tokens_total');
      expect(metricsText).toContain('type="input"');
      expect(metricsText).toContain('type="output"');
    });

    it('records AI breakdown, planner, and productivity insight operations', async () => {
      await breakdownTaskIntoSubtasks({
        title: 'Deploy Kubernetes cluster',
        description: 'Set up ingress controller and cert-manager',
      });

      await generateProjectPlan({
        prompt: 'Launch SaaS mobile client',
        timeframeWeeks: 4,
      });

      await interpretNaturalSearchPrompt({
        prompt: 'show high priority tasks assigned to me due this week',
      });

      const metricsText = await getMetrics();
      expect(metricsText).toContain('feature="breakdownTaskIntoSubtasks"');
      expect(metricsText).toContain('feature="generateProjectPlan"');
      expect(metricsText).toContain('feature="interpretNaturalSearchPrompt"');
    });

    it('records AI error categorization into Prometheus error counters', async () => {
      recordAiError({
        model: 'gemini-3.5-flash-lite',
        feature: 'generateTaskFromPrompt',
        errorType: 'RATE_LIMIT_EXCEEDED',
      });

      const metricsText = await getMetrics();
      expect(metricsText).toContain('taskflow_ai_errors_total');
      expect(metricsText).toContain('error_type="RATE_LIMIT_EXCEEDED"');
    });
  });

  // ─── 4. Redis Caching Telemetry ────────────────────────────────────────────
  describe('4. Redis Caching Telemetry', () => {
    it('records cache hits, misses, writes, and invalidations', async () => {
      const testKey = 'cache:test:metrics:sample';

      // 1. Initial getOrSet -> Cache Miss + Cache Write
      let fetchCount = 0;
      const val1 = await getOrSet(testKey, 60, async () => {
        fetchCount++;
        return { message: 'hello from db' };
      });
      expect(val1.message).toBe('hello from db');
      expect(fetchCount).toBe(1);

      // 2. Second getOrSet -> Cache Hit
      const val2 = await getOrSet(testKey, 60, async () => {
        fetchCount++;
        return { message: 'should not be called' };
      });
      expect(val2.message).toBe('hello from db');
      expect(fetchCount).toBe(1);

      // 3. Invalidate -> Cache Delete
      await invalidate(testKey);

      const metricsText = await getMetrics();
      expect(metricsText).toContain('taskflow_redis_operations_total');
      expect(metricsText).toContain('operation="get",status="miss"');
      expect(metricsText).toContain('operation="get",status="hit"');
      expect(metricsText).toContain('operation="set",status="write"');
      expect(metricsText).toContain('operation="del",status="delete"');
    });
  });

  // ─── 5. Cloud Liveness Probe (/health/live) ────────────────────────────────
  describe('5. Cloud Liveness Probe (/health/live)', () => {
    it('returns 200 OK with process uptime and memory telemetry', async () => {
      const res = await request(app).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.memory).toBeDefined();
      expect(typeof res.body.memory.rssMb).toBe('number');
      expect(typeof res.body.memory.heapUsedMb).toBe('number');
    });
  });

  // ─── 6. Cloud Readiness Probe (/health/ready) ──────────────────────────────
  describe('6. Cloud Readiness Probe (/health/ready)', () => {
    it('returns 200 OK with healthy database and Redis status reports', async () => {
      const res = await request(app).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.database.status).toBe('up');
      expect(typeof res.body.checks.database.latencyMs).toBe('number');
      expect(res.body.checks.redis.status).toMatch(/up|degraded/);
    });

    it('returns 503 Service Unavailable if database connectivity fails', async () => {
      // Mock prisma.$queryRaw to simulate a database outage
      const originalQueryRaw = prisma.$queryRaw;
      prisma.$queryRaw = jest.fn().mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));

      try {
        const res = await request(app).get('/health/ready');
        expect(res.status).toBe(503);
        expect(res.body.status).toBe('error');
        expect(res.body.checks.database.status).toBe('down');
        expect(res.body.checks.database.error).toBeDefined();
      } finally {
        prisma.$queryRaw = originalQueryRaw;
      }
    });
  });

  // ─── 7. Backward Compatibility & Edge Cases ────────────────────────────────
  describe('7. Backward Compatibility & Edge Cases', () => {
    it('preserves backward compatibility of legacy /health endpoint', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.requestId).toBeDefined();
    });

    it('handles concurrent metric scrapes without race conditions', async () => {
      const scrapePromises = Array.from({ length: 10 }, () => request(app).get('/metrics'));
      const responses = await Promise.all(scrapePromises);

      for (const res of responses) {
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/plain/);
        expect(res.text).toContain('taskflow_http_requests_total');
      }
    });
  });
});
