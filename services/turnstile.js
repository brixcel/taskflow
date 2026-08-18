/**
 * turnstile.js — Cloudflare Turnstile Verification Service (Charter C12, C13)
 * Validates Turnstile challenge tokens against Cloudflare's siteverify API.
 */
const logger = require('../middleware/logger');

const CLOUDFLARE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify a Turnstile response token with Cloudflare
 * @param {string} token - The response token from the frontend Turnstile widget
 * @param {string} remoteIp - The client IP address (optional)
 * @returns {Promise<{ success: boolean, bypassed?: boolean, errorCodes?: string[] }>}
 */
async function verifyTurnstileToken(token, remoteIp = null) {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Graceful fallback for local development or automated test runs without Cloudflare keys
  if (!secretKey) {
    if (logger && logger.debug) {
      logger.debug('TURNSTILE_SECRET_KEY not set — bypassing Turnstile verification (dev/test mode)');
    }
    return { success: true, bypassed: true };
  }

  // If secret is set but token is missing, fail verification
  if (!token || typeof token !== 'string') {
    return {
      success: false,
      errorCodes: ['missing-input-response'],
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const response = await fetch(CLOUDFLARE_SITEVERIFY_URL, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const data = await response.json();

    if (!data.success && logger && logger.warn) {
      logger.warn({ errorCodes: data['error-codes'] }, 'Cloudflare Turnstile verification rejected');
    }

    return {
      success: Boolean(data.success),
      errorCodes: data['error-codes'] || [],
    };
  } catch (error) {
    if (logger && logger.error) {
      logger.error({ err: error }, 'Failed to contact Cloudflare Turnstile API');
    }
    // Fail closed in production if verification service errors out
    return {
      success: false,
      errorCodes: ['network-error'],
    };
  }
}

module.exports = {
  verifyTurnstileToken,
  CLOUDFLARE_SITEVERIFY_URL,
};
