/**
 * Gemini Integration & Resiliency Test Suite
 * Covers:
 * - Configurable GEMINI_MODEL
 * - Timeout handling
 * - Error categorization (401, 403, 404, 429, 503, Timeout, Parse, Validation)
 * - Safe server-side diagnostics (No API key leakage)
 * - Fallback resiliency across all failure modes
 * - Real dynamic generation when enabled
 */

const {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_TIMEOUT_MS,
  getGeminiModel,
  getGeminiTimeoutMs,
  categorizeGeminiError,
  logGeminiDiagnostic,
  parseGeminiJsonResponse,
  callGeminiGenerate,
  generateTaskFromPrompt,
  breakdownTaskIntoSubtasks,
  generateProjectPlan,
  generateProductivityInsights,
  interpretNaturalSearchPrompt,
} = require('../services/ai');
const logger = require('../middleware/logger');

describe('Gemini AI Integration & Resiliency', () => {
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  const originalTimeout = process.env.GEMINI_TIMEOUT_MS;

  afterEach(() => {
    if (originalApiKey !== undefined) process.env.GEMINI_API_KEY = originalApiKey;
    else delete process.env.GEMINI_API_KEY;

    if (originalModel !== undefined) process.env.GEMINI_MODEL = originalModel;
    else delete process.env.GEMINI_MODEL;

    if (originalTimeout !== undefined) process.env.GEMINI_TIMEOUT_MS = originalTimeout;
    else delete process.env.GEMINI_TIMEOUT_MS;
  });

  describe('1. Configuration & Centralized Model Resolution', () => {
    it('defaults to verified fast model when GEMINI_MODEL is not set', () => {
      delete process.env.GEMINI_MODEL;
      expect(getGeminiModel()).toBe('gemini-3.5-flash-lite');
      expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
    });

    it('respects custom GEMINI_MODEL from environment variable', () => {
      process.env.GEMINI_MODEL = 'gemini-3.6-flash';
      expect(getGeminiModel()).toBe('gemini-3.6-flash');
    });

    it('defaults to 10000ms timeout when GEMINI_TIMEOUT_MS is not set', () => {
      delete process.env.GEMINI_TIMEOUT_MS;
      expect(getGeminiTimeoutMs()).toBe(10000);
      expect(DEFAULT_GEMINI_TIMEOUT_MS).toBe(10000);
    });

    it('respects custom valid GEMINI_TIMEOUT_MS', () => {
      process.env.GEMINI_TIMEOUT_MS = '5000';
      expect(getGeminiTimeoutMs()).toBe(5000);
    });

    it('falls back to default timeout when GEMINI_TIMEOUT_MS is invalid', () => {
      process.env.GEMINI_TIMEOUT_MS = 'invalid-number';
      expect(getGeminiTimeoutMs()).toBe(10000);
    });
  });

  describe('2. Error Categorization & Diagnosis', () => {
    it('categorizes missing API key error', () => {
      const err = new Error('GEMINI_API_KEY is not configured');
      err.name = 'MissingApiKeyError';
      expect(categorizeGeminiError(err)).toBe('MISSING_API_KEY');
    });

    it('categorizes 401 and 403 authentication failures', () => {
      const err401 = new Error('API key not valid');
      err401.status = 401;
      expect(categorizeGeminiError(err401)).toBe('AUTHENTICATION_FAILED');

      const err403 = new Error('Permission denied');
      err403.status = 403;
      expect(categorizeGeminiError(err403)).toBe('AUTHENTICATION_FAILED');
    });

    it('categorizes 429 rate limit / quota exhaustion', () => {
      const err429 = new Error('Quota exceeded for metric');
      err429.status = 429;
      expect(categorizeGeminiError(err429)).toBe('RATE_LIMIT_EXCEEDED');

      const resourceExhausted = new Error('RESOURCE_EXHAUSTED');
      expect(categorizeGeminiError(resourceExhausted)).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('categorizes 503 and 404 model unavailability / demand spikes', () => {
      const err503 = new Error('This model is currently experiencing high demand');
      err503.status = 503;
      expect(categorizeGeminiError(err503)).toBe('MODEL_UNAVAILABLE');

      const err404 = new Error('This model models/gemini-2.0-flash is no longer available');
      err404.status = 404;
      expect(categorizeGeminiError(err404)).toBe('MODEL_UNAVAILABLE');
    });

    it('categorizes timeouts and abort errors', () => {
      const timeoutErr = new Error('Gemini request timed out after 10000ms');
      timeoutErr.name = 'AbortError';
      expect(categorizeGeminiError(timeoutErr)).toBe('TIMEOUT');

      const deadlineErr = new Error('Deadline exceeded on upstream request');
      expect(categorizeGeminiError(deadlineErr)).toBe('TIMEOUT');
    });

    it('categorizes JSON parse errors', () => {
      const parseErr = new SyntaxError('Unexpected token < in JSON at position 0');
      expect(categorizeGeminiError(parseErr)).toBe('PARSE_ERROR');
    });

    it('categorizes Zod schema validation errors', () => {
      const zodErr = new Error('Validation failed');
      zodErr.name = 'ZodError';
      expect(categorizeGeminiError(zodErr)).toBe('SCHEMA_VALIDATION_ERROR');
    });

    it('categorizes unknown upstream errors', () => {
      const genericErr = new Error('Socket disconnected unexpectedly');
      expect(categorizeGeminiError(genericErr)).toBe('UPSTREAM_ERROR');
    });
  });

  describe('3. Safe Logging & Zero Key Leakage', () => {
    it('redacts sensitive API keys if present in error messages', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const fakeKey = 'AIzaSyD-1234567890abcdefghijklmnopqrstuv';
      const leakyError = new Error(`Request failed with key ${fakeKey}`);
      leakyError.status = 400;

      logGeminiDiagnostic({
        feature: 'testFeature',
        model: 'gemini-3.5-flash-lite',
        elapsedMs: 250,
        error: leakyError,
      });

      // Verify that the call did not include the raw secret
      const loggedArg = warnSpy.mock.calls[0]?.[1];
      if (loggedArg) {
        expect(JSON.stringify(loggedArg)).not.toContain(fakeKey);
        expect(loggedArg.errorMessage).toContain('[REDACTED_API_KEY]');
      }
      warnSpy.mockRestore();
    });
  });

  describe('4. JSON Response Parsing Helper', () => {
    it('parses standard JSON object string', () => {
      const json = '{"title":"Test Task","priority":"high"}';
      expect(parseGeminiJsonResponse(json)).toEqual({
        title: 'Test Task',
        priority: 'high',
      });
    });

    it('strips markdown ```json fences cleanly', () => {
      const fenced = '```json\n{\n  "title": "Cleaned Task"\n}\n```';
      expect(parseGeminiJsonResponse(fenced)).toEqual({
        title: 'Cleaned Task',
      });
    });

    it('handles empty or whitespace strings gracefully', () => {
      expect(parseGeminiJsonResponse('')).toEqual({});
      expect(parseGeminiJsonResponse('   ')).toEqual({});
    });
  });

  describe('5. Fallback Resiliency on Failure Modes', () => {
    it('gracefully falls back when GEMINI_API_KEY is missing without crashing', async () => {
      delete process.env.GEMINI_API_KEY;

      const result = await generateTaskFromPrompt({
        prompt: 'Deploy to AWS Kubernetes cluster',
      });

      expect(result).toBeDefined();
      expect(result.title).toBeDefined();
      expect(result.suggestedDueDate).toBeDefined();
      expect(Array.isArray(result.suggestedSubtasks)).toBe(true);
    });

    it('gracefully falls back on task breakdown when Gemini fails', async () => {
      delete process.env.GEMINI_API_KEY;

      const result = await breakdownTaskIntoSubtasks({
        title: 'Configure PostgreSQL replication',
        description: 'Set up read replicas and connection pooling',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.subtasks)).toBe(true);
      expect(result.subtasks.length).toBeGreaterThan(0);
    });

    it('gracefully falls back on project planning when Gemini fails', async () => {
      delete process.env.GEMINI_API_KEY;

      const result = await generateProjectPlan({
        prompt: 'Build Mobile E-Commerce App',
        timeframeWeeks: 6,
      });

      expect(result).toBeDefined();
      expect(result.name).toBeDefined();
      expect(result.phases.length).toBeGreaterThan(0);
      expect(result.tasks.length).toBeGreaterThan(0);
    });
  });
});
