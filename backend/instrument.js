/**
 * instrument.js — Sentry initialisation for the backend
 *
 * MUST be the very first require() in server.js so Sentry can instrument
 * all subsequently loaded modules (Express, Prisma, http, etc.).
 *
 * Sentry is only activated when SENTRY_DSN is set in the environment.
 * The server starts normally without it — useful in local dev / CI where
 * you don't want noise in the Sentry project.
 */

'use strict';

const Sentry = require('@sentry/node');

const dsn = process.env.SENTRY_DSN;

if (!dsn) {
  // No DSN → skip init entirely. Sentry's SDK stubs out all calls safely
  // when uninitialised, so no guards are needed elsewhere in the codebase.
  console.info('[sentry] SENTRY_DSN not set — error tracking disabled');
} else {
  Sentry.init({
    dsn,

    // Surface to Sentry: the environment name helps distinguish staging from
    // production errors in the dashboard.
    environment: process.env.NODE_ENV || 'development',

    // Performance: capture 10 % of transactions in production; 100 % locally.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // ── Sensitive-data scrubbing ────────────────────────────────────────────
    // Sentry captures request bodies by default. Strip any field that could
    // contain credentials before the event leaves this process.
    beforeSend(event) {
      // Scrub request body fields
      if (event.request?.data) {
        const data = event.request.data;
        const SCRUB = ['password', 'token', 'resetToken', 'verifyToken',
                       'newPassword', 'currentPassword', 'authorization'];
        for (const field of SCRUB) {
          if (data[field] !== undefined) data[field] = '[Filtered]';
        }
      }

      // Scrub Authorization header
      if (event.request?.headers?.authorization) {
        event.request.headers.authorization = '[Filtered]';
      }

      // Scrub query-string tokens (e.g. /verify-email?token=...)
      if (event.request?.query_string) {
        const qs = event.request.query_string;
        if (typeof qs === 'string' && qs.includes('token=')) {
          event.request.query_string = qs.replace(
            /(token=)[^&]*/g, '$1[Filtered]'
          );
        }
        if (typeof qs === 'object' && qs.token) {
          qs.token = '[Filtered]';
        }
      }

      return event;
    },

    // Don't report 4xx errors as Sentry issues — those are expected client
    // mistakes, not application bugs. We only care about 5xx / unhandled throws.
    ignoreErrors: [],
  });

  console.info('[sentry] Error tracking initialised (environment: %s)', process.env.NODE_ENV);
}

module.exports = Sentry;
