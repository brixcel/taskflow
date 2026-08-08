import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle';
import { API_URL } from '../api/config';

function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  // 'pending' | 'success' | 'error' | 'missing'
  const [status, setStatus]   = useState(token ? 'pending' : 'missing');
  const [message, setMessage] = useState('');
  const hasFired = useRef(false);

  useEffect(() => {
    if (!token || hasFired.current) return;
    hasFired.current = true;

    axios
      .get(`${API_URL}/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((res) => {
        setStatus('success');
        if (res.data?.message) {
          setMessage(res.data.message);
        }
        try {
          const savedUser = JSON.parse(localStorage.getItem('user'));
          if (savedUser) {
            savedUser.emailVerified = true;
            localStorage.setItem('user', JSON.stringify(savedUser));
          }
        } catch { /* ignore parsing errors */ }
      })
      .catch((err) => {
        setStatus('error');
        const data = err.response?.data;
        setMessage(data?.error || 'Something went wrong. Please try again.');
      });
  }, [token]);

  // ── Wordmark ───────────────────────────────────────────────────────────────
  const wordmark = (
    <div className="mb-8 flex items-center gap-2">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-[6px] bg-[var(--color-canvas-ink,#171717)] text-[var(--color-canvas-main,#ffffff)]">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M2 11 L7 3 L12 11"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span
        className="text-[var(--color-canvas-ink,#171717)] font-semibold tracking-[-0.6px]"
        style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: '18px' }}
      >
        TaskFlow
      </span>
    </div>
  );

  // ── Card shell ─────────────────────────────────────────────────────────────
  const card = (children) => (
    <div
      className="w-full max-w-[400px] bg-[var(--color-canvas-card,#ffffff)] rounded-[12px] p-8 border border-[var(--color-canvas-hairline,#ebebeb)]"
      style={{
        boxShadow: '0 8px 32px var(--color-modal-backdrop, rgba(0,0,0,0.06))',
      }}
    >
      {children}
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--color-canvas-bg,#fafafa)] flex flex-col items-center justify-center px-4 relative">
      {/* Top right theme toggle */}
      <div style={{ position: 'absolute', top: 20, right: 24 }}>
        <ThemeToggle variant="icon" size="sm" />
      </div>

      {wordmark}

      {/* ── Loading ── */}
      {status === 'pending' && card(
        <div className="flex flex-col items-center gap-3 py-4">
          {/* Spinner */}
          <svg
            className="animate-spin text-[var(--color-canvas-mute,#a1a1a1)]"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-label="Verifying…"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="text-[var(--color-canvas-mute,#888888)]" style={{ fontSize: '14px', lineHeight: '20px' }}>
            Verifying your email address…
          </p>
        </div>
      )}

      {/* ── Missing token ── */}
      {status === 'missing' && card(
        <>
          <h1
            className="text-[var(--color-canvas-ink,#171717)] font-semibold mb-1 tracking-[-0.96px]"
            style={{ fontSize: '24px', lineHeight: '32px' }}
          >
            Invalid link
          </h1>
          <p className="text-[var(--color-canvas-mute,#888888)] mb-6" style={{ fontSize: '14px', lineHeight: '20px' }}>
            This verification link is missing a token. Please use the link from your
            email, or request a new one from your dashboard.
          </p>
          <Link
            to="/"
            className="btn-primary"
            style={{ width: '100%', height: 40, textDecoration: 'none' }}
          >
            Go to login
          </Link>
        </>
      )}

      {/* ── Success ── */}
      {status === 'success' && card(
        <>
          <h1
            className="text-[var(--color-canvas-ink,#171717)] font-semibold mb-1 tracking-[-0.96px]"
            style={{ fontSize: '24px', lineHeight: '32px' }}
          >
            Email verified
          </h1>
          <div className="success-banner mb-6">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="shrink-0 mt-0.5"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M4 7 L6 9 L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: '20px' }}>
              Your email address has been verified. Your account is now fully active.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="btn-primary"
            style={{ width: '100%', height: 40, textDecoration: 'none' }}
          >
            Go to dashboard
          </Link>
        </>
      )}

      {/* ── Error ── */}
      {status === 'error' && card(
        <>
          <h1
            className="text-[var(--color-canvas-ink,#171717)] font-semibold mb-1 tracking-[-0.96px]"
            style={{ fontSize: '24px', lineHeight: '32px' }}
          >
            Verification failed
          </h1>
          <div className="error-banner mb-6">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="shrink-0 mt-0.5"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 4v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="7" cy="10" r="0.75" fill="currentColor" />
            </svg>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: '20px' }}>
              {message}
            </p>
          </div>
          <p className="text-[var(--color-canvas-mute,#888888)] mb-4" style={{ fontSize: '13px', lineHeight: '20px' }}>
            Log in and use the banner on your dashboard to request a new verification link.
          </p>
          <Link
            to="/"
            className="btn-primary"
            style={{ width: '100%', height: 40, textDecoration: 'none' }}
          >
            Go to login
          </Link>
        </>
      )}

      <p className="mt-6 text-[var(--color-canvas-mute,#888888)]" style={{ fontSize: '12px' }}>
        TaskFlow — team task manager
      </p>
    </div>
  );
}

export default VerifyEmail;
