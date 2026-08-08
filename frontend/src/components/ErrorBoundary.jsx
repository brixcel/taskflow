/**
 * ErrorBoundary.jsx
 *
 * Top-level React error boundary. Wraps the entire app so that any unhandled
 * render-time error shows a friendly fallback instead of a blank white screen.
 *
 * When Sentry is initialised it also captures the error with full React
 * component-tree context via Sentry.withErrorBoundary.
 *
 * Usage (in main.jsx):
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */

import * as Sentry from '@sentry/react';

// ── Fallback UI ───────────────────────────────────────────────────────────────
// Shown whenever a descendant component throws during render.
function FallbackUI({ error, resetError }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center shadow-xl">
        {/* Icon */}
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg
            className="h-7 w-7 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <h1 className="text-lg font-semibold text-white mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          An unexpected error occurred. The team has been notified. You can try
          reloading the page or going back to the dashboard.
        </p>

        {/* Error detail — only shown outside production */}
        {import.meta.env.DEV && error && (
          <pre className="text-left text-xs text-red-300 bg-gray-800 rounded-lg p-3 mb-6 overflow-auto max-h-40">
            {error.message}
          </pre>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={resetError}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium transition-colors"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Boundary ──────────────────────────────────────────────────────────────────
// Sentry.withErrorBoundary wraps a class error boundary that calls
// Sentry.captureException internally. When Sentry isn't initialised the
// wrapper is still a valid error boundary — it just skips the capture.
const ErrorBoundary = Sentry.withErrorBoundary(
  // The "inner" component that is guarded — we pass children straight through.
  ({ children }) => children,
  {
    fallback: ({ error, resetError }) => (
      <FallbackUI error={error} resetError={resetError} />
    ),
    // Attach extra context to every captured error
    onError(error, componentStack) {
      console.error('[ErrorBoundary] Unhandled render error:', error, componentStack);
    },
  }
);

export default ErrorBoundary;
