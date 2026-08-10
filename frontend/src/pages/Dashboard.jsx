import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import * as Sentry from '@sentry/react';
import Sidebar from '../components/Sidebar';
import TaskSkeleton from '../components/TaskSkeleton';
import TaskDetailDrawer from '../components/TaskDetailDrawer';
import AnalyticsOverview from '../components/AnalyticsOverview';
import KanbanBoard from '../components/KanbanBoard';
import UndoToast from '../components/UndoToast';
import ThemeToggle from '../components/ThemeToggle';
import { API_URL } from '../api/config';

// ── Constants ──────────────────────────────────────────────────────────────
const API = API_URL;

// ── Helpers ────────────────────────────────────────────────────────────────
function getActiveTeam()       { try { return JSON.parse(localStorage.getItem('team')); }   catch { return null; } }
function getCurrentUser()      { try { return JSON.parse(localStorage.getItem('user')); }   catch { return null; } }
function getCurrentUserId()    { return getCurrentUser()?.id ?? null; }
function getCurrentUserEmail() { return getCurrentUser()?.email ?? null; }
function isEmailVerified()     { try { return JSON.parse(localStorage.getItem('user'))?.emailVerified === true; } catch { return true; } }

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

// ── Sub-components & Icons ──────────────────────────────────────────────────

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
        background: 'var(--color-canvas-hover, #f0f1f3)', border: '1.5px solid var(--color-canvas-hairline, #e8eaec)',
        fontSize: 10, fontWeight: 600, color: 'var(--color-canvas-ink, #3d4148)',
        fontFamily: "'JetBrains Mono', monospace", flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

