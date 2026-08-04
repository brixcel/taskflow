import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../components/Navbar';

// ── Constants ──────────────────────────────────────────────────────────────────
const API = 'http://localhost:3000';

const STATUS_CONFIG = {
  todo: {
    label: 'todo',
    bg: '#f5f5f5',
    color: '#4d4d4d',
    border: '#e0e0e0',
  },
  in_progress: {
    label: 'in progress',
    bg: '#ffefcf',
    color: '#ab570a',
    border: '#f5a62340',
  },
  done: {
    label: 'done',
    bg: '#d3f4e3',
    color: '#0a7c42',
    border: '#0a7c4240',
  },
};

const TABS = [
  { key: 'all',   label: 'All tasks' },
  { key: 'mine',  label: 'My tasks'  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.todo;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full border font-medium shrink-0"
      style={{
        fontSize: '11px',
        lineHeight: '16px',
        letterSpacing: '0.01em',
        backgroundColor: cfg.bg,
        color: cfg.color,
        borderColor: cfg.border,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      }}
    >
      {cfg.label}
    </span>
  );
}

// Compact avatar/initials chip shown next to a task row
function AssigneeChip({ name }) {
  if (!name) return null;
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      title={name}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#f0f0f0] border border-[#e0e0e0] text-[#4d4d4d] font-medium shrink-0"
      style={{
        fontSize: '10px',
        lineHeight: '1',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        letterSpacing: '0.02em',
      }}
      aria-label={`Assigned to ${name}`}
    >
      {initials}
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getActiveTeam() {
  try { return JSON.parse(localStorage.getItem('team')); }
  catch { return null; }
}

function getCurrentUserId() {
  try { return JSON.parse(localStorage.getItem('user'))?.id ?? null; }
  catch { return null; }
}

// ── useDebounce ────────────────────────────────────────────────────────────────
function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
function Dashboard() {
  // ── Auth / team state ───────────────────────────────────────────────────────
  const [teams, setTeams]           = useState([]);
  const [activeTeam, setActiveTeam] = useState(getActiveTeam);
  const navigate  = useNavigate();
  const token     = localStorage.getItem('token');
  const teamId    = localStorage.getItem('teamId');
  const currentUserId = getCurrentUserId();

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Team-Id': teamId,
  };

  // ── Members (for assignee dropdown) ────────────────────────────────────────
  const [members, setMembers] = useState([]);

  // ── Task list state ────────────────────────────────────────────────────────
  const [tasks, setTasks]   = useState([]);
  const [error, setError]   = useState('');

  // ── Filters ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab]       = useState('all'); // 'all' | 'mine'
  const [searchInput, setSearchInput]   = useState('');
  const debouncedSearch                 = useDebounce(searchInput, 350);

  // ── Create-task form ────────────────────────────────────────────────────────
  const [newTitle,      setNewTitle]      = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');

  // ── Fetch helpers ───────────────────────────────────────────────────────────
  const fetchTeams = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/teams/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTeams(res.data.teams ?? []);
    } catch { /* non-fatal */ }
  }, [token]);

  const fetchMembers = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await axios.get(`${API}/teams/${teamId}/members`, { headers });
      setMembers(res.data.members ?? []);
    } catch { /* non-fatal — assignee dropdown just stays empty */ }
  }, [teamId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTasks = useCallback(async () => {
    if (!teamId) return;
    try {
      const params = {};
      if (activeTab === 'mine' && currentUserId) params.assigneeId = currentUserId;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();

      const res = await axios.get(`${API}/tasks`, { headers, params });
      setTasks(res.data.tasks ?? []);
      setError('');
    } catch {
      setError('Failed to load tasks');
    }
  }, [teamId, token, activeTab, currentUserId, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effects ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token)  { navigate('/'); return; }
    if (!teamId) { navigate('/onboarding'); return; }
    /* eslint-disable react-hooks/set-state-in-effect */
    fetchTeams();
    fetchMembers();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch tasks whenever filters change
  useEffect(() => {
    fetchTasks(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchTasks]);

  // ── Team switcher ───────────────────────────────────────────────────────────
  const handleTeamSwitch = (team) => {
    localStorage.setItem('teamId', team.id);
    localStorage.setItem('team', JSON.stringify({ id: team.id, name: team.name, role: team.role }));
    setActiveTeam({ id: team.id, name: team.name, role: team.role });
    navigate(0);
  };

  // ── Task CRUD ───────────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const body = { title: newTitle.trim() };
      if (newAssigneeId) body.assigneeId = newAssigneeId;
      await axios.post(`${API}/tasks`, body, { headers });
      setNewTitle('');
      setNewAssigneeId('');
      fetchTasks();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to create task';
      setError(msg);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await axios.patch(`${API}/tasks/${id}`, { status: newStatus }, { headers });
      fetchTasks();
    } catch {
      setError('Failed to update task');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/tasks/${id}`, { headers });
      fetchTasks();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete task';
      setError(msg);
    }
  };

  const handleLogout = () => {
    ['token', 'user', 'teamId', 'team'].forEach((k) => localStorage.removeItem(k));
    navigate('/');
  };

  // ── Derived counts ──────────────────────────────────────────────────────────
  const doneCount  = tasks.filter((t) => t.status === 'done').length;
  const totalCount = tasks.length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navbar
        teams={teams}
        activeTeam={activeTeam}
        onTeamSwitch={handleTeamSwitch}
        onLogout={handleLogout}
      />

      <main className="max-w-3xl mx-auto px-6 py-10">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1
            className="text-[#171717] font-semibold tracking-[-0.96px] mb-1"
            style={{ fontSize: '24px', lineHeight: '32px' }}
          >
            Tasks
          </h1>
          <p className="text-[#888888]" style={{ fontSize: '14px', lineHeight: '20px' }}>
            {totalCount === 0
              ? 'No tasks yet.'
              : `${totalCount} task${totalCount === 1 ? '' : 's'}`}
          </p>
        </div>

        {/* ── Create task form ─────────────────────────────────────────────── */}
        <form onSubmit={handleCreate} className="flex gap-2 mb-5">
          <input
            type="text"
            placeholder="New task title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
            className="flex-1 h-10 px-3 bg-[#ffffff] text-[#171717] border border-[#ebebeb] rounded-[6px] outline-none transition-colors placeholder:text-[#888888] focus:border-[#a1a1a1] focus:ring-2 focus:ring-[#171717]/5"
            style={{ fontSize: '14px', lineHeight: '20px' }}
          />

          {/* Assignee dropdown — only shown when there are members to pick */}
          {members.length > 0 && (
            <select
              value={newAssigneeId}
              onChange={(e) => setNewAssigneeId(e.target.value)}
              className="h-10 px-2 bg-[#ffffff] text-[#4d4d4d] border border-[#ebebeb] rounded-[6px] outline-none transition-colors hover:border-[#a1a1a1] focus:border-[#a1a1a1] cursor-pointer"
              style={{ fontSize: '13px', lineHeight: '20px', minWidth: '130px' }}
              aria-label="Assign to"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.id === currentUserId ? ' (you)' : ''}
                </option>
              ))}
            </select>
          )}

          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="h-10 px-4 bg-[#171717] text-white font-medium rounded-[6px] transition-opacity hover:opacity-80 active:opacity-70 cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
          >
            Add task
          </button>
        </form>

        {/* ── Tab bar + search row ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 mb-4">

          {/* Tabs */}
          <div
            className="flex items-center gap-0.5 bg-[#f5f5f5] border border-[#ebebeb] rounded-[8px] p-0.5"
            role="tablist"
            aria-label="Task filter"
          >
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setActiveTab(key)}
                className={[
                  'px-3 py-1 rounded-[6px] font-medium transition-colors cursor-pointer',
                  activeTab === key
                    ? 'bg-[#ffffff] text-[#171717] shadow-sm border border-[#ebebeb]'
                    : 'text-[#888888] hover:text-[#4d4d4d]',
                ].join(' ')}
                style={{ fontSize: '13px', lineHeight: '20px', letterSpacing: '-0.26px' }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search input */}
          <div className="relative flex-1 max-w-[240px]">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#a1a1a1] pointer-events-none"
              aria-hidden="true"
            >
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search tasks…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full h-8 pl-8 pr-3 bg-[#ffffff] text-[#171717] border border-[#ebebeb] rounded-[6px] outline-none transition-colors placeholder:text-[#a1a1a1] focus:border-[#a1a1a1] focus:ring-2 focus:ring-[#171717]/5"
              style={{ fontSize: '13px', lineHeight: '20px' }}
              aria-label="Search tasks"
            />
          </div>

        </div>

        {/* ── Error banner ─────────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-[#f7d4d6] border border-[#ee0000]/20 rounded-[6px] mb-4">
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

        {/* ── Task list ─────────────────────────────────────────────────────── */}
        {tasks.length === 0 && !error ? (
          <div className="flex flex-col items-center justify-center py-16 px-8 bg-[#fafafa] border border-[#ebebeb] rounded-[12px] text-center">
            <div className="w-10 h-10 rounded-[8px] bg-[#f5f5f5] border border-[#ebebeb] flex items-center justify-center mb-4">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <rect x="3" y="4"  width="12" height="1.5" rx="0.75" fill="#a1a1a1" />
                <rect x="3" y="8"  width="9"  height="1.5" rx="0.75" fill="#a1a1a1" />
                <rect x="3" y="12" width="6"  height="1.5" rx="0.75" fill="#a1a1a1" />
              </svg>
            </div>
            <p
              className="text-[#171717] font-medium mb-1"
              style={{ fontSize: '15px', lineHeight: '22px' }}
            >
              {debouncedSearch.trim()
                ? 'No tasks match your search'
                : activeTab === 'mine'
                ? 'No tasks assigned to you'
                : 'No tasks yet'}
            </p>
            <p className="text-[#888888]" style={{ fontSize: '13px', lineHeight: '20px' }}>
              {debouncedSearch.trim()
                ? 'Try a different search term.'
                : activeTab === 'mine'
                ? 'Tasks assigned to you will appear here.'
                : 'Add your first task using the field above.'}
            </p>
          </div>
        ) : (
          <div
            className="bg-[#ffffff] border border-[#ebebeb] rounded-[8px] overflow-hidden"
            style={{
              boxShadow:
                '0 0 0 0px transparent, 0px 1px 1px rgba(0,0,0,0.03), 0px 2px 2px rgba(0,0,0,0.06)',
            }}
          >
            {tasks.map((task, index) => (
              <div
                key={task.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  index < tasks.length - 1 ? 'border-b border-[#ebebeb]' : ''
                } hover:bg-[#fafafa] transition-colors group`}
              >
                {/* Task info */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[#171717] font-medium truncate"
                    style={{ fontSize: '14px', lineHeight: '20px', letterSpacing: '-0.28px' }}
                  >
                    {task.title}
                  </p>
                  {task.description && (
                    <p
                      className="text-[#888888] truncate mt-0.5"
                      style={{
                        fontSize: '12px',
                        lineHeight: '16px',
                        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                      }}
                    >
                      {task.description}
                    </p>
                  )}
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Assignee chip */}
                  <AssigneeChip name={task.assignee?.name} />

                  <StatusBadge status={task.status} />

                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(task.id, e.target.value)}
                    className="h-7 px-2 bg-[#ffffff] text-[#4d4d4d] border border-[#ebebeb] rounded-[6px] outline-none transition-colors hover:border-[#a1a1a1] focus:border-[#a1a1a1] cursor-pointer appearance-none"
                    style={{ fontSize: '12px', lineHeight: '16px' }}
                    aria-label={`Change status of ${task.title}`}
                  >
                    <option value="todo">todo</option>
                    <option value="in_progress">in progress</option>
                    <option value="done">done</option>
                  </select>

                  <button
                    onClick={() => handleDelete(task.id)}
                    className="h-7 px-2.5 bg-transparent text-[#888888] border border-transparent rounded-[6px] font-medium transition-colors hover:text-[#ee0000] hover:bg-[#f7d4d6] hover:border-[#ee0000]/20 cursor-pointer opacity-0 group-hover:opacity-100"
                    style={{ fontSize: '12px', lineHeight: '16px' }}
                    aria-label={`Delete task: ${task.title}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Footer count ─────────────────────────────────────────────────── */}
        {tasks.length > 0 && (
          <p
            className="mt-4 text-[#888888]"
            style={{
              fontSize: '12px',
              lineHeight: '16px',
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            }}
          >
            {doneCount}/{totalCount} completed
          </p>
        )}

      </main>
    </div>
  );
}

export default Dashboard;
