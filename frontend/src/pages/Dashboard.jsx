import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import * as Sentry from '@sentry/react';
import Sidebar from '../components/Sidebar';
import TaskSkeleton from '../components/TaskSkeleton';
import TaskDetailDrawer from '../components/TaskDetailDrawer';
import AnalyticsOverview from '../components/AnalyticsOverview';
import ThemeToggle from '../components/ThemeToggle';
import { API_URL } from '../api/config';

// ── Constants ──────────────────────────────────────────────────────────────
const API = API_URL;

// ── Helpers ────────────────────────────────────────────────────────────────
function getActiveTeam()     { try { return JSON.parse(localStorage.getItem('team')); }   catch { return null; } }
function getCurrentUser()    { try { return JSON.parse(localStorage.getItem('user')); }   catch { return null; } }
function getCurrentUserId()  { return getCurrentUser()?.id ?? null; }
function getCurrentUserEmail() { return getCurrentUser()?.email ?? null; }
function isEmailVerified()   { try { return JSON.parse(localStorage.getItem('user'))?.emailVerified === true; } catch { return true; } }

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function formatDueDate(dueDateStr) {
  if (!dueDateStr) return null;
  const d = new Date(dueDateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function isOverdue(dueDateStr, status) {
  if (!dueDateStr || status === 'done') return false;
  const d = new Date(dueDateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const endOfDueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return endOfDueDay < now;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function AssigneeAvatar({ name }) {
  if (!name) return null;
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span
      title={name}
      aria-label={`Assigned to ${name}`}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 24, height: 24, borderRadius: '50%',
        background: '#f0f1f3', border: '1.5px solid #e8eaec',
        fontSize: 10, fontWeight: 600, color: '#3d4148',
        fontFamily: "'JetBrains Mono', monospace", flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ color: '#adb2ba' }}>
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 2.5V11.5M2.5 7H11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// ── New Task Modal ─────────────────────────────────────────────────────────
function NewTaskModal({ members, currentUserId, onSubmit, onClose }) {
  const [title,      setTitle]      = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate,    setDueDate]    = useState('');
  const [loading,    setLoading]    = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    await onSubmit({
      title: title.trim(),
      assigneeId: assigneeId || undefined,
      dueDate: dueDate || undefined,
    });
    setLoading(false);
  };

  // Close on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'var(--color-modal-backdrop, rgba(0,0,0,0.35))', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div style={{
        background: 'var(--color-modal-bg, #fff)', borderRadius: 12, width: '100%', maxWidth: 460,
        border: '1px solid var(--color-modal-border, #ebebeb)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        padding: 28,
      }}>
        <h2 id="modal-title" style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)', letterSpacing: '-0.4px' }}>
          New task
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="modal-task-title" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-body, #4d4d4d)' }}>Title</label>
            <input
              id="modal-task-title"
              className="field-input"
              type="text"
              placeholder="Task title…"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              required
            />
          </div>

          {/* Due Date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="modal-task-duedate" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-body, #4d4d4d)' }}>Due date</label>
            <input
              id="modal-task-duedate"
              className="field-input"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>

          {/* Assignee */}
          {members.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label htmlFor="modal-task-assignee" style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-body, #4d4d4d)' }}>Assign to</label>
              <select
                id="modal-task-assignee"
                className="field-input"
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                style={{ cursor: 'pointer' }}
              >
                <option value="">Unassigned</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.id === currentUserId ? ' (you)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading || !title.trim()}>
              {loading ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Task Row ───────────────────────────────────────────────────────────────
function TaskRow({ task, onStatusChange, onDelete, onSelect, isLast }) {
  const [hovered, setHovered] = useState(false);

  const formattedDate = formatDueDate(task.dueDate);
  const overdue       = isOverdue(task.dueDate, task.status);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--color-canvas-hairline, #ebebeb)',
        background: hovered ? 'var(--color-canvas-hover, #fafafa)' : 'var(--color-canvas-card, #fff)',
        transition: 'background 100ms',
      }}
    >
      {/* Checkbox-style circle */}
      <button
        onClick={() => onStatusChange(task.id, task.status === 'done' ? 'todo' : 'done')}
        aria-label={task.status === 'done' ? 'Mark incomplete' : 'Mark complete'}
        style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
          border: `1.5px solid ${task.status === 'done' ? '#0761d1' : '#a1a1a1'}`,
          background: task.status === 'done' ? '#d3e5ff' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 120ms', padding: 0,
        }}
      >
        {task.status === 'done' && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
            <path d="M1.5 4L3 5.5L6.5 2" stroke="#0761d1" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Task info - Clickable to open task details & comments */}
      <div
        onClick={() => onSelect?.(task)}
        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
        title="Click to view comments & details"
      >
        <p style={{
          margin: 0, fontSize: 14, fontWeight: 500,
          letterSpacing: '-0.2px', lineHeight: '20px',
          textDecoration: task.status === 'done' ? 'line-through' : 'none',
          color: task.status === 'done' ? 'var(--color-canvas-mute, #8a8f98)' : 'var(--color-canvas-ink, #0f1011)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {task.title}
        </p>
        {task.description && (
          <p style={{
            margin: 0, fontSize: 12, color: 'var(--color-canvas-mute, #adb2ba)', lineHeight: '16px',
            fontFamily: "'JetBrains Mono', monospace",
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginTop: 1,
          }}>
            {task.description}
          </p>
        )}
      </div>

      {/* Right: assignee + due date + status + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {formattedDate && (
          overdue ? (
            <span className="badge badge-overdue" title={`Due ${formattedDate}`}>
              Overdue
            </span>
          ) : (
            <span style={{ fontSize: 11, color: task.status === 'done' ? 'var(--color-canvas-mute, #8a8f98)' : 'var(--color-canvas-body, #70757e)', fontFamily: "'JetBrains Mono', monospace" }}>
              {formattedDate}
            </span>
          )
        )}

        <AssigneeAvatar name={task.assignee?.name} />

        {/* Status dropdown — always visible & interactive */}
        <select
          value={task.status}
          onChange={e => onStatusChange(task.id, e.target.value)}
          aria-label={`Change status of ${task.title}`}
          className={`badge ${task.status === 'done' ? 'badge-done' : task.status === 'in_progress' ? 'badge-progress' : 'badge-todo'}`}
          style={{
            height: 26,
            padding: '0 8px',
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 5,
            border: '1px solid',
            cursor: 'pointer',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        >
          <option value="todo" style={{ background: 'var(--color-canvas-card, #fff)', color: 'var(--color-canvas-ink, #171717)' }}>Todo</option>
          <option value="in_progress" style={{ background: 'var(--color-canvas-card, #fff)', color: 'var(--color-canvas-ink, #171717)' }}>In Progress</option>
          <option value="done" style={{ background: 'var(--color-canvas-card, #fff)', color: 'var(--color-canvas-ink, #171717)' }}>Done</option>
        </select>

        {/* Comments button */}
        <button
          onClick={() => onSelect?.(task)}
          aria-label={`Open details and comments for ${task.title}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            height: 26, padding: '0 8px', fontSize: 11, fontWeight: 500,
            borderRadius: 5, border: '1px solid var(--color-canvas-hairline, #e8eaec)', background: 'var(--color-canvas-card, #fff)',
            color: 'var(--color-canvas-body, #50545c)', cursor: 'pointer', outline: 'none',
            fontFamily: 'inherit',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M1.5 8.5V2.5A1 1 0 012.5 1.5H9.5A1 1 0 0110.5 2.5V7.5A1 1 0 019.5 8.5H3.5L1.5 10.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Comments
        </button>

        {/* Delete — always visible */}
        <button
          onClick={() => onDelete(task.id)}
          aria-label={`Delete ${task.title}`}
          title="Delete task"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 5,
            border: '1px solid var(--color-canvas-hairline, #e8eaec)',
            background: 'var(--color-canvas-card, #fff)',
            cursor: 'pointer',
            color: 'var(--color-canvas-mute, #8a8f98)',
            transition: 'background 120ms, color 120ms, border-color 120ms',
            padding: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--color-btn-danger-bg, #fce8e6)';
            e.currentTarget.style.color = 'var(--color-btn-danger-fg, #d93025)';
            e.currentTarget.style.borderColor = 'var(--color-btn-danger-border, #f2bbb7)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--color-canvas-card, #fff)';
            e.currentTarget.style.color = 'var(--color-canvas-mute, #8a8f98)';
            e.currentTarget.style.borderColor = 'var(--color-canvas-hairline, #e8eaec)';
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const token   = localStorage.getItem('token');
  const teamId  = localStorage.getItem('teamId');

  const [teams,       setTeams]       = useState([]);
  const [activeTeam,  setActiveTeam]  = useState(getActiveTeam);
  const [tasks,       setTasks]       = useState([]);
  const [members,     setMembers]     = useState([]);
  const [error,       setError]       = useState('');
  const activeTab = searchParams.get('tab') === 'mine' ? 'mine' : 'all';
  const [searchInput, setSearchInput] = useState('');
  const [showModal,   setShowModal]   = useState(false);
  const [emailVerified,   setEmailVerified]   = useState(isEmailVerified);
  const [resendStatus,    setResendStatus]    = useState('idle');
  const [tasksLoading,    setTasksLoading]    = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  // ── Analytics state ────────────────────────────────────────────────────────
  const [analytics,         setAnalytics]         = useState(null);
  const [analyticsLoading,  setAnalyticsLoading]  = useState(false);
  const [analyticsRange,    setAnalyticsRange]    = useState('30d');
  const [analyticsScope,    setAnalyticsScope]    = useState('team');
  const [drillDownFilter,   setDrillDownFilter]   = useState(null);

  const handleTabChange = (tab) => {
    setSearchParams(tab === 'mine' ? { tab: 'mine' } : {});
  };

  const currentUserId   = getCurrentUserId();
  const currentUser     = getCurrentUser();
  const currentUserEmail = getCurrentUserEmail();

  const debouncedSearch = useDebounce(searchInput, 350);

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Team-Id': teamId,
  };

  const fetchUserProfile = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.data?.user) {
        const u = res.data.user;
        setEmailVerified(u.emailVerified === true);
        const currentUserObj = getCurrentUser() || {};
        localStorage.setItem('user', JSON.stringify({ ...currentUserObj, ...u }));
      }
    } catch { /* non-fatal */ }
  }, [token]);

  // ── Data fetching ────────────────────────────────────────────────────────
  const fetchTeams = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/teams/me`, { headers: { Authorization: `Bearer ${token}` } });
      const teamList = res.data.teams ?? [];
      setTeams(teamList);
      if (teamList.length === 0) {
        localStorage.removeItem('teamId');
        localStorage.removeItem('team');
        navigate('/onboarding');
      }
    } catch { /* non-fatal */ }
  }, [token, navigate]);

  const fetchMembers = useCallback(async () => {
    if (!teamId) return;
    try {
      const res = await axios.get(`${API}/teams/${teamId}/members`, { headers });
      setMembers(res.data.members ?? []);
    } catch { /* non-fatal */ }
  }, [teamId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTasks = useCallback(async () => {
    if (!teamId) return;
    setTasksLoading(true);
    try {
      const params = {};
      if (activeTab === 'mine' && currentUserId) params.assigneeId = currentUserId;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      const res = await axios.get(`${API}/tasks`, { headers, params });
      setTasks(res.data.tasks ?? []);
      setError('');
    } catch (err) {
      if (err.response?.status === 404 && err.response?.data?.error?.includes('not a member of any team')) {
        localStorage.removeItem('teamId');
        localStorage.removeItem('team');
        navigate('/onboarding');
        return;
      }
      setError('Failed to load tasks.');
    } finally {
      setTasksLoading(false);
    }
  }, [teamId, token, activeTab, currentUserId, debouncedSearch, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnalytics = useCallback(async () => {
    if (!teamId || !token) return;
    setAnalyticsLoading(true);
    try {
      const params = { range: analyticsRange };
      if (analyticsScope === 'mine' && currentUserId) {
        params.userId = currentUserId;
      }
      const res = await axios.get(`${API}/teams/${teamId}/analytics`, { headers, params });
      setAnalytics(res.data.analytics ?? null);
    } catch {
      /* non-fatal */
    } finally {
      setAnalyticsLoading(false);
    }
  }, [teamId, token, analyticsRange, analyticsScope, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token)  { navigate('/'); return; }
    if (!teamId) { navigate('/onboarding'); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTeams();
    fetchMembers();
    fetchUserProfile();
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  // ── Task CRUD ────────────────────────────────────────────────────────────
  const handleCreate = async ({ title, assigneeId, dueDate }) => {
    try {
      await axios.post(`${API}/tasks`, { title, assigneeId, dueDate }, { headers });
      setShowModal(false);
      fetchTasks();
      fetchAnalytics();
    } catch (err) { setError(err.response?.data?.error || 'Failed to create task.'); }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await axios.patch(`${API}/tasks/${id}`, { status: newStatus }, { headers });
      fetchTasks();
      fetchAnalytics();
    } catch { setError('Failed to update task.'); }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/tasks/${id}`, { headers });
      fetchTasks();
      fetchAnalytics();
    } catch (err) { setError(err.response?.data?.error || 'Failed to delete task.'); }
  };

  const handleTeamSwitch = (team) => {
    localStorage.setItem('teamId', team.id);
    localStorage.setItem('team', JSON.stringify({ id: team.id, name: team.name, role: team.role }));
    setActiveTeam({ id: team.id, name: team.name, role: team.role });
    navigate(0);
  };

  const handleLogout = () => {
    ['token', 'user', 'teamId', 'team'].forEach(k => localStorage.removeItem(k));
    navigate('/');
  };

  const handleResendVerification = async () => {
    if (!currentUserEmail || resendStatus !== 'idle') return;
    setResendStatus('sending');
    try {
      await axios.post(`${API}/auth/resend-verification`, { email: currentUserEmail });
      setResendStatus('sent');
    } catch { setResendStatus('error'); }
  };

  const handleDrillDown = (filterObj) => {
    setDrillDownFilter(filterObj);
  };

  const handleClearFilter = () => {
    setDrillDownFilter(null);
  };

  const displayedTasks = tasks.filter((task) => {
    if (!drillDownFilter) return true;
    if (drillDownFilter.type === 'status') {
      return task.status === drillDownFilter.value;
    }
    if (drillDownFilter.type === 'assignee') {
      if (drillDownFilter.value === 'unassigned') {
        return !task.assigneeId;
      }
      return task.assigneeId === drillDownFilter.value;
    }
    if (drillDownFilter.type === 'overdue') {
      return isOverdue(task.dueDate, task.status);
    }
    return true;
  });

  const doneCount  = displayedTasks.filter(t => t.status === 'done').length;
  const totalCount = displayedTasks.length;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <Sidebar
        teams={teams}
        activeTeam={activeTeam}
        onTeamSwitch={handleTeamSwitch}
        onLogout={handleLogout}
        userName={currentUser?.name}
        userEmail={currentUser?.email}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      <div className="app-main">
        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        <header style={{
          minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 24px', borderBottom: '1px solid var(--color-header-border, #f0f1f3)',
          background: 'var(--color-header-bg, #fff)', position: 'sticky', top: 0, zIndex: 20,
          flexWrap: 'wrap', gap: 12,
        }}>
          {/* Left: Mobile hamburger toggle + Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setMobileSidebarOpen(v => !v)}
              aria-expanded={mobileSidebarOpen}
              aria-label="Toggle navigation menu"
              className="btn-secondary"
              style={{ height: 32, width: 32, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>

            {/* Tabs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {[
                { key: 'all',  label: 'All tasks' },
                { key: 'mine', label: 'My tasks'  },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => handleTabChange(key)}
                  style={{
                    height: 30, padding: '0 12px', fontSize: 13, fontWeight: 500,
                    borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: activeTab === key ? 'var(--color-canvas-hover, #f0f1f3)' : 'transparent',
                    color: activeTab === key ? 'var(--color-canvas-ink, #0f1011)' : 'var(--color-canvas-body, #50545c)',
                    letterSpacing: '-0.01em', fontFamily: 'inherit',
                    transition: 'background 120ms, color 120ms',
                  }}
                >
                  {label}
                  {key === 'all' && totalCount > 0 && (
                    <span style={{
                      marginLeft: 6, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                      color: 'var(--color-canvas-mute, #50545c)',
                    }}>
                      {totalCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Search + ThemeToggle + New task */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <SearchIcon />
              </span>
              <input
                id="search-tasks-input"
                type="search"
                placeholder="Search…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="field-input"
                style={{ height: 32, paddingLeft: 30, paddingRight: 10, width: 180, fontSize: 13 }}
                aria-label="Search tasks"
              />
            </div>

            {/* Quick theme toggle in dashboard header */}
            <ThemeToggle variant="icon" size="sm" />

            <button
              className="btn-primary"
              onClick={() => setShowModal(true)}
              style={{ height: 32, fontSize: 13, gap: 5 }}
            >
              <PlusIcon />
              New task
            </button>
          </div>
        </header>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main id="main-content" style={{ flex: 1, padding: '24px 24px 40px' }}>

          {/* Dev Sentry test tools */}
          {import.meta.env.DEV && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', background: '#f6f7f8', border: '1px solid #e8eaec',
              borderRadius: 6, marginBottom: 16, fontSize: 12, color: '#50545c',
            }}>
              <span><strong style={{ color: '#3d4148' }}>Dev:</strong> Sentry error tracking test</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn-secondary"
                  style={{ height: 26, fontSize: 11 }}
                  onClick={() => { throw new Error('[Sentry test] Deliberate render error'); }}
                >
                  Trigger error
                </button>
                <button
                  className="btn-secondary"
                  style={{ height: 26, fontSize: 11 }}
                  onClick={() => Sentry.captureMessage('[Sentry test] Manual event', 'info')}
                >
                  Send event
                </button>
              </div>
            </div>
          )}

          {/* Email verification banner */}
          {!emailVerified && (
            <div className="warn-banner" role="alert" style={{ marginBottom: 16 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <path d="M7 1.5L12.5 11.5H1.5L7 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7 5.5v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="7" cy="9.75" r="0.7" fill="currentColor" />
              </svg>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 13 }}>Verify your email</strong>
                {resendStatus === 'sent' ? (
                  <p style={{ margin: '2px 0 0', fontSize: 12 }}>Verification email sent — check your inbox.</p>
                ) : resendStatus === 'error' ? (
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#d93025' }}>Failed to send. Try again.</p>
                ) : (
                  <p style={{ margin: '2px 0 0', fontSize: 12 }}>
                    Check your inbox or{' '}
                    <button
                      onClick={handleResendVerification}
                      disabled={resendStatus === 'sending'}
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontFamily: 'inherit', fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', color: 'inherit' }}
                    >
                      {resendStatus === 'sending' ? 'Sending…' : 'resend the email'}
                    </button>.
                  </p>
                )}
              </div>
              {resendStatus === 'sent' && (
                <button onClick={() => setEmailVerified(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7a4f00', padding: 0 }} aria-label="Dismiss">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                </button>
              )}
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="error-banner" style={{ marginBottom: 16 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M7 4.5v2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="7" cy="9.5" r="0.7" fill="currentColor" />
              </svg>
              {error}
            </div>
          )}

          {/* Analytics & Productivity Overview */}
          <AnalyticsOverview
            analytics={analytics}
            loading={analyticsLoading}
            range={analyticsRange}
            onRangeChange={setAnalyticsRange}
            scope={analyticsScope}
            onScopeChange={setAnalyticsScope}
            activeFilter={drillDownFilter}
            onDrillDown={handleDrillDown}
            onClearFilter={handleClearFilter}
            onRefresh={fetchAnalytics}
          />

          {/* Page header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', letterSpacing: '-0.5px', lineHeight: '28px' }}>
                {drillDownFilter ? `Tasks: ${drillDownFilter.label}` : activeTab === 'mine' ? 'My Tasks' : 'All Tasks'}
              </h1>
              {totalCount > 0 && (
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--color-canvas-body, #50545c)' }}>
                  {doneCount} of {totalCount} completed
                </p>
              )}
            </div>

            {drillDownFilter && (
              <button
                className="btn-secondary"
                onClick={handleClearFilter}
                style={{ height: 30, fontSize: 12, padding: '0 10px' }}
              >
                Clear filter
              </button>
            )}
          </div>

          {/* Task list, skeleton, or empty state */}
          {tasksLoading ? (
            <TaskSkeleton count={3} />
          ) : displayedTasks.length === 0 && !error ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '64px 24px',
              background: 'var(--color-canvas-subtle, #f9fafa)', border: '1px solid var(--color-canvas-hairline, #f0f1f3)',
              borderRadius: 10, textAlign: 'center',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8, background: 'var(--color-canvas-hover, #f0f1f3)',
                border: '1px solid var(--color-canvas-hairline, #e8eaec)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', marginBottom: 12,
              }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                  <rect x="3" y="4"  width="12" height="1.3" rx="0.65" fill="var(--color-canvas-mute, #50545c)" />
                  <rect x="3" y="8"  width="9"  height="1.3" rx="0.65" fill="var(--color-canvas-mute, #50545c)" />
                  <rect x="3" y="12" width="6"  height="1.3" rx="0.65" fill="var(--color-canvas-mute, #50545c)" />
                </svg>
              </div>
              <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)', letterSpacing: '-0.3px' }}>
                {drillDownFilter
                  ? 'No tasks match the active filter'
                  : debouncedSearch.trim()
                  ? 'No matching tasks'
                  : activeTab === 'mine'
                  ? 'No tasks assigned to you'
                  : 'No tasks yet'}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-canvas-body, #50545c)', maxWidth: 260, lineHeight: '18px' }}>
                {drillDownFilter
                  ? 'Try clearing the filter to see all team tasks.'
                  : debouncedSearch.trim()
                  ? 'Try a different search term.'
                  : activeTab === 'mine'
                  ? 'Tasks assigned to you will show here.'
                  : 'Click "New task" to create your first one.'}
              </p>
              {drillDownFilter ? (
                <button
                  className="btn-secondary"
                  onClick={handleClearFilter}
                  style={{ marginTop: 16, fontSize: 13 }}
                >
                  Clear filter
                </button>
              ) : activeTab === 'all' && !debouncedSearch.trim() && (
                <button
                  className="btn-primary"
                  onClick={() => setShowModal(true)}
                  style={{ marginTop: 16, fontSize: 13 }}
                >
                  <PlusIcon /> New task
                </button>
              )}
            </div>
          ) : (
            <div style={{
              background: 'var(--color-canvas-card, #fff)', border: '1px solid var(--color-canvas-hairline, #e8eaec)', borderRadius: 8,
              overflow: 'hidden',
            }}>
              {displayedTasks.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  onSelect={(t) => setSelectedTask(t)}
                  isLast={i === displayedTasks.length - 1}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* New Task Modal */}
      {showModal && (
        <NewTaskModal
          members={members}
          currentUserId={currentUserId}
          onSubmit={handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Task Detail & Comments Drawer */}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          headers={headers}
          members={members}
          onClose={() => setSelectedTask(null)}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
