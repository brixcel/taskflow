import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await axios.post('http://localhost:3000/auth/login', {
        email,
        password,
      });

      const { token, user } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      // Fetch the user's team memberships and store the active team.
      try {
        const teamsRes = await axios.get('http://localhost:3000/teams/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const teams = teamsRes.data.teams;
        if (teams && teams.length > 0) {
          const active = teams[0];
          localStorage.setItem('teamId', active.id);
          localStorage.setItem('team', JSON.stringify({ id: active.id, name: active.name, role: active.role }));
          navigate('/dashboard');
        } else {
          // No teams yet — send to onboarding.
          navigate('/onboarding');
        }
      } catch {
        // If teams fetch fails, still proceed but let dashboard handle the redirect.
        navigate('/onboarding');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center px-4">

      {/* Wordmark */}
      <div className="mb-8 flex items-center gap-2">
        {/* Square logo mark */}
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

      {/* Auth card — ex-auth-form-card */}
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
          Log in
        </h1>
        <p className="text-[#888888] mb-6" style={{ fontSize: '14px', lineHeight: '20px' }}>
          Enter your credentials to access your workspace.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="text-[#171717] font-medium"
                style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
              >
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-[#888888] hover:text-[#171717] hover:underline transition-colors"
                style={{ fontSize: '13px', lineHeight: '20px' }}
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full h-10 px-3 bg-[#ffffff] text-[#171717] border border-[#ebebeb] rounded-[6px] outline-none transition-colors placeholder:text-[#888888] focus:border-[#a1a1a1] focus:ring-2 focus:ring-[#171717]/5"
              style={{ fontSize: '14px', lineHeight: '20px' }}
            />
          </div>

          {/* Error message */}
          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 bg-[#f7d4d6] border border-[#ee0000]/20 rounded-[6px]"
            >
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
            Log in
          </button>
        </form>

        {/* Link to register */}
        <p
          className="mt-6 pt-6 border-t border-[#ebebeb] text-center text-[#888888]"
          style={{ fontSize: '13px', lineHeight: '20px' }}
        >
          Don&apos;t have an account?{' '}
          <Link
            to="/register"
            className="text-[#171717] font-medium hover:underline"
          >
            Create one
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

export default Login;
