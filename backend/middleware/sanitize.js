const xss = require('xss');

/**
 * Custom XSS options: strip dangerous HTML tags and script execution vectors
 */
const XSS_OPTIONS = {
  whiteList: {}, // Empty whitelist: strips all HTML tags
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed'],
};

/**
 * Recursively sanitizes data structures (strings, arrays, nested objects)
 * @param {any} val
 * @returns {any} Sanitized value
 */
function sanitizeValue(val) {
  if (typeof val === 'string') {
    return xss(val, XSS_OPTIONS).trim();
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeValue(item));
  }

  if (val !== null && typeof val === 'object') {
    // Preserve Buffers / Files untouched
    if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
      return val;
    }

    const sanitizedObj = {};
    for (const [key, value] of Object.entries(val)) {
      const sanitizedKey = typeof key === 'string' ? xss(key, XSS_OPTIONS).trim() : key;
      sanitizedObj[sanitizedKey] = sanitizeValue(value);
    }
    return sanitizedObj;
  }

  return val;
}

/**
 * Global Express middleware applying recursive input sanitization
 * across req.body, req.query, and req.params (Charter C15)
 */
function sanitizeInput(req, res, next) {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body);
    }
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeValue(req.query);
    }
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeValue(req.params);
    }
    next();
  } catch (err) {
    next();
  }
}

module.exports = {
  sanitizeInput,
  sanitizeValue,
  sanitize: sanitizeValue,
};
