import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle';
import SyncTaskLogo from '../components/SyncTaskLogo';
import { API_URL } from '../api/config';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Client-side email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }

    try {
      await axios.post(`${API_URL}/auth/forgot-password`, {
        email: email.trim(),
      });

      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    }
  };

  return (
    <main className="min-h-screen bg-[var(--color-canvas-bg,#fafafa)] flex flex-col items-center justify-center px-4 relative">
      {/* Top right theme toggle */}
      <div style={{ position: 'absolute', top: 20, right: 24 }}>
        <ThemeToggle variant="icon" size="sm" />
      </div>

      {/* Wordmark */}
      <div className="mb-8 flex items-center">
        <SyncTaskLogo size={32} />
      </div>


      {/* Auth card */}
      <div
        className="w-full max-w-[400px] bg-[var(--color-canvas-card,#ffffff)] rounded-[12px] p-8 border border-[var(--color-canvas-hairline,#ebebeb)]"
        style={{
          boxShadow: '0 8px 32px var(--color-modal-backdrop, rgba(0,0,0,0.06))',
        }}
      >
        <h1
          className="text-[var(--color-canvas-ink,#171717)] font-semibold mb-1 tracking-[-0.96px]"
          style={{ fontSize: '24px', lineHeight: '32px' }}
        >
          Reset your password
        </h1>
        <p className="text-[var(--color-canvas-body,#555555)] mb-6" style={{ fontSize: '14px', lineHeight: '20px' }}>
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        {success ? (
          <div className="flex flex-col gap-4">
            <div className="success-banner">
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
              <div>
                <p className="font-medium" style={{ fontSize: '13px', lineHeight: '20px', margin: 0 }}>
                  Check your email
                </p>
                <p style={{ fontSize: '13px', lineHeight: '20px', margin: 0 }}>
                  If that email is registered, we&apos;ve sent a reset link. Check your inbox (and spam folder).
                </p>
              </div>
            </div>

            <Link
              to="/"
              className="btn-primary"
              style={{ width: '100%', height: 40, textDecoration: 'none' }}
            >
              Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-[var(--color-canvas-body,#171717)] font-medium"
                style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="field-input"
                style={{ fontSize: '14px', lineHeight: '20px' }}
                autoComplete="email"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="error-banner">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className="shrink-0"
                  aria-hidden="true"
                >
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M7 4v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="7" cy="10" r="0.75" fill="currentColor" />
                </svg>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: '20px' }}>
                  {error}
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', height: 40, marginTop: 4 }}
            >
              Send reset link
            </button>
          </form>
        )}

        {/* Link back to login */}
        <p
          className="mt-6 pt-6 border-t border-[var(--color-canvas-hairline,#ebebeb)] text-center text-[var(--color-canvas-mute,#888888)]"
          style={{ fontSize: '13px', lineHeight: '20px' }}
        >
          Remember your password?{' '}
          <Link
            to="/"
            className="text-[var(--color-canvas-ink,#171717)] font-medium hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>

      {/* Footer hint */}
      <p className="mt-6 text-[var(--color-canvas-mute,#888888)]" style={{ fontSize: '12px' }}>
        SyncTask — team task manager
      </p>
    </main>
  );
}

export default ForgotPassword;