function PriorityBadge({ priority }) {
  const p = priority?.toLowerCase() || 'medium';

  const config = {
    urgent: { label: 'Urgent', color: '#e5484d', bg: 'rgba(229, 72, 77, 0.12)', border: 'rgba(229, 72, 77, 0.3)' },
    high:   { label: 'High',   color: '#f76808', bg: 'rgba(247, 104, 8, 0.12)', border: 'rgba(247, 104, 8, 0.3)' },
    medium: { label: 'Med',    color: '#0070f3', bg: 'rgba(0, 112, 243, 0.10)', border: 'rgba(0, 112, 243, 0.25)' },
    low:    { label: 'Low',    color: '#8a8f98', bg: 'rgba(138, 143, 152, 0.10)', border: 'rgba(138, 143, 152, 0.2)' },
  }[p] || { label: 'Med', color: '#0070f3', bg: 'rgba(0, 112, 243, 0.10)', border: 'rgba(0, 112, 243, 0.25)' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 5px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.border}`,
        lineHeight: 1,
        letterSpacing: '0.01em',
        textTransform: 'uppercase',
      }}
    >
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: config.color }} />
      {config.label}
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

function IconList() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <line x1="2" y1="4" x2="12" y2="4" />
      <line x1="2" y1="7" x2="12" y2="7" />
      <line x1="2" y1="10" x2="12" y2="10" />
    </svg>
  );
}

function IconBoard() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="3" height="10" rx="0.8" />
      <rect x="5.5" y="2" width="3" height="6" rx="0.8" />
      <rect x="9" y="2" width="3" height="8" rx="0.8" />
    </svg>
  );
}

// ── New Task Modal ─────────────────────────────────────────────────────────
function NewTaskModal({ members, currentUserId, defaultStatus = 'todo', onSubmit, onClose }) {
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [status,      setStatus]      = useState(defaultStatus);
  const [priority,    setPriority]    = useState('medium');
  const [labelsStr,   setLabelsStr]   = useState('');
  const [assigneeId,  setAssigneeId]  = useState('');
  const [dueDate,     setDueDate]     = useState('');
  const [loading,     setLoading]     = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);

    const labels = labelsStr
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    await onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      labels: labels.length > 0 ? labels : undefined,
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
        background: 'var(--color-modal-bg, #fff)', borderRadius: 12, width: '100%', maxWidth: 480,
        border: '1px solid var(--color-modal-border, #ebebeb)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        padding: 24,
      }}>
        <h2 id="modal-title" style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)', letterSpacing: '-0.4px' }}>
          New task
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="modal-task-title" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-canvas-body, #4d4d4d)' }}>Title</label>
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

          {/* Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="modal-task-desc" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-canvas-body, #4d4d4d)' }}>Description (optional)</label>
            <textarea
              id="modal-task-desc"
              className="field-input"
              placeholder="Add details, notes, or sub-tasks…"
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Status & Priority row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="modal-task-status" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-canvas-body, #4d4d4d)' }}>Status</label>
              <select
                id="modal-task-status"
                className="field-input"
                value={status}
                onChange={e => setStatus(e.target.value)}
              >
                <option value="todo">Todo</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="modal-task-priority" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-canvas-body, #4d4d4d)' }}>Priority</label>
              <select
                id="modal-task-priority"
                className="field-input"
                value={priority}
                onChange={e => setPriority(e.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Labels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor="modal-task-labels" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-canvas-body, #4d4d4d)' }}>Labels (comma-separated)</label>
            <input
              id="modal-task-labels"
              className="field-input"
              type="text"
              placeholder="e.g. frontend, bug, design"
              value={labelsStr}
              onChange={e => setLabelsStr(e.target.value)}
            />
          </div>

          {/* Due Date & Assignee row */}
          <div style={{ display: 'grid', gridTemplateColumns: members.length > 0 ? '1fr 1fr' : '1fr', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="modal-task-duedate" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-canvas-body, #4d4d4d)' }}>Due date</label>
              <input
                id="modal-task-duedate"
                className="field-input"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>

            {members.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label htmlFor="modal-task-assignee" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-canvas-body, #4d4d4d)' }}>Assign to</label>
                <select
                  id="modal-task-assignee"
                  className="field-input"
                  value={assigneeId}
                  onChange={e => setAssigneeId(e.target.value)}
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
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
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

// ── Task Row (List View) ───────────────────────────────────────────────────
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
        padding: '9px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--color-canvas-hairline, #ebebeb)',
        background: hovered ? 'var(--color-canvas-hover, #fafafa)' : 'var(--color-canvas-card, #ffffff)',
        transition: 'background 100ms ease',
      }}
    >
      {/* Checkbox-style circle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStatusChange(task.id, task.status === 'done' ? 'todo' : 'done');
        }}
        aria-label={task.status === 'done' ? 'Mark incomplete' : 'Mark complete'}
        style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
          border: `1.5px solid ${task.status === 'done' ? '#0070f3' : 'var(--color-canvas-hairline-strong, #a1a1a1)'}`,
          background: task.status === 'done' ? '#d3e5ff' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 120ms ease', padding: 0,
        }}
      >
        {task.status === 'done' && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
            <path d="M1.5 4L3 5.5L6.5 2" stroke="#0070f3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Priority Pill */}
      <PriorityBadge priority={task.priority} />

      {/* Task info - Clickable to open task details & comments */}
      <div
        onClick={() => onSelect?.(task)}
        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
        title="View details & comments"
      >
        <p style={{
          margin: 0, fontSize: 13.5, fontWeight: 500,
          letterSpacing: '-0.015em', lineHeight: '20px',
          textDecoration: task.status === 'done' ? 'line-through' : 'none',
          color: task.status === 'done' ? 'var(--color-canvas-mute, #888888)' : 'var(--color-canvas-ink, #171717)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {task.title}
        </p>
        {task.description && (
          <p style={{
            margin: '1px 0 0', fontSize: 12, color: 'var(--color-canvas-mute, #888888)', lineHeight: '16px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {task.description}
          </p>
        )}
      </div>

      {/* Label chips in list row */}
      {Array.isArray(task.labels) && task.labels.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {task.labels.slice(0, 2).map((lbl, idx) => (
            <span
              key={idx}
              className="label-chip"
              style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 4,
                background: 'var(--color-canvas-subtle, #f5f6f8)',
                border: '1px solid var(--color-canvas-hairline, #e8eaec)',
                color: 'var(--color-canvas-body, #4d4d4d)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              #{lbl}
            </span>
          ))}
          {task.labels.length > 2 && (
            <span style={{ fontSize: 10, color: 'var(--color-canvas-mute, #888888)' }}>+{task.labels.length - 2}</span>
          )}
        </div>
      )}

      {/* Right: assignee + due date + status + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {formattedDate && (
          overdue ? (
            <span className="badge badge-overdue" title={`Due ${formattedDate}`}>
              Overdue
            </span>
          ) : (
            <span style={{ fontSize: 11, color: task.status === 'done' ? 'var(--color-canvas-mute, #888888)' : 'var(--color-canvas-body, #4d4d4d)', fontFamily: 'var(--font-mono, monospace)' }}>
              {formattedDate}
            </span>
          )
        )}

        <AssigneeAvatar name={task.assignee?.name} />

        {/* Status dropdown */}
        <select
          value={task.status}
          onChange={e => onStatusChange(task.id, e.target.value)}
          aria-label={`Change status of ${task.title}`}
          className={`badge ${task.status === 'done' ? 'badge-done' : task.status === 'in_progress' ? 'badge-progress' : 'badge-todo'}`}
          style={{
            height: 24,
            padding: '0 6px',
            fontSize: 11,
            fontWeight: 500,
            borderRadius: 4,
            cursor: 'pointer',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        >
          <option value="todo" style={{ background: 'var(--color-canvas-card, #ffffff)', color: 'var(--color-canvas-ink, #171717)' }}>Todo</option>
          <option value="in_progress" style={{ background: 'var(--color-canvas-card, #ffffff)', color: 'var(--color-canvas-ink, #171717)' }}>In Progress</option>
          <option value="done" style={{ background: 'var(--color-canvas-card, #ffffff)', color: 'var(--color-canvas-ink, #171717)' }}>Done</option>
        </select>

        {/* Details & Comments button */}
        <button
          onClick={() => onSelect?.(task)}
          aria-label={`Open details and comments for ${task.title}`}
          className="btn-secondary"
          style={{
            height: 24, padding: '0 8px', fontSize: 11, fontWeight: 500,
            borderRadius: 4, gap: 4,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Details
        </button>

        {/* Delete — sleek icon button */}
        <button
          onClick={() => onDelete(task.id)}
          aria-label={`Delete ${task.title}`}
          title="Delete task"
          className="btn-secondary"
          style={{
            width: 24, height: 24, padding: 0, borderRadius: 4,
            opacity: hovered ? 1 : 0.4,
            transition: 'opacity 120ms ease, color 120ms ease, background 120ms ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#c50000';
            e.currentTarget.style.borderColor = 'rgba(238, 0, 0, 0.3)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = '';
            e.currentTarget.style.borderColor = '';
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
  const [modalDefaultStatus, setModalDefaultStatus] = useState('todo');
  const [emailVerified,   setEmailVerified]   = useState(isEmailVerified);
  const [resendStatus,    setResendStatus]    = useState('idle');
  const [tasksLoading,    setTasksLoading]    = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isDrawerEditRequested, setIsDrawerEditRequested] = useState(false);
  const searchInputRef = useRef(null);

  // ── Kanban view mode & Undo state ─────────────────────────────────────────
  const [viewMode, setViewMode] = useState(() => {
    return searchParams.get('view') || localStorage.getItem('taskflow_view') || 'board';
  });
  const [undoToast, setUndoToast] = useState(null);

  // ── Analytics state ────────────────────────────────────────────────────────
  const [analytics,         setAnalytics]         = useState(null);
  const [analyticsLoading,  setAnalyticsLoading]  = useState(false);
  const [analyticsRange,    setAnalyticsRange]    = useState('30d');
  const [analyticsScope,    setAnalyticsScope]    = useState('team');
  const [drillDownFilter,   setDrillDownFilter]   = useState(null);

  const handleTabChange = (tab) => {
    const nextParams = new URLSearchParams(searchParams);
    if (tab === 'mine') nextParams.set('tab', 'mine');
    else nextParams.delete('tab');
    setSearchParams(nextParams);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('taskflow_view', mode);
    const nextParams = new URLSearchParams(searchParams);
    if (mode === 'list') nextParams.set('view', 'list');
    else nextParams.delete('view');
    setSearchParams(nextParams);
  };

  const currentUserId   = getCurrentUserId();
  const currentUser     = getCurrentUser();
  const currentUserEmail = getCurrentUserEmail();
  const currentMember   = members.find(m => m.id === currentUserId);
  const userRole        = currentMember?.role || 'member';

  const debouncedSearch = useDebounce(searchInput, 350);

  // ── Global Keyboard Shortcuts (C, /, Esc, E) ─────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      );

      // Close drawer or modal on Escape
      if (e.key === 'Escape') {
        if (selectedTask) {
          setSelectedTask(null);
          setIsDrawerEditRequested(false);
          return;
        }
        if (showModal) {
          setShowModal(false);
          return;
        }
      }

      // Never trigger shortcut actions when typing in a form field
      if (isInput) return;

      // 'C' / 'c' -> Create task
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setModalDefaultStatus('todo');
        setShowModal(true);
        return;
      }

      // '/' -> Search
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // 'E' / 'e' -> Edit task when drawer is open
      if (e.key === 'e' || e.key === 'E') {
        if (selectedTask) {
          e.preventDefault();
          setIsDrawerEditRequested(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTask, showModal]);

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

  // ── Task CRUD & Kanban Operations ────────────────────────────────────────
  const handleCreate = async ({ title, description, status, priority, labels, assigneeId, dueDate }) => {
    try {
      await axios.post(`${API}/tasks`, { title, description, status, priority, labels, assigneeId, dueDate }, { headers });
      setShowModal(false);
      fetchTasks();
      fetchAnalytics();
    } catch (err) { setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.message || 'Failed to create task.'); }
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
      if (selectedTask?.id === id) setSelectedTask(null);
      fetchTasks();
      fetchAnalytics();
    } catch (err) { setError(err.response?.data?.error || 'Failed to delete task.'); }
  };

  // ── Optimistic Kanban Drag & Drop with Rollback & Undo ───────────────────
  const handleKanbanTaskMove = async (taskId, { status, order, previousState }) => {
    const prevTasks = [...tasks];

    // Optimistically update local tasks
    setTasks(current =>
      current.map(t => (t.id === taskId ? { ...t, status, order } : t))
    );

    const statusNames = { todo: 'Todo', in_progress: 'In Progress', done: 'Done' };
    setUndoToast({
      id: Date.now(),
      taskId,
      message: `Moved "${previousState.title}" to ${statusNames[status] || status}`,
      previousState,
    });

    try {
      await axios.patch(`${API}/tasks/${taskId}/order`, { status, order }, { headers });
      fetchAnalytics();
    } catch (err) {
      // Rollback on network/server error
      setTasks(prevTasks);
      setUndoToast(null);
      setError(err.response?.data?.error || 'Failed to move task. Reverted changes.');
    }
  };

  const handleUndoMove = async (toastItem) => {
    setUndoToast(null);
    if (!toastItem?.previousState) return;

    const { taskId, previousState } = toastItem;
    const prevTasks = [...tasks];

    // Revert local state
    setTasks(current =>
      current.map(t =>
        t.id === taskId
          ? { ...t, status: previousState.status, order: previousState.order }
          : t
      )
    );

    try {
      await axios.patch(
        `${API}/tasks/${taskId}/order`,
        { status: previousState.status, order: previousState.order },
        { headers }
      );
      fetchAnalytics();
    } catch {
      setTasks(prevTasks);
      setError('Failed to undo task move.');
    }
  };

  const handleQuickAdd = (columnStatus) => {
    setModalDefaultStatus(columnStatus || 'todo');
    setShowModal(true);
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
          {/* Left: Mobile hamburger toggle + Tabs + View Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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

            {/* View Switcher: List vs Board */}
            <div className="view-switcher-pill" role="radiogroup" aria-label="Task view mode">
              <button
                type="button"
                onClick={() => handleViewModeChange('board')}
                className={`view-switcher-btn ${viewMode === 'board' ? 'active' : ''}`}
                aria-checked={viewMode === 'board'}
                role="radio"
                title="Kanban Board View"
              >
                <IconBoard />
                Board
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('list')}
                className={`view-switcher-btn ${viewMode === 'list' ? 'active' : ''}`}
                aria-checked={viewMode === 'list'}
                role="radio"
                title="List View"
              >
                <IconList />
                List
              </button>
            </div>
          </div>

          {/* Search + ThemeToggle + New task */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <SearchIcon />
              </span>
              <input
                ref={searchInputRef}
                id="search-tasks-input"
                type="search"
                placeholder="Search… (Press /)"
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
              onClick={() => {
                setModalDefaultStatus('todo');
                setShowModal(true);
              }}
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

          {/* Main workspace view: Kanban Board vs List View */}
          {tasksLoading ? (
            <TaskSkeleton count={3} />
          ) : viewMode === 'board' ? (
            <KanbanBoard
              tasks={displayedTasks}
              onTaskMove={handleKanbanTaskMove}
              onSelectTask={(t) => setSelectedTask(t)}
              onStatusChange={handleStatusChange}
              onDeleteTask={handleDelete}
              onQuickAdd={handleQuickAdd}
            />
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
                  onClick={() => {
                    setModalDefaultStatus('todo');
                    setShowModal(true);
                  }}
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
          defaultStatus={modalDefaultStatus}
          onSubmit={handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Task Detail & Collaboration Workspace Drawer */}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          headers={headers}
          members={members}
          currentUserId={currentUserId}
          userRole={userRole}
          isEditRequested={isDrawerEditRequested}
          onClose={() => {
            setSelectedTask(null);
            setIsDrawerEditRequested(false);
          }}
          onTaskUpdated={(updatedTask) => {
            setTasks(prev => prev.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t));
            setSelectedTask(prev => prev ? { ...prev, ...updatedTask } : null);
          }}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      )}

      {/* Interactive Undo Notification Toast */}
      <UndoToast
        toast={undoToast}
        onUndo={handleUndoMove}
        onDismiss={() => setUndoToast(null)}
      />
    </div>
  );
}
