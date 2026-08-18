const crypto = require('crypto');

/**
 * requestId.js — Correlation / Request ID Middleware (Charter C18)
 * Assigns or preserves a unique X-Request-Id across every HTTP request
 */
function requestIdMiddleware(req, res, next) {
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = reqId;
  req.requestId = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
}

module.exports = requestIdMiddleware;
