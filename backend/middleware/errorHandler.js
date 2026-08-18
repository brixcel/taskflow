const logger = require('./logger');

/**
 * errorHandler.js — Centralized Error Handling & Masking Middleware (Charter C19)
 * Catches unhandled route errors, logs detailed traces with req.id internally,
 * and returns client-safe standard JSON objects without leaking internal DB info or stack traces.
 */
function errorHandler(err, req, res, next) {
  const reqId = req.id || req.requestId || 'unknown';
  const statusCode = err.status || err.statusCode || 500;

  // Log full error internally for diagnosis
  if (logger && logger.error) {
    logger.error({
      err: {
        message: err.message,
        stack: err.stack,
        code: err.code,
      },
      requestId: reqId,
      path: req.originalUrl || req.url,
      method: req.method,
      userId: req.userId || null,
      teamId: req.teamId || null,
    }, 'Unhandled route error');
  } else if (process.env.NODE_ENV !== 'test') {
    console.error(`[Error][${reqId}]`, err);
  }

  // Client-safe response (never expose stack traces in production)
  const isClientSafe = statusCode < 500 || err.isClientSafe;
  const clientMessage = isClientSafe
    ? err.message
    : 'An unexpected internal error occurred. Please try again later.';

  res.status(statusCode).json({
    error: clientMessage,
    code: err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR'),
    requestId: reqId,
  });
}

module.exports = errorHandler;
