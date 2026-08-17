import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ThemeToggle from '../components/ThemeToggle';
import SyncTaskLogo from '../components/SyncTaskLogo';
import { API_URL } from '../api/config';

function Onboarding() {
  // 'create' | 'join'
  const [mode, setMode] = useState('create');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  // If no token, bounce to login.
  useEffect(() => {
    if (!token) {
      navigate('/');
    }
  }, [token, navigate]);

  if (!token) return null;

  const authHeaders = { Authorization: `Bearer ${token}` };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const name = teamName.trim();
    if (!name) {
      setError('Please enter a team name.');
      return;
    }

    setLoading(true);
    try {
      let team;

      if (mode === 'create') {
        const res = await axios.post(
          `${API_URL}/teams`,
          { name },
          { headers: authHeaders }
        );
        team = res.data.team;
      } else {
        const res = await axios.post(
          `${API_URL}/teams/join`,
          { teamName: name },
          { headers: authHeaders }
        );
        team = res.data.team;
      }

      // Fetch fresh membership to get the role.
      const teamsRes = await axios.get(`${API_URL}/teams/me`, {
        headers: authHeaders,
      });
      const membership = teamsRes.data.teams.find((t) => t.id === team.id);
      const role = membership?.role ?? 'member';

      localStorage.setItem('teamId', team.id);
      localStorage.setItem('team', JSON.stringify({ id: team.id, name: team.name, role }));

      navigate('/dashboard');
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.clear();
        navigate('/');
        return;
      }
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
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


      {/* Card */}
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
          Set up your team
        </h1>
        <p className="text-[var(--color-canvas-mute,#888888)] mb-6" style={{ fontSize: '14px', lineHeight: '20px' }}>
          Create a new team or join an existing one to get started.
        </p>

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 bg-[var(--color-canvas-hover,#f5f5f5)] rounded-[8px] mb-6">
          {[
            { value: 'create', label: 'Create a team' },
            { value: 'join',   label: 'Join a team'   },
          ].map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => { setMode(value); setError(''); setTeamName(''); }}
              className={`flex-1 h-8 rounded-[6px] font-medium transition-colors cursor-pointer border-0 ${
                mode === value
                  ? 'bg-[var(--color-canvas-card,#ffffff)] text-[var(--color-canvas-ink,#171717)] shadow-sm'
                  : 'bg-transparent text-[var(--color-canvas-mute,#888888)] hover:text-[var(--color-canvas-ink,#171717)]'
              }`}
              style={{ fontSize: '13px', lineHeight: '20px', letterSpacing: '-0.28px' }}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="teamName"
              className="text-[var(--color-canvas-body,#171717)] font-medium"
              style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
            >
              {mode === 'create' ? 'Team name' : 'Team name to join'}
            </label>
            <input
              id="teamName"
              type="text"
              value={teamName}
              onChange={(e) => { setTeamName(e.target.value); setError(''); }}
              placeholder={mode === 'create' ? 'e.g. Acme Engineering' : 'Enter the exact team name'}
              required
              className="field-input"
              style={{ fontSize: '14px', lineHeight: '20px' }}
              autoComplete="off"
            />
          </div>

          {/* Error banner */}
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

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ width: '100%', height: 40, marginTop: 4 }}
          >
            {loading
              ? mode === 'create' ? 'Creating…' : 'Joining…'
              : mode === 'create' ? 'Create team' : 'Join team'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-[var(--color-canvas-mute,#888888)]" style={{ fontSize: '12px' }}>
        SyncTask — team task manager
      </p>
    </div>
  );
}

export default Onboarding;
