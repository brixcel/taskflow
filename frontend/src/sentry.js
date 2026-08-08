/**
 * sentry.js — Sentry initialisation for the React frontend
 *
 * Import this module as the very first import in main.jsx so Sentry can
 * instrument fetch, XHR, and React rendering before any app code runs.
 *
 * Sentry is only activated when VITE_SENTRY_DSN is set at build time.
 * Omitting the variable (local dev, CI) silently skips initialisation —
 * all Sentry calls throughout the app are no-ops when uninitialised.
 */

import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,

    // Tag events by environment so staging and production errors stay separate.
    environment: import.meta.env.MODE,

    integrations: [
      // Traces React component renders and route transitions.
      Sentry.browserTracingIntegration(),
    ],

    // Capture 10 % of transactions in production; 100 % elsewhere.
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // ── Sensitive-data scrubbing ─────────────────────────────────────────────
    // Strip credentials and tokens before any event leaves the browser.
    beforeSend(event) {
      // Scrub request body fields captured in breadcrumbs / fetch data
      if (event.request?.data) {
        const data =
          typeof event.request.data === 'string'
            ? (() => {
                try { return JSON.parse(event.request.data); } catch { return null; }
              })()
            : event.request.data;

        if (data && typeof data === 'object') {
          const SCRUB = ['password', 'token', 'resetToken', 'verifyToken',
                         'newPassword', 'currentPassword'];
          for (const field of SCRUB) {
            if (data[field] !== undefined) data[field] = '[Filtered]';
          }
          event.request.data = JSON.stringify(data);
        }
      }

      // Scrub Authorization header forwarded via breadcrumbs
      if (event.request?.headers?.authorization) {
        event.request.headers.authorization = '[Filtered]';
      }

      // Scrub token from URL query strings (e.g. /verify-email?token=...)
      if (event.request?.url) {
        event.request.url = event.request.url.replace(
          /(token=)[^&]*/g, '$1[Filtered]'
        );
      }

      return event;
    },
  });
}

export default Sentry;
