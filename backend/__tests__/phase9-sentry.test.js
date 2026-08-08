/**
 * Phase 9 — Sentry Observability Tests
 *
 * These are unit/integration tests for the Sentry integration. They do NOT
 * require a live Sentry DSN — all Sentry SDK calls are mocked so the tests
 * run in pure CI with no external network calls.
 *
 * Covers:
 *
 *   1. instrument.js — no-op when SENTRY_DSN is absent
 *   2. instrument.js — Sentry.init called with DSN when SENTRY_DSN is set
 *   3. instrument.js beforeSend — scrubs password, token, newPassword,
 *      currentPassword, authorization header, and query-string tokens
 *   4. instrument.js beforeSend — passes events through when no sensitive
 *      fields are present
 *   5. instrument.js beforeSend — does not drop the event (returns event)
 *   6. Global error handler (server.js) — unhandled route errors return 500 JSON
 *   7. Global error handler — response body contains "error" key, no stack trace
 *   8. Global error handler — honours err.status for non-500 errors
 *   9. GET /debug/sentry-test — returns 500 when NODE_ENV !== 'production'
 *  10. Sentry.setupExpressErrorHandler is called during app initialisation
 */

const express = require('express');
const request = require('supertest');

// ── Mock @sentry/node before any module that imports it is loaded ─────────────
// We capture the init config so we can inspect beforeSend without needing a DSN.

let capturedInitOptions = null;
let setupExpressErrorHandlerCalled = false;

jest.mock('@sentry/node', () => {
  const actual = jest.requireActual('@sentry/node');
  return {
    ...actual,
    init: jest.fn((options) => {
      capturedInitOptions = options;
    }),
    setupExpressErrorHandler: jest.fn((appArg) => {
      setupExpressErrorHandlerCalled = true;
      // Wire a minimal Sentry-like error handler so the global handler still fires
      appArg.use((err, req, res, next) => next(err));
    }),
    captureException: jest.fn(),
  };
});

const Sentry = require('@sentry/node');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Re-require instrument.js with a fresh module registry so SENTRY_DSN changes
 * take effect. Returns the module's export (the Sentry object).
 */
function loadInstrument(dsn) {
  jest.resetModules();
  // Re-apply the mock after resetModules
  jest.mock('@sentry/node', () => ({
    init: jest.fn((options) => { capturedInitOptions = options; }),
    setupExpressErrorHandler: jest.fn(),
    captureException: jest.fn(),
  }));

  const oldDsn = process.env.SENTRY_DSN;
  if (dsn === undefined) {
    delete process.env.SENTRY_DSN;
  } else {
    process.env.SENTRY_DSN = dsn;
  }

  const mod = require('../instrument');

  // Restore
  if (oldDsn === undefined) delete process.env.SENTRY_DSN;
  else process.env.SENTRY_DSN = oldDsn;

  return mod;
}

// Build a minimal Express app that mirrors server.js error-handler behaviour
// without importing the full server (which would re-init Sentry).
function buildErrorHandlerApp(extraRoutes) {
  const app2 = express();
  app2.use(express.json());

  if (extraRoutes) extraRoutes(app2);

  // Replicate the global error handler from server.js
  // eslint-disable-next-line no-unused-vars
  app2.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: status < 500 ? err.message : 'Internal server error' });
  });

  return app2;
}

// ─── 1. No-op when SENTRY_DSN is absent ───────────────────────────────────────

describe('instrument.js — no DSN', () => {
  it('does not call Sentry.init when SENTRY_DSN is not set', () => {
    capturedInitOptions = null;
    loadInstrument(undefined);
    // Grab the freshly required mock
    const freshSentry = require('@sentry/node');
    expect(freshSentry.init).not.toHaveBeenCalled();
  });

  it('exports the Sentry object regardless (SDK is always accessible)', () => {
    const mod = loadInstrument(undefined);
    expect(mod).toBeDefined();
  });
});

// ─── 2. Sentry.init called when DSN is set ────────────────────────────────────

