/**
 * logger.js — Structured JSON logger (pino)
 *
 * Usage:
 *   const logger = require('./middleware/logger');
 *   logger.info({ userId: req.userId }, 'Task created');
 *   logger.error({ err }, 'Unexpected failure');
 *
 * HTTP request logging:
 *   const { httpLogger } = require('./middleware/logger');
 *   app.use(httpLogger);
 *
 * In development (NODE_ENV !== 'production') logs are pretty-printed to stdout.
 * In production they are emitted as compact single-line JSON — ready for any
 * log aggregator (Datadog, CloudWatch, Papertrail, etc.).
 *
 * Sensitive fields are redacted at the serializer level so they never appear
 * in log output regardless of how they reach pino.
 */

const pino     = require('pino');
const pinoHttp = require('pino-http');

// Fields that must never appear in log output
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.body.password',
  'req.body.token',
  'req.query.token',
  'body.password',
  'body.token',
];

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: REDACTED_PATHS,
    censor: '[REDACTED]',
  },
  // In test mode, suppress all log output so jest output stays clean
  ...(process.env.NODE_ENV === 'test' ? { level: 'silent' } : {}),
  ...(isDev && process.env.NODE_ENV !== 'test'
    ? {
        transport: {
          target: 'pino/file',
          options: { destination: 1 }, // stdout
        },
      }
    : {}),
});

/**
 * Express middleware that logs every HTTP request as a structured JSON line.
 * Attaches req.log / res.log so route handlers can emit child loggers with
 * the request's correlation data already bound.
 */
const httpLogger = pinoHttp({
  logger,
  // Don't log /health polls — they're noisy and add no signal
  autoLogging: {
    ignore: (req) => req.url === '/health',
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400)        return 'warn';
    return 'info';
  },
  serializers: {
    req(req) {
      return {
        method:  req.method,
        url:     req.url,
        // Never log the full authorization header
        headers: {
          'content-type': req.headers['content-type'],
          'x-team-id':    req.headers['x-team-id'],
        },
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});

module.exports = logger;
module.exports.httpLogger = httpLogger;
