const client = require('prom-client');

// Dedicated Prometheus Registry for TaskFlow
const register = new client.Registry();

// Add default system/process metrics (CPU, Memory RSS/Heap, GC, Event Loop Lag)
client.collectDefaultMetrics({
  register,
  prefix: 'taskflow_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2],
});

// ─── HTTP Metrics ─────────────────────────────────────────────────────────────
const httpRequestsTotal = new client.Counter({
  name: 'taskflow_http_requests_total',
  help: 'Total number of HTTP requests processed by TaskFlow',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'taskflow_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpActiveRequests = new client.Gauge({
  name: 'taskflow_http_active_requests',
  help: 'Current number of active in-flight HTTP requests',
  labelNames: ['method'],
  registers: [register],
});

// ─── AI Service & Token Metrics (Cost Firewall) ──────────────────────────────
const aiRequestsTotal = new client.Counter({
  name: 'taskflow_ai_requests_total',
  help: 'Total number of AI requests made to Gemini or fallback engine',
  labelNames: ['model', 'feature', 'status', 'key_type'],
  registers: [register],
});

const aiTokensTotal = new client.Counter({
  name: 'taskflow_ai_tokens_total',
  help: 'Total number of AI tokens consumed (input and output)',
  labelNames: ['model', 'feature', 'type'],
  registers: [register],
});

const aiRequestDurationSeconds = new client.Histogram({
  name: 'taskflow_ai_request_duration_seconds',
  help: 'Duration of AI generation requests in seconds',
  labelNames: ['model', 'feature'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30],
  registers: [register],
});

const aiErrorsTotal = new client.Counter({
  name: 'taskflow_ai_errors_total',
  help: 'Total number of AI execution errors categorized by type',
  labelNames: ['model', 'feature', 'error_type'],
  registers: [register],
});

// ─── Database & Query Performance Metrics ─────────────────────────────────────
const dbQueriesTotal = new client.Counter({
  name: 'taskflow_db_queries_total',
  help: 'Total database operations executed via Prisma',
  labelNames: ['operation', 'model', 'status'],
  registers: [register],
});

const dbQueryDurationSeconds = new client.Histogram({
  name: 'taskflow_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

// ─── Redis Caching & Session Store Metrics ────────────────────────────────────
const redisOperationsTotal = new client.Counter({
  name: 'taskflow_redis_operations_total',
  help: 'Total Redis operations categorized by operation and outcome (hit, miss, write, error, delete)',
  labelNames: ['operation', 'status'],
  registers: [register],
});

// ─── Auth & Security Event Metrics ────────────────────────────────────────────
const authEventsTotal = new client.Counter({
  name: 'taskflow_auth_events_total',
  help: 'Authentication and session events (login, register, logout, token_revocation)',
  labelNames: ['event', 'status'],
  registers: [register],
});

const rateLimitHitsTotal = new client.Counter({
  name: 'taskflow_rate_limit_hits_total',
  help: 'Total number of rate limit rejections',
  labelNames: ['endpoint'],
  registers: [register],
});

const securityEventsTotal = new client.Counter({
  name: 'taskflow_security_events_total',
  help: 'Security events such as Turnstile failure, RLS blocking, or input sanitization triggers',
  labelNames: ['event_type'],
  registers: [register],
});

// ─── Helper Recording Functions ───────────────────────────────────────────────

function recordHttpRequest({ method = 'GET', route = 'unknown', statusCode = 200, durationSeconds = 0 }) {
  const cleanMethod = String(method).toUpperCase();
  const cleanRoute = String(route || 'unknown');
  const cleanStatus = String(statusCode || 200);

  httpRequestsTotal.inc({ method: cleanMethod, route: cleanRoute, status_code: cleanStatus });
  httpRequestDurationSeconds.observe({ method: cleanMethod, route: cleanRoute, status_code: cleanStatus }, durationSeconds);
}

function incrementActiveRequests(method = 'GET') {
  httpActiveRequests.inc({ method: String(method).toUpperCase() });
}

function decrementActiveRequests(method = 'GET') {
  httpActiveRequests.dec({ method: String(method).toUpperCase() });
}

function recordAiRequest({ model = 'gemini-3.5-flash-lite', feature = 'unknown', status = 'success', keyType = 'system', durationSeconds = 0 }) {
  aiRequestsTotal.inc({ model, feature, status, key_type: keyType });
  if (durationSeconds > 0) {
    aiRequestDurationSeconds.observe({ model, feature }, durationSeconds);
  }
}

function recordAiTokens({ model = 'gemini-3.5-flash-lite', feature = 'unknown', inputTokens = 0, outputTokens = 0 }) {
  if (inputTokens > 0) {
    aiTokensTotal.inc({ model, feature, type: 'input' }, inputTokens);
  }
  if (outputTokens > 0) {
    aiTokensTotal.inc({ model, feature, type: 'output' }, outputTokens);
  }
}

function recordAiError({ model = 'gemini-3.5-flash-lite', feature = 'unknown', errorType = 'UNKNOWN' }) {
  aiErrorsTotal.inc({ model, feature, error_type: errorType });
}

function recordDbQuery({ operation = 'query', model = 'general', status = 'success', durationSeconds = 0 }) {
  dbQueriesTotal.inc({ operation, model, status });
  if (durationSeconds > 0) {
    dbQueryDurationSeconds.observe({ operation, model }, durationSeconds);
  }
}

function recordRedisOp({ operation = 'get', status = 'hit' }) {
  redisOperationsTotal.inc({ operation, status });
}

function recordAuthEvent({ event = 'login', status = 'success' }) {
  authEventsTotal.inc({ event, status });
}

function recordRateLimitHit(endpoint = 'unknown') {
  rateLimitHitsTotal.inc({ endpoint: String(endpoint) });
}

function recordSecurityEvent(eventType = 'general') {
  securityEventsTotal.inc({ event_type: String(eventType) });
}

async function getMetrics() {
  return register.metrics();
}

function getMetricsContentType() {
  return register.contentType;
}

function resetMetrics() {
  register.resetMetrics();
}

module.exports = {
  register,
  client,
  recordHttpRequest,
  incrementActiveRequests,
  decrementActiveRequests,
  recordAiRequest,
  recordAiTokens,
  recordAiError,
  recordDbQuery,
  recordRedisOp,
  recordAuthEvent,
  recordRateLimitHit,
  recordSecurityEvent,
  getMetrics,
  getMetricsContentType,
  resetMetrics,
  // Direct metric references for advanced inspection / testing
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpActiveRequests,
  aiRequestsTotal,
  aiTokensTotal,
  aiRequestDurationSeconds,
  aiErrorsTotal,
  dbQueriesTotal,
  dbQueryDurationSeconds,
  redisOperationsTotal,
  authEventsTotal,
  rateLimitHitsTotal,
  securityEventsTotal,
};
