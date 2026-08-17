import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import SyncTaskLogo from '../components/SyncTaskLogo';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--color-canvas-bg,#fafafa)] flex flex-col justify-between p-6">
      {/* Top Brand Bar */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-4">
        <Link to="/" className="flex items-center group text-decoration-none">
          <SyncTaskLogo size={28} />
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle variant="icon" size="sm" />
          <Link
            to="/"
            className="px-3.5 py-1.5 text-xs font-medium text-[var(--color-canvas-body,#50545c)] hover:text-[var(--color-canvas-ink,#0f1011)] transition-colors text-decoration-none"
          >
            Sign In
          </Link>
          <Link
            to="/register"
            className="btn-primary"
            style={{ height: 32, fontSize: 12, padding: '0 14px', textDecoration: 'none' }}
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* Main 404 Content */}
      <main className="max-w-lg w-full mx-auto my-auto text-center py-12 px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-canvas-subtle,#f0f1f3)] border border-[var(--color-canvas-hairline,#ebebeb)] text-xs font-mono text-[var(--color-canvas-mute,#8a8f98)] mb-6">
          <span className="w-2 h-2 rounded-full bg-[var(--color-btn-danger-fg,#ee0000)] animate-pulse" />
          HTTP 404 — Not Found
        </div>

        <h1 className="text-6xl sm:text-7xl font-bold tracking-tight text-[var(--color-canvas-ink,#0f1011)] mb-4 font-mono">
          404
        </h1>
        <h2 className="text-xl sm:text-2xl font-semibold text-[var(--color-canvas-ink,#0f1011)] tracking-tight mb-3">
          This page does not exist
        </h2>
        <p className="text-sm text-[var(--color-canvas-body,#50545c)] leading-relaxed mb-8 max-w-md mx-auto">
          The link you followed may be broken, or the page may have been removed, moved, or made private.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="btn-primary"
            style={{ width: '100%', height: 38, textDecoration: 'none' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Return to Dashboard
          </Link>
          <Link
            to="/"
            className="btn-secondary"
            style={{ width: '100%', height: 38, textDecoration: 'none' }}
          >
            Go to Login
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto py-6 border-t border-[var(--color-canvas-hairline,#ebebeb)] flex flex-col sm:flex-row items-center justify-between text-xs text-[var(--color-canvas-mute,#8a8f98)] gap-4">
        <div>
          &copy; {new Date().getFullYear()} SyncTask. Production Multi-Tenant Platform.
        </div>
        <div className="flex items-center gap-4">
          <Link to="/terms" className="hover:text-[var(--color-canvas-ink,#0f1011)] transition-colors text-decoration-none">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-[var(--color-canvas-ink,#0f1011)] transition-colors text-decoration-none">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
