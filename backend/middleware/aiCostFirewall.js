const AI_USAGE_LIMITS = require('../config/aiLimits');
const logger = require('./logger');

// In-memory sliding window counter for team token budgets
const dailyTeamUsage = new Map();

/**
 * aiCostFirewall.js — AI Cost Control & Token Quota Firewall (Charter C14, C26)
 * Pre-evaluates AI requests before dispatching to external Gemini API
 */
function aiCostFirewall(req, res, next) {
  const { prompt, query, description } = req.body || {};
  const inputPayload = prompt || query || description || '';

  // 1. Validate payload size threshold
  if (typeof inputPayload === 'string' && inputPayload.length > AI_USAGE_LIMITS.maxPromptLength) {
    return res.status(400).json({
      error: AI_USAGE_LIMITS.messages.payloadTooLarge,
      code: 'AI_PAYLOAD_TOO_LARGE',
      maxAllowed: AI_USAGE_LIMITS.maxPromptLength,
      receivedLength: inputPayload.length,
    });
  }

  // 2. Estimate token cost
  const estimatedInputTokens = AI_USAGE_LIMITS.estimateTokens(inputPayload);
  req.estimatedTokens = estimatedInputTokens;

  // 3. Track team daily requests
  const teamId = req.teamId || 'anonymous';
  const today = new Date().toISOString().slice(0, 10);
  const key = `${teamId}:${today}`;
  const currentCount = dailyTeamUsage.get(key) || 0;

  if (process.env.NODE_ENV !== 'test' && currentCount >= AI_USAGE_LIMITS.requestsPerDayPerTeam) {
    return res.status(429).json({
      error: AI_USAGE_LIMITS.messages.quotaExceeded,
      code: 'AI_DAILY_QUOTA_EXCEEDED',
    });
  }

  dailyTeamUsage.set(key, currentCount + 1);

  if (logger && logger.debug) {
    logger.debug({
      teamId,
      userId: req.userId,
      estimatedTokens: estimatedInputTokens,
      dailyRequests: currentCount + 1,
    }, 'AI Cost Firewall check passed');
  }

  next();
}

module.exports = aiCostFirewall;
