import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle';
import { API_URL } from '../api/config';
import SyncTaskLogo from '../components/SyncTaskLogo';
import TurnstileWidget from '../components/TurnstileWidget';

const MIN_PASSWORD_LENGTH = 8;

function Logo({ dark = false }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <SyncTaskLogo size={28} textColor={dark ? 'var(--color-canvas-ink, #0f1011)' : '#f0f1f3'} />
    </div>
  );
}


function FieldError({ message }) {
  return (
    <p role="alert" style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-btn-danger-fg, #d93025)', display: 'flex', alignItems: 'center', gap: 4 }}>
      <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M7 4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="7" cy="9.5" r="0.7" fill="currentColor" />
      </svg>
      {message}
    </p>
  );
}

function Field({ id, label, type = 'text', value, onChange, placeholder, required, autoComplete, error, autoFocus }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-body, #3d4148)' }}>{label}</label>
      <input
        id={id} type={type} value={value} onChange={onChange}
        placeholder={placeholder} required={required} autoComplete={autoComplete} autoFocus={autoFocus}
        className="field-input"
        style={{ borderColor: error ? 'var(--color-btn-danger-fg, #d93025)' : undefined }}
      />
      {error && <FieldError message={error} />}
    </div>
  );
}

export default function Register() {
  const [name,            setName]            = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hpCompanyUrl,    setHpCompanyUrl]    = useState('');
  const [turnstileToken,  setTurnstileToken]  = useState('');
  const [formLoadTime]                        = useState(() => Date.now());
  const [fieldErrors,     setFieldErrors]     = useState({});
  const [error,           setError]           = useState('');
  const [loading,         setLoading]         = useState(false);
  const [registered,      setRegistered]      = useState(false);
  const navigate = useNavigate();

  // Navigation Guard: Redirect already authenticated users straight to Dashboard
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const clearFieldError = (key) => setFieldErrors(p => ({ ...p, [key]: undefined }));

  const validate = () => {
    const errors = {};
    if (!name.trim()) errors.name = 'Name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email.';
    if (password.length < MIN_PASSWORD_LENGTH) errors.password = `At least ${MIN_PASSWORD_LENGTH} characters.`;
    if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setFieldErrors({});
    const errors = validate();
    if (Object.keys(errors).length > 0) { setFieldErrors(errors); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/register`, {
        name: name.trim(),
        email: email.trim(),
        password,
        hp_company_url: hpCompanyUrl,
        turnstileToken,
        _formTime: formLoadTime,
      }, { timeout: 30000 });
      const { token, user } = res.data;
      if (token) localStorage.setItem('token', token);
      if (user)  localStorage.setItem('user', JSON.stringify(user));
      setRegistered(true);
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors && typeof data.errors === 'object') {
        setFieldErrors(data.errors);
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Server is waking up (cold start) or taking longer than expected. Please wait a moment and click Create account again.');
      } else if (!err.response) {
        setError(`Unable to connect to backend at ${API_URL}. Please ensure the backend is running and VITE_API_URL is configured in Vercel.`);
      } else {
        setError(data?.error || data?.message || 'Registration failed. Please try again.');
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-shell">
      {/* Dark left panel */}
      <div className="auth-panel-dark">
        <div>
          <Logo />
          <div style={{ marginTop: 48 }}>
            <p style={{ margin: '0 0 16px', fontSize: 28, fontWeight: 700, color: '#f0f1f3', letterSpacing: '-0.8px', lineHeight: '36px' }}>
              Collaborate without<br />the chaos.
            </p>
            <p style={{ margin: 0, fontSize: 14, color: '#50545c', lineHeight: '22px' }}>
              Create your workspace and invite your team in minutes.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {['Free to get started', 'No credit card required', 'Invite unlimited teammates', 'Export your data anytime'].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#1c1d1f', border: '1px solid #2a2d31', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2L8 3" stroke="#8a8f98" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              <span style={{ fontSize: 13, color: '#8a8f98' }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Light/Dark right panel */}
      <main className="auth-panel-light">
        {/* Top right theme toggle */}
        <div style={{ position: 'absolute', top: 20, right: 24 }}>
          <ThemeToggle variant="icon" size="sm" />
        </div>

        <div style={{ width: '100%', maxWidth: 380 }}>

          {registered ? (
            /* ── Check-your-email state ── */
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10, background: 'var(--color-banner-success-bg, #e8f5ed)',
                border: '1px solid var(--color-banner-success-border, #a8d5b8)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 20px',
              }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <rect x="2" y="5" width="16" height="11" rx="2" stroke="var(--color-banner-success-fg, #1a7a48)" strokeWidth="1.5" />
                  <path d="M2 8l8 5 8-5" stroke="var(--color-banner-success-fg, #1a7a48)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: 'var(--color-canvas-ink, #0f1011)', letterSpacing: '-0.6px' }}>
                Check your email
              </h1>
              <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--color-canvas-body, #50545c)', lineHeight: '20px' }}>
                We sent a verification link to <strong style={{ color: 'var(--color-canvas-ink, #0f1011)' }}>{email.trim()}</strong>.
                Click it to activate your account.
              </p>
              <button className="btn-primary" style={{ width: '100%', height: 40 }} onClick={() => navigate('/onboarding')}>
                Continue to onboarding
              </button>
              <p style={{ marginTop: 16, fontSize: 12, color: 'var(--color-canvas-mute, #50545c)', lineHeight: '18px' }}>
                Didn't receive it? Check spam, or resend from your dashboard.
              </p>
            </div>
          ) : (
            /* ── Registration form ── */
            <>
              <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--color-canvas-ink, #0f1011)', letterSpacing: '-0.6px' }}>
                Create your account
              </h1>
              <p style={{ margin: '0 0 28px', fontSize: 14, color: 'var(--color-canvas-body, #50545c)' }}>
                Get started with SyncTask for free.
              </p>

              <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                {/* Anti-Bot Honeypot Field (invisible to humans, filled by automated spam scripts) */}
                <div style={{ display: 'none', position: 'absolute', left: '-9999px' }} aria-hidden="true">
                  <label htmlFor="hp_company_url">Company Website</label>
                  <input
                    id="hp_company_url"
                    type="text"
                    name="hp_company_url"
                    value={hpCompanyUrl}
                    onChange={e => setHpCompanyUrl(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                <Field id="name" label="Full name" value={name}
                  onChange={e => { setName(e.target.value); clearFieldError('name'); }}
                  placeholder="Your name" required autoComplete="name" autoFocus error={fieldErrors.name}
                />
                <Field id="email" label="Email" type="email" value={email}
                  onChange={e => { setEmail(e.target.value); clearFieldError('email'); }}
                  placeholder="you@example.com" required autoComplete="email" error={fieldErrors.email}
                />
                <Field id="password" label="Password" type="password" value={password}
                  onChange={e => { setPassword(e.target.value); clearFieldError('password'); }}
                  placeholder="Min. 8 characters" required autoComplete="new-password" error={fieldErrors.password}
                />
                <Field id="confirmPassword" label="Confirm password" type="password" value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); clearFieldError('confirmPassword'); }}
                  placeholder="••••••••" required autoComplete="new-password" error={fieldErrors.confirmPassword}
                />

                {error && (
                  <div className="error-banner">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M7 4v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <circle cx="7" cy="9.5" r="0.7" fill="currentColor" />
                    </svg>
                    {error}
                  </div>
                )}

                <TurnstileWidget onVerify={setTurnstileToken} onExpire={() => setTurnstileToken('')} />

                <button type="submit" className="btn-primary" style={{ width: '100%', height: 40, marginTop: 4 }} disabled={loading}>
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
              </form>

              <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--color-canvas-hairline, #f0f1f3)', textAlign: 'center', fontSize: 13, color: 'var(--color-canvas-mute, #50545c)' }}>
                <p style={{ margin: '0 0 10px' }}>
                  Already have an account?{' '}
                  <Link to="/" style={{ color: 'var(--color-canvas-ink, #0f1011)', fontWeight: 500, textDecoration: 'none' }}
                    onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                    onMouseLeave={e => e.target.style.textDecoration = 'none'}
                  >
                    Sign in
                  </Link>
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 14, fontSize: 12, color: 'var(--color-canvas-mute, #50545c)' }}>
                  <Link to="/terms" style={{ color: 'var(--color-canvas-mute, #50545c)', textDecoration: 'none' }}
                    onMouseEnter={e => e.target.style.color = 'var(--color-canvas-ink, #0f1011)'}
                    onMouseLeave={e => e.target.style.color = 'var(--color-canvas-mute, #50545c)'}
                  >
                    Terms of Service
                  </Link>
                  <span>•</span>
                  <Link to="/privacy" style={{ color: 'var(--color-canvas-mute, #50545c)', textDecoration: 'none' }}
                    onMouseEnter={e => e.target.style.color = 'var(--color-canvas-ink, #0f1011)'}
                    onMouseLeave={e => e.target.style.color = 'var(--color-canvas-mute, #50545c)'}
                  >
                    Privacy Policy
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
