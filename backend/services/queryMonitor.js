/**
 * Query Performance & Slow Query Monitoring Service (Phase 40 & Phase 41 Observability)
 *
 * Tracks query execution metrics, detects slow queries exceeding the threshold,
 * sanitizes logged parameters to prevent secret leakage, and provides Prometheus telemetry.
 */

const logger = require('../middleware/logger');
const { recordDbQuery } = require('./metrics');

// Configurable threshold (ms) — queries taking longer than this are logged as warnings
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS, 10) || 100;

// In-memory query performance statistics
const queryStats = {
  totalQueries: 0,
  slowQueries: 0,
  totalDurationMs: 0,
  slowestQuery: null,
  recentSlowQueries: [],
};

const MAX_RECENT_SLOW_QUERIES = 20;

// Keys that must be sanitized/redacted from logged query args
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'tokenhash',
  'customgeminikey',
  'secret',
  'webhooksecret',
  'keyhash',
  'authorization',
]);

/**
 * Deep-sanitizes arguments object to mask sensitive credentials.
 */
function sanitizeArgs(obj, depth = 0) {
  if (!obj || depth > 4) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeArgs(item, depth + 1));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeArgs(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Records query execution metrics and logs slow queries.
 *
 * @param {string} model - Prisma model name (e.g. 'Task')
 * @param {string} operation - Prisma operation name (e.g. 'findMany')
 * @param {number} durationMs - Execution time in milliseconds
 * @param {Object} [args] - Query arguments
 */
function recordQueryMetric(model, operation, durationMs, args) {
  queryStats.totalQueries += 1;
  queryStats.totalDurationMs += durationMs;

  const isSlow = durationMs >= SLOW_QUERY_THRESHOLD_MS;

  // Record into Prometheus DB query metrics
  try {
    recordDbQuery({
      operation: operation || 'query',
      model: model || 'raw',
      status: isSlow ? 'slow' : 'success',
      durationSeconds: Math.max(0, (durationMs || 0) / 1000),
    });
  } catch (_) {}

  if (isSlow) {
    queryStats.slowQueries += 1;
    const slowRecord = {
      model: model || 'raw',
      operation,
      durationMs: Math.round(durationMs * 100) / 100,
      timestamp: new Date().toISOString(),
      args: sanitizeArgs(args),
    };

    if (!queryStats.slowestQuery || durationMs > queryStats.slowestQuery.durationMs) {
      queryStats.slowestQuery = slowRecord;
    }

    queryStats.recentSlowQueries.unshift(slowRecord);
    if (queryStats.recentSlowQueries.length > MAX_RECENT_SLOW_QUERIES) {
      queryStats.recentSlowQueries.pop();
    }

    if (logger && logger.warn) {
      logger.warn(
        {
          slowQuery: true,
          model: model || 'raw',
          operation,
          durationMs: Math.round(durationMs * 100) / 100,
          thresholdMs: SLOW_QUERY_THRESHOLD_MS,
          args: sanitizeArgs(args),
        },
        `[DB Slow Query] ${model || 'raw'}.${operation} took ${Math.round(durationMs * 100) / 100}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`
      );
    }
  }
}

/**
 * Returns a snapshot of database query metrics.
 */
function getQueryMetrics() {
  const avgDurationMs = queryStats.totalQueries > 0
    ? Math.round((queryStats.totalDurationMs / queryStats.totalQueries) * 100) / 100
    : 0;

  return {
    totalQueries: queryStats.totalQueries,
    slowQueries: queryStats.slowQueries,
    slowQueryThresholdMs: SLOW_QUERY_THRESHOLD_MS,
    avgDurationMs,
    slowestQuery: queryStats.slowestQuery,
    recentSlowQueries: [...queryStats.recentSlowQueries],
  };
}

/**
 * Resets query performance metrics (useful for testing).
 */
function resetQueryMetrics() {
  queryStats.totalQueries = 0;
  queryStats.slowQueries = 0;
  queryStats.totalDurationMs = 0;
  queryStats.slowestQuery = null;
  queryStats.recentSlowQueries = [];
}

module.exports = {
  SLOW_QUERY_THRESHOLD_MS,
  recordQueryMetric,
  getQueryMetrics,
  resetQueryMetrics,
  sanitizeArgs,
};