describe('instrument.js — with DSN', () => {
  const FAKE_DSN = 'https://abc123@o0.ingest.sentry.io/999';

  beforeEach(() => { capturedInitOptions = null; });

  it('calls Sentry.init with the provided DSN', () => {
    loadInstrument(FAKE_DSN);
    const freshSentry = require('@sentry/node');
    expect(freshSentry.init).toHaveBeenCalledTimes(1);
    const opts = freshSentry.init.mock.calls[0][0];
    expect(opts.dsn).toBe(FAKE_DSN);
  });

  it('passes environment from NODE_ENV', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'staging';
    loadInstrument(FAKE_DSN);
    const freshSentry = require('@sentry/node');
    const opts = freshSentry.init.mock.calls[0][0];
    expect(opts.environment).toBe('staging');
    process.env.NODE_ENV = origEnv;
  });

  it('passes tracesSampleRate', () => {
    loadInstrument(FAKE_DSN);
    const freshSentry = require('@sentry/node');
    const opts = freshSentry.init.mock.calls[0][0];
    expect(opts.tracesSampleRate).toBeDefined();
    expect(typeof opts.tracesSampleRate).toBe('number');
  });

  it('sets a lower tracesSampleRate in production', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    loadInstrument(FAKE_DSN);
    const freshSentry = require('@sentry/node');
    const opts = freshSentry.init.mock.calls[0][0];
    expect(opts.tracesSampleRate).toBeLessThan(1);
    process.env.NODE_ENV = origEnv;
  });
});

// ─── 3. beforeSend scrubbing ──────────────────────────────────────────────────
//
// We exercise the beforeSend function directly by extracting it from the
// init options captured when instrument.js is loaded with a DSN.

describe('instrument.js beforeSend — sensitive-data scrubbing', () => {
  const FAKE_DSN = 'https://abc123@o0.ingest.sentry.io/999';

  let beforeSend;

  beforeAll(() => {
    capturedInitOptions = null;
    loadInstrument(FAKE_DSN);
    // capturedInitOptions is set inside the init mock
    beforeSend = capturedInitOptions?.beforeSend;
    if (!beforeSend) {
      // Try reading from the last mock call if capturedInitOptions wasn't set
      const freshSentry = require('@sentry/node');
      if (freshSentry.init.mock.calls.length > 0) {
        beforeSend = freshSentry.init.mock.calls.at(-1)[0]?.beforeSend;
      }
    }
  });

  function makeEvent(overrides = {}) {
    return {
      request: {
        data: {},
        headers: {},
        query_string: '',
        url: 'http://localhost:3000/auth/login',
      },
      ...overrides,
    };
  }

  it('beforeSend is defined as a function', () => {
    expect(typeof beforeSend).toBe('function');
  });

  it('scrubs "password" from request.data', () => {
    const event = makeEvent({ request: { data: { email: 'a@b.com', password: 'secret123' }, headers: {} } });
    const result = beforeSend(event);
    expect(result.request.data.password).toBe('[Filtered]');
    expect(result.request.data.email).toBe('a@b.com'); // non-sensitive preserved
  });

  it('scrubs "token" from request.data', () => {
    const event = makeEvent({ request: { data: { token: 'rawtoken123' }, headers: {} } });
    const result = beforeSend(event);
    expect(result.request.data.token).toBe('[Filtered]');
  });

  it('scrubs "newPassword" from request.data', () => {
    const event = makeEvent({ request: { data: { newPassword: 'hunter2' }, headers: {} } });
    const result = beforeSend(event);
    expect(result.request.data.newPassword).toBe('[Filtered]');
  });

  it('scrubs "currentPassword" from request.data', () => {
    const event = makeEvent({ request: { data: { currentPassword: 'old-pass' }, headers: {} } });
    const result = beforeSend(event);
    expect(result.request.data.currentPassword).toBe('[Filtered]');
  });

  it('scrubs authorization header', () => {
    const event = makeEvent({
      request: { data: {}, headers: { authorization: 'Bearer eyJhbGciOiJ...' } },
    });
    const result = beforeSend(event);
    expect(result.request.headers.authorization).toBe('[Filtered]');
  });

  it('scrubs token from query_string (string form)', () => {
    const event = makeEvent({
      request: {
        data: {},
        headers: {},
        query_string: 'token=abc123def&other=keep',
      },
    });
    const result = beforeSend(event);
    expect(result.request.query_string).toMatch(/token=\[Filtered\]/);
    expect(result.request.query_string).toMatch(/other=keep/);
  });

  it('scrubs token from query_string (object form)', () => {
    const event = makeEvent({
      request: {
        data: {},
        headers: {},
        query_string: { token: 'abc123', page: '1' },
      },
    });
    const result = beforeSend(event);
    expect(result.request.query_string.token).toBe('[Filtered]');
    expect(result.request.query_string.page).toBe('1');
  });

  it('does not modify events without sensitive fields', () => {
    const event = makeEvent({
      request: {
        data: { title: 'My task', status: 'todo' },
        headers: { 'content-type': 'application/json' },
        query_string: 'page=1',
        url: 'http://localhost:3000/tasks',
      },
    });
    const result = beforeSend(event);
    expect(result.request.data.title).toBe('My task');
    expect(result.request.data.status).toBe('todo');
  });

  it('returns the event (does not drop it)', () => {
    const event = makeEvent();
    const result = beforeSend(event);
    expect(result).not.toBeNull();
    expect(result).toBe(event); // same object reference — mutated in place
  });
});

