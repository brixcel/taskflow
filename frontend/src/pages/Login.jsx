import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle';
import { API_URL } from '../api/config';
import SyncTaskLogo from '../components/SyncTaskLogo';
import TurnstileWidget from '../components/TurnstileWidget';
import { Button, Input, Label } from '../components/ui';

function Logo({ dark = false }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <SyncTaskLogo size={28} textColor={dark ? 'var(--color-canvas-ink, #0f1011)' : '#f0f1f3'} />
    </div>
  );
}

function FieldInput({ id, label, type = 'text', value, onChange, placeholder, required, autoFocus, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[13px] font-medium text-[var(--color-canvas-body,#3d4148)]">{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
      />
      {hint && <p className="m-0 text-xs text-[var(--color-canvas-mute,#adb2ba)]">{hint}</p>}
    </div>
  );
}

export default function Login() {
  const [email,          setEmail]          = useState('');
  const [password,       setPassword]       = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error,          setError]          = useState('');
  const [loading,        setLoading]        = useState(false);
  const navigate = useNavigate();

  // Navigation Guard: Redirect already authenticated users straight to Dashboard
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
        turnstileToken,
      }, { timeout: 30000 });
      const { token, user } = res.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      try {
        const tRes = await axios.get(`${API_URL}/teams/me`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
        const teams = tRes.data.teams;
        if (teams?.length > 0) {
          const active = teams[0];
          localStorage.setItem('teamId', active.id);
          localStorage.setItem('team', JSON.stringify({ id: active.id, name: active.name, role: active.role }));
          navigate('/dashboard');
        } else { navigate('/onboarding'); }
      } catch { navigate('/onboarding'); }
    } catch (err) {
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Server is waking up (cold start). Please wait a few seconds and try again.');
      } else if (!err.response) {
        setError(`Unable to reach backend at ${API_URL}. Please check your connection or VITE_API_URL setting.`);
      } else {
        setError(err.response?.data?.error || 'Login failed. Check your credentials.');
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
              Your team's tasks,<br />one clean view.
            </p>
            <p style={{ margin: 0, fontSize: 14, color: '#8a8f98', lineHeight: '22px' }}>
              SyncTask keeps every task tracked, assigned, and visible — without the noise.
            </p>
          </div>
        </div>

        {/* Feature list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            'Multi-team workspaces',
            'Role-based permissions',
            'Real-time task tracking',
            'GDPR-ready data controls',
          ].map(f => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%', background: '#1c1d1f',
                border: '1px solid #2a2d31', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2 2L8 3" stroke="#8a8f98" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
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

        <div style={{ width: '100%', maxWidth: 360 }}>
          {/* Mobile logo */}
          <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }} className="auth-mobile-logo">
            <Logo dark />
          </div>

          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--color-canvas-ink, #0f1011)', letterSpacing: '-0.6px' }}>
            Welcome back
          </h1>
          <p style={{ margin: '0 0 28px', fontSize: 14, color: 'var(--color-canvas-body, #50545c)' }}>
            Sign in to your workspace.
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FieldInput
              id="email" label="Email" type="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required autoFocus
            />

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="password" className="text-[13px] font-medium text-[var(--color-canvas-body,#3d4148)]">Password</Label>
                <Link to="/forgot-password" className="text-[13px] text-[var(--color-canvas-mute,#50545c)] hover:text-[var(--color-canvas-ink,#0f1011)] no-underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="error-banner">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M7 4.5v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <circle cx="7" cy="9.5" r="0.7" fill="currentColor" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <TurnstileWidget onVerify={setTurnstileToken} onExpire={() => setTurnstileToken('')} />

            <Button type="submit" className="w-full h-10 mt-1" loading={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--color-canvas-hairline, #f0f1f3)', textAlign: 'center', fontSize: 13, color: 'var(--color-canvas-mute, #50545c)' }}>
            <p style={{ margin: '0 0 10px' }}>
              Don't have an account?{' '}
              <Link to="/register" style={{ color: 'var(--color-canvas-ink, #0f1011)', fontWeight: 500, textDecoration: 'none' }}
                onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                onMouseLeave={e => e.target.style.textDecoration = 'none'}
              >
                Create one
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
        </div>
      </main>
    </div>
  );
}
