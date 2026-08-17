import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  CheckSquare,
  ListTodo,
  Calendar,
  Settings,
  LogOut,
  ChevronDown,
  Sparkles,
  Plus,
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import ProjectIcon from './ProjectIcon';

// ── Wordmark ───────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-5">
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: 6,
          background: '#f0f1f3',
          flexShrink: 0,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M2 11L7 3L12 11" stroke="#0f1011" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span style={{ fontWeight: 600, fontSize: 15, color: '#f0f1f3', letterSpacing: '-0.4px', lineHeight: '20px' }}>
        TaskFlow
      </span>
    </div>
  );
}

// ── Team Switcher ──────────────────────────────────────────────────────────
function TeamSwitcher({ teams, activeTeam, onTeamSwitch }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="px-3 mb-4" ref={ref}>
      <button
        onClick={() => teams.length > 1 && setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '7px 9px',
          borderRadius: 6,
          background: '#1c1d1f',
          border: '1px solid #2a2d31',
          cursor: teams.length > 1 ? 'pointer' : 'default',
        }}
      >
        {/* Team initial avatar */}
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            background: '#f0f1f3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: '#0f1011',
            flexShrink: 0,
          }}
        >
          {(activeTeam?.name || 'T')[0].toUpperCase()}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 500,
            color: '#c8ccd2',
            letterSpacing: '-0.01em',
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activeTeam?.name || 'Select team'}
        </span>
        {teams.length > 1 && (
          <ChevronDown
            size={13}
            style={{
              color: '#7c8088',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 150ms',
              flexShrink: 0,
            }}
          />
        )}
      </button>

      {open && teams.length > 1 && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            width: 196,
            background: '#1a1b1d',
            border: '1px solid #2a2d31',
            borderRadius: 8,
            padding: '4px',
            zIndex: 50,
            marginTop: 4,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onTeamSwitch(t);
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '7px 8px',
                borderRadius: 5,
                border: 'none',
                background: t.id === activeTeam?.id ? '#222427' : 'transparent',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 3,
                  background: '#f0f1f3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#0f1011',
                  flexShrink: 0,
                }}
              >
                {t.name[0].toUpperCase()}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: t.id === activeTeam?.id ? '#f0f1f3' : '#8a8f98',
                  fontWeight: 500,
                  textAlign: 'left',
                }}
              >
                {t.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── User chip at bottom ───────────────────────────────────────────────────
function UserChip({ name, email, onLogout }) {
  const initials = (name || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ padding: '12px', borderTop: '1px solid var(--color-sidebar-border, #1f2123)' }}>
      {/* Theme Toggle pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          padding: '0 4px',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--color-sidebar-fg, #888888)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          Theme
        </span>
        <ThemeToggle variant="segmented" showLabels={false} size="sm" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: 'var(--color-sidebar-bg-active, #222427)',
            border: '1px solid var(--color-sidebar-border, #2a2d31)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--color-sidebar-fg-active, #c8ccd2)',
            flexShrink: 0,
          }}
        >
          {initials}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--color-sidebar-fg-active, #c8ccd2)',
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name || 'User'}
          </p>
          {email && (
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: 'var(--color-sidebar-fg-mute, #50545c)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {email}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={onLogout}
        className="sidebar-item"
        style={{ padding: '6px 8px', color: 'var(--color-sidebar-fg-mute, #50545c)' }}
      >
        <LogOut size={14} />
        Log out
      </button>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────
export default function Sidebar({
  teams = [],
  activeTeam = null,
  projects = [],
  activeProjectId = null,
  onSelectProject = () => { },
  onNewProject = () => { },
  onAIPlanProject = () => { },
  onTeamSwitch,
  onLogout,
  userName,
  userEmail,
  isOpen = false,
  onClose = () => { },
  activeTab = 'all',
  onTabChange = () => { },
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNav = (tab, view = null) => {
    onTabChange(tab);
    onSelectProject(null);
    if (view) {
      navigate(`/dashboard?view=${view}`);
    } else {
      navigate(`/dashboard?tab=${tab}`);
    }
    onClose();
  };

  const handleProjectClick = (projId) => {
    onSelectProject(projId);
    if (projId) {
      navigate(`/dashboard?projectId=${projId}`);
    } else {
      navigate('/dashboard');
    }
    onClose();
  };

  const isDashboard = location.pathname === '/dashboard';
  const searchParams = new URLSearchParams(location.search);
  const currentView = searchParams.get('view');
  const isCalendar = isDashboard && currentView === 'calendar';

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 35,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(2px)',
          }}
          aria-hidden="true"
        />
      )}

      <aside className={`app-sidebar${isOpen ? ' mobile-open' : ''}`} aria-label="Main Navigation">
        {/* Logo */}
        <button
          onClick={() => { handleNav('all'); }}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
          aria-label="Go to dashboard"
        >
          <Logo />
        </button>

        {/* Team switcher */}
        <TeamSwitcher teams={teams} activeTeam={activeTeam} onTeamSwitch={(t) => { onTeamSwitch(t); onClose(); }} />

        {/* Divider */}
        <div style={{ margin: '0 12px 8px', borderTop: '1px solid #1f2123' }} />

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 12px', overflowY: 'auto' }} aria-label="Main navigation">
          <p
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: '#50545c',
              padding: '0 8px',
              marginBottom: 4,
              textTransform: 'uppercase',
            }}
          >
            Workspace
          </p>

          <button
            type="button"
            onClick={() => handleNav('mine')}
            className={`sidebar-item${isDashboard && activeTab === 'mine' && !activeProjectId && !isCalendar ? ' active' : ''}`}
            style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
          >
            <CheckSquare size={15} />
            My Tasks
          </button>

          <button
            type="button"
            onClick={() => handleNav('all')}
            className={`sidebar-item${isDashboard && activeTab === 'all' && !activeProjectId && !isCalendar ? ' active' : ''}`}
            style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
          >
            <ListTodo size={15} />
            All Tasks
          </button>

          <button
            type="button"
            onClick={() => handleNav('all', 'calendar')}
            className={`sidebar-item${isCalendar ? ' active' : ''}`}
            style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
          >
            <Calendar size={15} />
            Calendar
          </button>

          {/* ─── Projects Section ─────────────────────────────────────────── */}
          <div style={{ marginTop: 16, marginBottom: 4 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 8px',
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  color: '#50545c',
                  textTransform: 'uppercase',
                }}
              >
                Projects
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAIPlanProject();
                  }}
                  style={{
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    color: '#a5b4fc',
                    cursor: 'pointer',
                    padding: '3px 6px',
                    borderRadius: 4,
                    fontSize: 11,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    fontWeight: 600,
                  }}
                  title="AI Project Planner"
                  aria-label="AI Project Planner"
                >
                  <Sparkles size={11} /> Plan
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewProject();
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#8a8f98',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: 4,
                    fontSize: 14,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Create Project"
                  aria-label="Create Project"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {projects.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  type="button"
                  onClick={onAIPlanProject}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    background: 'rgba(99, 102, 241, 0.08)',
                    color: '#a5b4fc',
                    fontSize: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 500,
                  }}
                >
                  <Sparkles size={13} /> AI Plan Project
                </button>
                <button
                  type="button"
                  onClick={onNewProject}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px dashed #2a2d31',
                    background: 'transparent',
                    color: '#8a8f98',
                    fontSize: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Plus size={13} /> New Project
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {projects.map((p) => {
                  const isProjActive = isDashboard && activeProjectId === p.id;
                  const taskCount = p.stats?.totalTasks ?? (p.tasks ? p.tasks.length : 0);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleProjectClick(p.id)}
                      className={`sidebar-item${isProjActive ? ' active' : ''}`}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: isProjActive ? 'var(--color-sidebar-bg-active, #222427)' : 'transparent',
                        textAlign: 'left',
                        font: 'inherit',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            backgroundColor: p.color ? `${p.color}20` : 'rgba(99, 102, 241, 0.15)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <ProjectIcon icon={p.icon} size={12} color={p.color || '#818cf8'} />
                        </span>
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 13,
                            color: isProjActive ? 'var(--color-sidebar-fg-active, #ffffff)' : 'var(--color-sidebar-fg, #888888)',
                          }}
                        >
                          {p.name}
                        </span>
                      </div>
                      {taskCount > 0 && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: '1px 5px',
                            borderRadius: 10,
                            backgroundColor: '#26282d',
                            color: '#8a8f98',
                            fontWeight: 600,
                          }}
                        >
                          {taskCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <NavLink
              to="/settings"
              end
              onClick={onClose}
              className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
            >
              <Settings size={15} />
              Settings
            </NavLink>
          </div>
        </nav>

        {/* User chip */}
        <UserChip name={userName} email={userEmail} onLogout={onLogout} />
      </aside>
    </>
  );
}
