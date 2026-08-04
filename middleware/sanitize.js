/**
 * sanitize(value) — strips HTML tags from a string to prevent stored XSS.
 *
 * Uses the `xss` library with a zero-allowlist config: every tag and attribute
 * is stripped, leaving only the plain text content.
 *
 * Usage:
 *   const { sanitize } = require('../middleware/sanitize');
 *   const clean = sanitize(req.body.title);
 */

const xss = require('xss');

const strict = new xss.FilterXSS({
  whiteList:        {},   // allow no tags at all
  stripIgnoreTag:   true, // strip unrecognised tags rather than escaping them
  stripIgnoreTagBody: ['script', 'style'], // also drop the inner content of these
});

function sanitize(value) {
  if (typeof value !== 'string') return value;
  return strict.process(value);
}

module.exports = { sanitize };
