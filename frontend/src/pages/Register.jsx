import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

// Minimum password length — keep in sync with backend rule
const MIN_PASSWORD_LENGTH = 8;

function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // ── Client-side validation ──────────────────────────────────────────────────
  const validate = () => {
    const errors = {};

    // Name required
    if (!name.trim()) {
      errors.name = 'Name is required.';
    }

    // Email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }

    // Password length
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    // Confirm match
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
      await axios.post('http://localhost:3000/auth/register', {
        name: name.trim(),
        email: email.trim(),
        password,
      });

      // Registration successful — send to onboarding to create/join a team
      navigate('/onboarding');
    } catch (err) {
      // Surface backend validation messages if present
      const data = err.response?.data;
      if (data?.errors && typeof data.errors === 'object') {
        // Backend returned field-level errors (e.g. { email: '...' })
        setFieldErrors(data.errors);
      } else {
        setError(data?.error || data?.message || 'Registration failed. Please try again.');
      }
    }
  };

  // ── Shared input class ──────────────────────────────────────────────────────
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
        <h1
          className="text-[#171717] font-semibold mb-1 tracking-[-0.96px]"
          style={{ fontSize: '24px', lineHeight: '32px' }}
        >
          Create an account
        </h1>
        <p className="text-[#888888] mb-6" style={{ fontSize: '14px', lineHeight: '20px' }}>
          Get started with your TaskFlow workspace.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="name"
              className="text-[#171717] font-medium"
              style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }));
              }}
              required
              placeholder="Your name"
              className={inputClass(!!fieldErrors.name)}
              style={{ fontSize: '14px', lineHeight: '20px' }}
              autoComplete="name"
            />
            {fieldErrors.name && <FieldError message={fieldErrors.name} />}
          </div>

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
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
              }}
              required
              placeholder="you@example.com"
              className={inputClass(!!fieldErrors.email)}
              style={{ fontSize: '14px', lineHeight: '20px' }}
              autoComplete="email"
            />
            {fieldErrors.email && (
              <FieldError message={fieldErrors.email} />
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-[#171717] font-medium"
              style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
              }}
              required
              placeholder="Min. 8 characters"
              className={inputClass(!!fieldErrors.password)}
              style={{ fontSize: '14px', lineHeight: '20px' }}
              autoComplete="new-password"
            />
            {fieldErrors.password && (
              <FieldError message={fieldErrors.password} />
            )}
          </div>

          {/* Confirm password */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="confirmPassword"
              className="text-[#171717] font-medium"
              style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
            >
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (fieldErrors.confirmPassword)
                  setFieldErrors((p) => ({ ...p, confirmPassword: undefined }));
              }}
              required
              placeholder="••••••••"
              className={inputClass(!!fieldErrors.confirmPassword)}
              style={{ fontSize: '14px', lineHeight: '20px' }}
              autoComplete="new-password"
            />
            {fieldErrors.confirmPassword && (
              <FieldError message={fieldErrors.confirmPassword} />
            )}
          </div>

          {/* Top-level error banner */}
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
            Create account
          </button>
        </form>

        {/* Link to login */}
        <p
          className="mt-6 pt-6 border-t border-[#ebebeb] text-center text-[#888888]"
          style={{ fontSize: '13px', lineHeight: '20px' }}
        >
          Already have an account?{' '}
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

// Inline field-level error — red text below the input
function FieldError({ message }) {
  return (
    <p
      className="text-[#ee0000] flex items-center gap-1"
      style={{ fontSize: '12px', lineHeight: '16px' }}
      role="alert"
    >
      <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 4v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="7" cy="10" r="0.75" fill="currentColor" />
      </svg>
      {message}
    </p>
  );
}

export default Register;
