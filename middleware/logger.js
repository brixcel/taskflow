/**
 * logger.js — Robust logger for root middleware
 */
let logger;
let httpLogger;

try {
  const pino = require('pino');
  const pinoHttp = require('pino-http');

  const REDACTED_PATHS = [
    'req.headers.authorization',
    'req.body.password',
    'req.body.token',
    'req.query.token',
    'body.password',
    'body.token',
  ];

  const isDev = process.env.NODE_ENV !== 'production';

  logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    redact: {
      paths: REDACTED_PATHS,
      censor: '[REDACTED]',
    },
    ...(process.env.NODE_ENV === 'test' ? { level: 'silent' } : {}),
    ...(isDev && process.env.NODE_ENV !== 'test'
      ? {
          transport: {
            target: 'pino/file',
            options: { destination: 1 },
          },
        }
      : {}),
  });

  httpLogger = pinoHttp({
    logger,
    redact: REDACTED_PATHS,
    autoLogging: process.env.NODE_ENV !== 'test',
  });
} catch {
  // Fallback if pino is not installed in root environment
  logger = {
    info: (...args) => { if (process.env.NODE_ENV !== 'test') console.log(...args); },
    warn: (...args) => { if (process.env.NODE_ENV !== 'test') console.warn(...args); },
    error: (...args) => { if (process.env.NODE_ENV !== 'test') console.error(...args); },
    debug: (...args) => { if (process.env.NODE_ENV !== 'test') console.debug(...args); },
  };
  httpLogger = (req, res, next) => next();
}

logger.httpLogger = httpLogger;
module.exports = logger;
