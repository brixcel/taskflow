import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

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
      await axios.post('http://localhost:3000/auth/forgot-password', {
        email: email.trim(),
      });

      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    }
  };

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
        <h1
          className="text-[#171717] font-semibold mb-1 tracking-[-0.96px]"
          style={{ fontSize: '24px', lineHeight: '32px' }}
        >
          Reset your password
        </h1>
        <p className="text-[#888888] mb-6" style={{ fontSize: '14px', lineHeight: '20px' }}>
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>

        {success ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 px-3 py-2.5 bg-[#d4f7e6] border border-[#00aa55]/20 rounded-[6px]">
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
              <div>
                <p className="text-[#006633] font-medium" style={{ fontSize: '13px', lineHeight: '20px' }}>
                  Check your email
                </p>
                <p className="text-[#006633]" style={{ fontSize: '13px', lineHeight: '20px' }}>
                  If that email is registered, we&apos;ve sent a reset link. Check your inbox (and spam folder).
                </p>
              </div>
            </div>

            <Link
              to="/"
              className="w-full h-10 bg-[#171717] text-white font-medium rounded-[100px] transition-opacity hover:opacity-80 active:opacity-70 cursor-pointer flex items-center justify-center"
              style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
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
                className="text-[#171717] font-medium"
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
                className="w-full h-10 px-3 bg-[#ffffff] text-[#171717] border border-[#ebebeb] rounded-[6px] outline-none transition-colors placeholder:text-[#888888] focus:border-[#a1a1a1] focus:ring-2 focus:ring-[#171717]/5"
                style={{ fontSize: '14px', lineHeight: '20px' }}
                autoComplete="email"
              />
            </div>

            {/* Error message */}
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
              Send reset link
            </button>
          </form>
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

export default ForgotPassword;
