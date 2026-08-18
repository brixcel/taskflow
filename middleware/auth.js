const jwt = require('jsonwebtoken');
const { authenticateApiKey } = require('../services/apiKeys');
const { validateSession } = require('../services/session');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  // 1. Check for API key in X-API-Key header or Bearer tf_...
  let apiKeyCandidate = apiKeyHeader;
  if (!apiKeyCandidate && authHeader && authHeader.startsWith('Bearer tf_')) {
    apiKeyCandidate = authHeader.split(' ')[1];
  }

  if (apiKeyCandidate) {
    try {
      const result = await authenticateApiKey(apiKeyCandidate);
      if (!result.valid) {
        return res.status(401).json({ error: result.error || 'Invalid API key' });
      }
      req.userId = result.user.id;
      req.teamId = result.teamId;
      req.teamRole = result.role;
      req.apiKey = result.apiKey;
      req.authMethod = 'api_key';
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Failed to authenticate API key' });
    }
  }

  // 2. Fallback to JWT Bearer token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');

    // Server-Side Redis Session Revocation Check (Phase 38)
    if (decoded.sid) {
      const session = await validateSession(decoded.sid);
      if (!session) {
        return res.status(401).json({
          error: 'Session has been revoked or expired. Please log in again.',
          code: 'SESSION_REVOKED',
        });
      }
      req.sessionId = decoded.sid;
      req.session = session;
    }

    req.userId = decoded.userId;
    req.authMethod = 'jwt';
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;