// ─── 4. Global error handler ──────────────────────────────────────────────────

describe('Global error handler (server.js)', () => {
  it('returns 500 JSON for an unhandled thrown error', async () => {
    const app2 = buildErrorHandlerApp((a) => {
      a.get('/boom', () => { throw new Error('unexpected failure'); });
    });

    const res = await request(app2).get('/boom');
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toHaveProperty('error', 'Internal server error');
  });

  it('does not expose the stack trace in the response body', async () => {
    const app2 = buildErrorHandlerApp((a) => {
      a.get('/boom', () => { throw new Error('some internal detail'); });
    });

    const res = await request(app2).get('/boom');
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/some internal detail/);
    expect(body).not.toMatch(/at Object\./);
  });

  it('uses err.status for client errors (e.g. 422)', async () => {
    const app2 = buildErrorHandlerApp((a) => {
      a.get('/client-err', () => {
        const e = new Error('Unprocessable entity');
        e.status = 422;
        throw e;
      });
    });

    const res = await request(app2).get('/client-err');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Unprocessable entity');
  });

  it('uses err.statusCode as a fallback for status', async () => {
    const app2 = buildErrorHandlerApp((a) => {
      a.get('/client-err2', () => {
        const e = new Error('Bad gateway');
        e.statusCode = 502;
        throw e;
      });
    });

    const res = await request(app2).get('/client-err2');
    expect(res.status).toBe(502);
  });

  it('defaults to 500 when err has no status/statusCode', async () => {
    const app2 = buildErrorHandlerApp((a) => {
      a.get('/no-status', () => { throw new Error('oops'); });
    });

    const res = await request(app2).get('/no-status');
    expect(res.status).toBe(500);
  });
});

// ─── 5. Sentry.setupExpressErrorHandler wired in server.js ───────────────────

describe('Sentry.setupExpressErrorHandler wiring', () => {
  it('setupExpressErrorHandler was called when server.js was loaded', () => {
    // server.js is already loaded at the top of this file via the require chain.
    // Our mock records the call. Because jest.resetModules() was called inside
    // loadInstrument(), we check the top-level mock here.
    expect(Sentry.setupExpressErrorHandler).toHaveBeenCalled();
  });
});

// ─── 6. GET /debug/sentry-test — non-production ───────────────────────────────

describe('GET /debug/sentry-test', () => {
  // We use the real app imported at the top of this file.  NODE_ENV=test so the
  // route IS registered and the throw propagates to the error handler.
  const appReal = require('../server');

  it('returns 500 (route throws, global handler catches)', async () => {
    const res = await request(appReal).get('/debug/sentry-test');
    expect(res.status).toBe(500);
  });

  it('response body has an "error" key', async () => {
    const res = await request(appReal).get('/debug/sentry-test');
    expect(res.body).toHaveProperty('error');
  });
});
