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
  Bookmark,
  Eye,
  Flame,
  AlertTriangle,
  Clock,
  UserX,
  CheckCircle2,
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import ProjectIcon from './ProjectIcon';

import SyncTaskLogo from './SyncTaskLogo';

// ── Wordmark ───────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div className="flex items-center px-4 py-5">
      <SyncTaskLogo size={24} textColor="#f0f1f3" />
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
    <div className="px-3 mb-4" ref={ref} style={{ position: 'relative' }}>
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
            right: 12,
            width: 'calc(100% - 24px)',
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
    <div style={{ padding: '10px 12px', borderTop: '1px solid #1e2024', background: '#0e0f11' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: '#222427',
              border: '1px solid #2a2d31',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 600,
              color: '#f0f1f3',
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
                color: '#f0f1f3',
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
                  color: '#71767f',
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
        <ThemeToggle variant="icon" size="sm" />
      </div>
      <button
        onClick={onLogout}
        className="sidebar-item"
        style={{
          padding: '5px 8px',
          color: '#8a8f98',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderRadius: 4,
          margin: 0,
        }}
      >
        <LogOut size={13} />
        Log out
      </button>
    </div>
  );
}

// ── View Icon Helper ───────────────────────────────────────────────────────
function cleanViewName(name) {
  if (!name) return '';
  // Strip any leading emoji sequences if present in legacy records
  return name.replace(/^[\p{Extended_Pictographic}\u200d\uFE0F\s]+/gu, '').trim() || name;
}

function ViewIcon({ icon, id, color }) {
  if (id === 'preset-my-high-priority' || icon === '🔥') {
    return <Flame size={14} style={{ color: color || '#f87171', flexShrink: 0 }} />;
  }
  if (id === 'preset-overdue' || icon === '⚠️') {
    return <AlertTriangle size={14} style={{ color: color || '#fbbf24', flexShrink: 0 }} />;
  }
  if (id === 'preset-due-this-week' || icon === '📅' || icon === '🗓️') {
    return <Clock size={14} style={{ color: color || '#60a5fa', flexShrink: 0 }} />;
  }
  if (id === 'preset-unassigned' || icon === '👤') {
    return <UserX size={14} style={{ color: color || '#a78bfa', flexShrink: 0 }} />;
  }
  if (id === 'preset-recently-completed' || icon === '✅') {
    return <CheckCircle2 size={14} style={{ color: color || '#34d399', flexShrink: 0 }} />;
  }
  if (icon && typeof icon === 'string' && icon.length <= 4 && /\p{Extended_Pictographic}/u.test(icon)) {
    return <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{icon}</span>;
  }
  return <Bookmark size={14} style={{ color: color || '#8a8f98', flexShrink: 0 }} />;
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
  savedViews = [],
  activeViewId = null,
  onSelectView = () => { },
  onNewView = () => { },
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
  const isMyTasks = activeTab === 'mine' && !activeProjectId && !activeViewId;
  const isAllTasks = activeTab === 'all' && !activeProjectId && !activeViewId;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 40,
            backdropFilter: 'blur(2px)',
          }}
          className="md:hidden"
        />
      )}

      {/* Sidebar panel */}
      <aside
        style={{
          width: 256,
          background: '#0d0e10',
          borderRight: '1px solid #1e2023',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          flexShrink: 0,
          zIndex: 40,
          transition: 'transform 0.2s ease',
        }}
        className={`
          fixed md:sticky top-0 left-0 bottom-0
          ${isOpen ? 'translate-x-0 !z-50' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Wordmark */}
        <Logo />

        {/* Workspace / Team Switcher */}
        <TeamSwitcher
          teams={teams}
          activeTeam={activeTeam}
          onTeamSwitch={onTeamSwitch}
        />

        {/* Scrollable nav area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 8px',
          }}
        >
          {/* Main Navigation */}
          <div style={{ marginBottom: 4 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.04em',
                color: '#71767f',
                textTransform: 'uppercase',
                padding: '0 8px',
                display: 'block',
                marginBottom: 4,
              }}
            >
              Workspace
            </span>

            <button
              type="button"
              onClick={() => {
                handleNav('mine');
                onClose();
              }}
              className={`sidebar-item${isMyTasks ? ' active' : ''}`}
              style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', font: 'inherit', cursor: 'pointer', color: isMyTasks ? '#ffffff' : '#d1d5db' }}
            >
              <CheckSquare size={15} />
              My Tasks
            </button>

            <button
              type="button"
              onClick={() => {
                handleNav('all');
                onClose();
              }}
              className={`sidebar-item${isAllTasks ? ' active' : ''}`}
              style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', font: 'inherit', cursor: 'pointer', color: isAllTasks ? '#ffffff' : '#d1d5db' }}
            >
              <ListTodo size={15} />
              All Tasks
            </button>

            <button
              type="button"
              onClick={() => {
                handleNav('all', 'calendar');
                onClose();
              }}
              className={`sidebar-item${location.search.includes('view=calendar') ? ' active' : ''}`}
              style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', font: 'inherit', cursor: 'pointer', color: location.search.includes('view=calendar') ? '#ffffff' : '#d1d5db' }}
            >
              <Calendar size={15} />
              Calendar
            </button>
          </div>

          {/* Section divider */}
          <div style={{ height: 1, background: '#1c1e22', margin: '14px 8px 10px 8px' }} />

          {/* ─── Saved Views Section (Phase 44) ─────────────────────────── */}
          <div style={{ marginBottom: 4 }}>
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
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: '#71767f',
                  textTransform: 'uppercase',
                }}
              >
                Saved Views
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewView();
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#8a8f98',
                  cursor: 'pointer',
                  padding: '2px 4px',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Save current filters as view"
                aria-label="Save current view"
              >
                <Plus size={13} />
              </button>
            </div>

            {savedViews.length > 0 ? (
              savedViews.slice(0, 8).map((view) => {
                const isActive = activeViewId === view.id;
                const displayName = cleanViewName(view.name);
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => {
                      onSelectView(view);
                      onClose();
                    }}
                    className={`sidebar-item${isActive ? ' active' : ''}`}
                    title={displayName}
                    style={{
                      width: '100%',
                      border: 'none',
                      background: 'transparent',
                      textAlign: 'left',
                      font: 'inherit',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 6,
                      color: isActive ? '#ffffff' : '#d1d5db',
                    }}
                  >
                    <ViewIcon id={view.id} icon={view.icon} color={view.color} />
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {displayName}
                    </span>
                  </button>
                );
              })
            ) : (
              <p style={{ margin: '4px 8px', fontSize: 11, color: '#71767f' }}>
                No views saved yet
              </p>
            )}
          </div>

          {/* Section divider */}
          <div style={{ height: 1, background: '#1c1e22', margin: '14px 8px 10px 8px' }} />

          {/* ─── Projects Section ─────────────────────────────────────────── */}
          <div style={{ marginBottom: 4 }}>
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
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: '#71767f',
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
                      title={p.name}
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
                        color: isProjActive ? '#ffffff' : '#d1d5db',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
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
                          }}
                        >
                          {p.name}
                        </span>
                      </div>
                      {taskCount > 0 && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: '1px 6px',
                            borderRadius: 10,
                            backgroundColor: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            color: '#9ca3af',
                            fontWeight: 600,
                            marginLeft: 6,
                            flexShrink: 0,
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

          {/* Section divider */}
          <div style={{ height: 1, background: '#1c1e22', margin: '14px 8px 10px 8px' }} />

          <div>
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
        </div>

        {/* User chip */}
        <UserChip name={userName} email={userEmail} onLogout={onLogout} />
      </aside>
    </>
  );
}
