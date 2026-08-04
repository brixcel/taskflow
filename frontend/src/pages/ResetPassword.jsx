import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';

const MIN_PASSWORD_LENGTH = 8;

// Shared field-level error component (same pattern as Register.jsx)
function FieldError({ message }) {
  return (
    <p className="text-[#c50000]" style={{ fontSize: '12px', lineHeight: '16px' }}>
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
      await axios.post('http://localhost:3000/auth/reset-password', {
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

  const inputClass = (hasError) =>
    `w-full h-10 px-3 bg-[#ffffff] text-[#171717] border rounded-[6px] outline-none transition-colors placeholder:text-[#888888] focus:ring-2 focus:ring-[#171717]/5 ${
      hasError
        ? 'border-[#ee0000] focus:border-[#ee0000]'
        : 'border-[#ebebeb] focus:border-[#a1a1a1]'
    }`;

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center px-4">

      {/* Wordmark */}
      <div className="mb-8 flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-[6px] bg-[#171717]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M2 11 L7 3 L12 11"
              stroke="white"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span
          className="text-[#171717] font-semibold tracking-[-0.6px]"
          style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: '18px' }}
        >
          TaskFlow
        </span>
      </div>

      {/* Auth card */}
      <div
        className="w-full max-w-[400px] bg-[#ffffff] rounded-[12px] p-8"
        style={{
          boxShadow:
            '0 0 0 1px rgba(0,0,0,0.08), 0px 1px 1px rgba(0,0,0,0.03), 0px 2px 2px rgba(0,0,0,0.06)',
        }}
      >
        {/* ── Missing token state ── */}
        {missingToken && (
          <>
            <h1
              className="text-[#171717] font-semibold mb-1 tracking-[-0.96px]"
              style={{ fontSize: '24px', lineHeight: '32px' }}
            >
              Invalid reset link
            </h1>
            <p className="text-[#888888] mb-6" style={{ fontSize: '14px', lineHeight: '20px' }}>
              This link is missing a reset token. Please request a new one.
            </p>
            <Link
              to="/forgot-password"
              className="w-full h-10 bg-[#171717] text-white font-medium rounded-[100px] transition-opacity hover:opacity-80 active:opacity-70 cursor-pointer flex items-center justify-center"
              style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
            >
              Request new link
            </Link>
          </>
        )}

        {/* ── Success state ── */}
        {!missingToken && success && (
          <>
            <h1
              className="text-[#171717] font-semibold mb-1 tracking-[-0.96px]"
              style={{ fontSize: '24px', lineHeight: '32px' }}
            >
              Password updated
            </h1>
            <div className="flex items-start gap-2 px-3 py-2.5 bg-[#d4f7e6] border border-[#00aa55]/20 rounded-[6px] mb-4">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                className="shrink-0 text-[#00aa55] mt-0.5"
                aria-hidden="true"
              >
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 7 L6 9 L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-[#006633]" style={{ fontSize: '13px', lineHeight: '20px' }}>
                Your password has been updated. Redirecting you to login&hellip;
              </p>
            </div>
            <Link
              to="/"
              className="w-full h-10 bg-[#171717] text-white font-medium rounded-[100px] transition-opacity hover:opacity-80 active:opacity-70 cursor-pointer flex items-center justify-center"
              style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
            >
              Go to login
            </Link>
          </>
        )}

        {/* ── Form state ── */}
        {!missingToken && !success && (
          <>
            <h1
              className="text-[#171717] font-semibold mb-1 tracking-[-0.96px]"
              style={{ fontSize: '24px', lineHeight: '32px' }}
            >
              Choose a new password
            </h1>
            <p className="text-[#888888] mb-6" style={{ fontSize: '14px', lineHeight: '20px' }}>
              Enter a new password for your account.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              {/* New password */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="password"
                  className="text-[#171717] font-medium"
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
                  className={inputClass(!!fieldErrors.password)}
                  style={{ fontSize: '14px', lineHeight: '20px' }}
                  autoComplete="new-password"
                />
                {fieldErrors.password && <FieldError message={fieldErrors.password} />}
              </div>

              {/* Confirm new password */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="confirmPassword"
                  className="text-[#171717] font-medium"
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
                  className={inputClass(!!fieldErrors.confirmPassword)}
                  style={{ fontSize: '14px', lineHeight: '20px' }}
                  autoComplete="new-password"
                />
                {fieldErrors.confirmPassword && <FieldError message={fieldErrors.confirmPassword} />}
              </div>

              {/* Top-level API error */}
              {error && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-[#f7d4d6] border border-[#ee0000]/20 rounded-[6px]">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    className="shrink-0 text-[#ee0000]"
                    aria-hidden="true"
                  >
                    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M7 4v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="7" cy="10" r="0.75" fill="currentColor" />
                  </svg>
                  <p className="text-[#c50000]" style={{ fontSize: '13px', lineHeight: '20px' }}>
                    {error}
                  </p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                className="w-full h-10 bg-[#171717] text-white font-medium rounded-[100px] transition-opacity hover:opacity-80 active:opacity-70 cursor-pointer mt-1"
                style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
              >
                Update password
              </button>
            </form>
          </>
        )}

        {/* Link back to login */}
        <p
          className="mt-6 pt-6 border-t border-[#ebebeb] text-center text-[#888888]"
          style={{ fontSize: '13px', lineHeight: '20px' }}
        >
          Remember your password?{' '}
          <Link
            to="/"
            className="text-[#171717] font-medium hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>

      {/* Footer hint */}
      <p className="mt-6 text-[#888888]" style={{ fontSize: '12px' }}>
        TaskFlow — team task manager
      </p>
    </div>
  );
}

export default ResetPassword;
