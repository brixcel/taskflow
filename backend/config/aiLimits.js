/**
 * aiLimits.js — Centralized AI Usage Limits & Token Budgeting (Charter C14, C26)
 * Governs rate limits, token quotas, and payload thresholds across all Gemini AI features.
 */
const AI_USAGE_LIMITS = {
  // Rate Limits
  requestsPerMinutePerUser: 10,
  requestsPerHourPerUser: 60,
  requestsPerDayPerTeam: 300,

  // Token & Payload Thresholds
  maxPromptLength: 8000,       // Max characters in user prompt
  maxContextTasks: 50,         // Maximum task objects included in workspace prompt
  maxEstimatedOutputTokens: 2048,

  // Model Tiering
  models: {
    primary: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    lightweight: 'gemini-2.5-flash', // Fast parsing for search & breakdown
  },

  // Token Budget Estimation (Charter C14)
  estimateTokens(text = '') {
    // Standard heuristic: ~4 characters per token
    return Math.ceil((text || '').length / 4);
  },

  // Graceful Degradation Ladder Messages
  messages: {
    rateLimitExceeded: 'AI rate limit reached. Please wait a moment before sending more requests.',
    quotaExceeded: 'Daily team AI token quota reached. AI features will resume tomorrow.',
    payloadTooLarge: 'Input prompt exceeds maximum allowed size (8,000 characters). Please condense your prompt.',
    temporarilyUnavailable: 'TaskFlow AI is temporarily experiencing high latency. Falling back to local workspace rules.',
  },
};

module.exports = AI_USAGE_LIMITS;
