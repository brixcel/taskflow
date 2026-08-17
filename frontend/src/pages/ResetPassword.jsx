import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle';
import SyncTaskLogo from '../components/SyncTaskLogo';
import { API_URL } from '../api/config';

const MIN_PASSWORD_LENGTH = 8;

// Shared field-level error component (same pattern as Register.jsx)
function FieldError({ message }) {
  return (
    <p className="text-[var(--color-btn-danger-fg,#c50000)]" style={{ fontSize: '12px', lineHeight: '16px' }}>
      {message}
    </p>
  );
}

function ResetPassword() {
  const [searchParams]    = useSearchParams();
  const navigate          = useNavigate();

  const token = searchParams.get('token') || '';

  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors]         = useState({});
  const [error, setError]                     = useState('');
  const [success, setSuccess]                 = useState(false);

  // If there's no token in the URL, show an immediate error state
  const [missingToken] = useState(!token);

  // Clear errors as the user types
  const clearField = (field) =>
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));

  const validate = () => {
    const errors = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      await axios.post(`${API_URL}/auth/reset-password`, {
        token,
        password,
      });

      setSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => navigate('/'), 3000);
    } catch (err) {
      const data = err.response?.data;
      setError(data?.error || 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-canvas-bg,#fafafa)] flex flex-col items-center justify-center px-4 relative">
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
        {/* ── Missing token state ── */}
        {missingToken && (
          <>
            <h1
              className="text-[var(--color-canvas-ink,#171717)] font-semibold mb-1 tracking-[-0.96px]"
              style={{ fontSize: '24px', lineHeight: '32px' }}
            >
              Invalid reset link
            </h1>
            <p className="text-[var(--color-canvas-mute,#888888)] mb-6" style={{ fontSize: '14px', lineHeight: '20px' }}>
              This link is missing a reset token. Please request a new one.
            </p>
            <Link
              to="/forgot-password"
              className="btn-primary"
              style={{ width: '100%', height: 40, textDecoration: 'none' }}
            >
              Request new link
            </Link>
          </>
        )}

        {/* ── Success state ── */}
        {!missingToken && success && (
          <>
            <h1
              className="text-[var(--color-canvas-ink,#171717)] font-semibold mb-1 tracking-[-0.96px]"
              style={{ fontSize: '24px', lineHeight: '32px' }}
            >
              Password updated
            </h1>
            <div className="success-banner mb-4">
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
                Your password has been updated. Redirecting you to login&hellip;
              </p>
            </div>
            <Link
              to="/"
              className="btn-primary"
              style={{ width: '100%', height: 40, textDecoration: 'none' }}
            >
              Go to login
            </Link>
          </>
        )}

        {/* ── Form state ── */}
        {!missingToken && !success && (
          <>
            <h1
              className="text-[var(--color-canvas-ink,#171717)] font-semibold mb-1 tracking-[-0.96px]"
              style={{ fontSize: '24px', lineHeight: '32px' }}
            >
              Choose a new password
            </h1>
            <p className="text-[var(--color-canvas-mute,#888888)] mb-6" style={{ fontSize: '14px', lineHeight: '20px' }}>
              Enter a new password for your account.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              {/* New password */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="password"
                  className="text-[var(--color-canvas-body,#171717)] font-medium"
                  style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
                >
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearField('password'); }}
                  required
                  placeholder="Min. 8 characters"
                  className="field-input"
                  style={{ fontSize: '14px', lineHeight: '20px', borderColor: fieldErrors.password ? 'var(--color-btn-danger-fg, #ee0000)' : undefined }}
                  autoComplete="new-password"
                />
                {fieldErrors.password && <FieldError message={fieldErrors.password} />}
              </div>

              {/* Confirm new password */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="confirmPassword"
                  className="text-[var(--color-canvas-body,#171717)] font-medium"
                  style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
                >
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); clearField('confirmPassword'); }}
                  required
                  placeholder="••••••••"
                  className="field-input"
                  style={{ fontSize: '14px', lineHeight: '20px', borderColor: fieldErrors.confirmPassword ? 'var(--color-btn-danger-fg, #ee0000)' : undefined }}
                  autoComplete="new-password"
                />
                {fieldErrors.confirmPassword && <FieldError message={fieldErrors.confirmPassword} />}
              </div>

              {/* Top-level API error */}
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
                Update password
              </button>
            </form>
          </>
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
    </div>
  );
}

export default ResetPassword;
