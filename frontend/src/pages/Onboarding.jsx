import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

function Onboarding() {
  // 'create' | 'join'
  const [mode, setMode] = useState('create');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const token = localStorage.getItem('token');

  // If somehow no token, bounce to login.
  if (!token) {
    navigate('/');
    return null;
  }

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
          'http://localhost:3000/teams',
          { name },
          { headers: authHeaders }
        );
        team = res.data.team;
      } else {
        const res = await axios.post(
          'http://localhost:3000/teams/join',
          { teamName: name },
          { headers: authHeaders }
        );
        team = res.data.team;
      }

      // Fetch fresh membership to get the role.
      const teamsRes = await axios.get('http://localhost:3000/teams/me', {
        headers: authHeaders,
      });
      const membership = teamsRes.data.teams.find((t) => t.id === team.id);
      const role = membership?.role ?? 'member';

      localStorage.setItem('teamId', team.id);
      localStorage.setItem('team', JSON.stringify({ id: team.id, name: team.name, role }));

      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full h-10 px-3 bg-[#ffffff] text-[#171717] border border-[#ebebeb] rounded-[6px] outline-none transition-colors placeholder:text-[#888888] focus:border-[#a1a1a1] focus:ring-2 focus:ring-[#171717]/5';

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

      {/* Card */}
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
          Set up your team
        </h1>
        <p className="text-[#888888] mb-6" style={{ fontSize: '14px', lineHeight: '20px' }}>
          Create a new team or join an existing one to get started.
        </p>

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 bg-[#f5f5f5] rounded-[8px] mb-6">
          {[
            { value: 'create', label: 'Create a team' },
            { value: 'join',   label: 'Join a team'   },
          ].map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => { setMode(value); setError(''); setTeamName(''); }}
              className={`flex-1 h-8 rounded-[6px] font-medium transition-colors cursor-pointer ${
                mode === value
                  ? 'bg-[#ffffff] text-[#171717] shadow-sm'
                  : 'text-[#888888] hover:text-[#171717]'
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
              className="text-[#171717] font-medium"
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
              className={inputClass}
              style={{ fontSize: '14px', lineHeight: '20px' }}
              autoComplete="off"
            />
          </div>

          {/* Error banner */}
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

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-[#171717] text-white font-medium rounded-[100px] transition-opacity hover:opacity-80 active:opacity-70 cursor-pointer mt-1 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
          >
            {loading
              ? mode === 'create' ? 'Creating…' : 'Joining…'
              : mode === 'create' ? 'Create team' : 'Join team'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-[#888888]" style={{ fontSize: '12px' }}>
        TaskFlow — team task manager
      </p>
    </div>
  );
}

export default Onboarding;
