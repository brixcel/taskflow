const { recordHttpRequest, incrementActiveRequests, decrementActiveRequests } = require('../services/metrics');

/**
 * Normalizes an arbitrary URL path to prevent Prometheus label cardinality explosion.
 * Replaces UUIDs, CUIDs, Mongo IDs, and numeric IDs with parameter placeholders.
 */
function normalizePath(rawPath) {
  if (!rawPath || rawPath === '/') return '/';
  
  const pathname = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
  const segments = pathname.split('/').filter(Boolean);

  const normalizedSegments = segments.map(segment => {
    // Pure integer ID
    if (/^\d+$/.test(segment)) {
      return ':id';
    }
    // UUID format
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
      return ':id';
    }
    // CUID / CUID2 format (e.g. cm... or cjld...)
    if (/^c[0-9a-z]{20,}$/i.test(segment)) {
      return ':id';
    }
    // Mongo ObjectId / 24-hex string
    if (/^[0-9a-f]{24}$/i.test(segment)) {
      return ':id';
    }
    // Long token or hex hash
    if (/^[0-9a-f]{16,}$/i.test(segment)) {
      return ':token';
    }
    return segment;
  });

  return '/' + normalizedSegments.join('/');
}

/**
 * Express middleware to collect HTTP traffic metrics with high-resolution timers.
 */
function metricsMiddleware(req, res, next) {
  // Don't track the /metrics endpoint itself to avoid recursive self-skewing
  if (req.path === '/metrics') {
    return next();
  }

  const startNs = process.hrtime.bigint();
  const method = req.method;
  incrementActiveRequests(method);

  let finished = false;

  const onResponseComplete = () => {
    if (finished) return;
    finished = true;

    decrementActiveRequests(method);

    const endNs = process.hrtime.bigint();
    const durationSeconds = Number(endNs - startNs) / 1e9;

    // Determine normalized route name
    let route = 'unknown';
    if (req.route && req.route.path) {
      const fullRoute = `${req.baseUrl || ''}${req.route.path}`;
      route = (fullRoute.length > 1 && fullRoute.endsWith('/')) ? fullRoute.slice(0, -1) : fullRoute;
    } else {
      route = normalizePath(req.originalUrl || req.url || req.path);
    }

    recordHttpRequest({
      method,
      route,
      statusCode: res.statusCode || 200,
      durationSeconds,
    });
  };

  res.once('finish', onResponseComplete);
  res.once('close', onResponseComplete);

  next();
}

module.exports = {
  metricsMiddleware,
  normalizePath,
};
