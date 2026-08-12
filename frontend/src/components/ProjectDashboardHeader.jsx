import { useState, useRef, useEffect } from 'react';

const STATUS_COLORS = {
  active:      { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe' },
  in_progress: { bg: '#fef3c7', text: '#b45309', border: '#fde68a' },
  planning:    { bg: '#f3e8ff', text: '#7e22ce', border: '#e9d5ff' },
  completed:   { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
  on_hold:     { bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' },
  archived:    { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' },
};

export default function ProjectDashboardHeader({
  project,
  viewMode,
  onViewModeChange,
  onEditProject,
  onCreateTask,
  isElevated = false,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  if (!project) return null;

  const stats = project.stats || {
    totalTasks: project.tasks?.length || 0,
    completedTasks: project.tasks?.filter((t) => t.status === 'done').length || 0,
    progress: 0,
  };

  const statusStyle = STATUS_COLORS[project.status] || STATUS_COLORS.active;
  const progressPercent = stats.progress || 0;

  // Format dates
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const startDateFormatted = formatDate(project.startDate);
  const targetDateFormatted = formatDate(project.targetDate);

  // Target date countdown / overdue calculation
  let targetDateBadge = null;
  if (project.targetDate) {
    const now = new Date();
    const target = new Date(project.targetDate);
    const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0 && project.status !== 'completed') {
      targetDateBadge = { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true };
    } else if (diffDays === 0) {
      targetDateBadge = { text: 'Due today', isOverdue: false };
    } else if (diffDays > 0) {
      targetDateBadge = { text: `${diffDays}d remaining`, isOverdue: false };
    }
  }

  return (
    <div
      style={{
        background: 'var(--color-canvas-card, #ffffff)',
        borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)',
        padding: '20px 28px 16px 28px',
        marginBottom: 20,
      }}
    >
      {/* Top Banner Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0, flex: 1 }}>
          {/* Project Icon Box */}
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: project.color || '#6366f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            }}
          >
            {project.icon || '📁'}
          </span>

          {/* Project Title, Description & Status */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 700,
                  color: 'var(--color-canvas-ink, #0f1011)',
                  letterSpacing: '-0.02em',
                }}
              >
                {project.name}
              </h1>

              {/* Status Pill */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '2px 9px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  backgroundColor: statusStyle.bg,
                  color: statusStyle.text,
                  border: `1px solid ${statusStyle.border}`,
                }}
              >
                {project.status?.replace('_', ' ')}
              </span>

              {project.isArchived && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: 'var(--color-canvas-hover, #f0f1f3)',
                    color: 'var(--color-canvas-mute, #8a8f98)',
                  }}
                >
                  Archived
                </span>
              )}
            </div>

            {project.description && (
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: 'var(--color-canvas-body, #4d4d4d)',
                  maxWidth: 680,
                  lineHeight: '1.4',
                }}
              >
                {project.description}
              </p>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={onCreateTask}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              borderRadius: 6,
              border: 'none',
              background: 'var(--color-btn-primary-bg, #171717)',
              color: 'var(--color-btn-primary-fg, #ffffff)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 2v10M2 7h10" strokeLinecap="round" />
            </svg>
            Add Task
          </button>

          {/* Settings / Edit Action Menu */}
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: '1px solid var(--color-btn-secondary-border, #ebebeb)',
                background: 'var(--color-btn-secondary-bg, #ffffff)',
                color: 'var(--color-canvas-body, #4d4d4d)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-label="Project options"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="8" cy="4" r="1" />
                <circle cx="8" cy="8" r="1" />
                <circle cx="8" cy="12" r="1" />
              </svg>
            </button>

            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: 6,
                  width: 170,
                  backgroundColor: 'var(--color-modal-bg, #ffffff)',
                  border: '1px solid var(--color-modal-border, #ebebeb)',
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                  padding: 4,
                  zIndex: 40,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEditProject(project);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 5,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--color-canvas-ink, #0f1011)',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M10 2l2 2-7 7H3v-2l7-7z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Edit Project
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats & Meta Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid var(--color-canvas-hairline, #ebebeb)',
          flexWrap: 'wrap',
        }}
      >
        {/* Progress & Task counts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 260 }}>
          <div style={{ width: 140, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
                {progressPercent}% Complete
              </span>
              <span style={{ color: 'var(--color-canvas-mute, #8a8f98)' }}>
                {stats.completedTasks}/{stats.totalTasks}
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 6,
                borderRadius: 3,
                backgroundColor: 'var(--color-canvas-hover, #f0f1f3)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  borderRadius: 3,
                  backgroundColor: project.color || '#3b82f6',
                  transition: 'width 300ms ease',
                }}
              />
            </div>
          </div>

          {/* Dates Pill */}
          {(startDateFormatted || targetDateFormatted) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: 'var(--color-canvas-body, #4d4d4d)',
                backgroundColor: 'var(--color-canvas-subtle, #f9fafa)',
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid var(--color-canvas-hairline, #ebebeb)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="10" height="9" rx="1.5" />
                <path d="M2 6h10M4 1.5v2M10 1.5v2" strokeLinecap="round" />
              </svg>
              <span>
                {startDateFormatted ? `${startDateFormatted} → ` : 'Target: '}
                {targetDateFormatted || 'No end date'}
              </span>
              {targetDateBadge && (
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    backgroundColor: targetDateBadge.isOverdue ? '#fee2e2' : '#e0e7ff',
                    color: targetDateBadge.isOverdue ? '#dc2626' : '#4338ca',
                  }}
                >
                  {targetDateBadge.text}
                </span>
              )}
            </div>
          )}

          {/* Project Members Avatars Stack */}
          {project.members && project.members.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ display: 'flex', marginLeft: 6 }}>
                {project.members.slice(0, 4).map((m, idx) => {
                  const initial = (m.user?.name || m.user?.email || 'U')[0].toUpperCase();
                  return (
                    <span
                      key={m.userId}
                      title={`${m.user?.name || m.user?.email} (${m.role})`}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        backgroundColor: '#3b82f6',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 700,
                        border: '2px solid var(--color-canvas-card, #ffffff)',
                        marginLeft: idx > 0 ? -6 : 0,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                    >
                      {initial}
                    </span>
                  );
                })}
              </div>
              {project.members.length > 4 && (
                <span style={{ fontSize: 11, color: 'var(--color-canvas-mute, #8a8f98)', marginLeft: 4 }}>
                  +{project.members.length - 4}
                </span>
              )}
            </div>
          )}
        </div>

        {/* View Switcher Tabs */}
        <div
          style={{
            display: 'inline-flex',
            borderRadius: 6,
            padding: 2,
            background: 'var(--color-canvas-subtle, #f9fafa)',
            border: '1px solid var(--color-canvas-hairline, #ebebeb)',
          }}
        >
          <button
            type="button"
            onClick={() => onViewModeChange('board')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              border: 'none',
              background: viewMode === 'board' ? 'var(--color-canvas-card, #ffffff)' : 'transparent',
              color: viewMode === 'board' ? 'var(--color-canvas-ink, #0f1011)' : 'var(--color-canvas-mute, #8a8f98)',
              boxShadow: viewMode === 'board' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="2" width="4" height="10" rx="1" />
              <rect x="8" y="2" width="4" height="6" rx="1" />
            </svg>
            Board
          </button>

          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              border: 'none',
              background: viewMode === 'list' ? 'var(--color-canvas-card, #ffffff)' : 'transparent',
              color: viewMode === 'list' ? 'var(--color-canvas-ink, #0f1011)' : 'var(--color-canvas-mute, #8a8f98)',
              boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h10M2 7h10M2 10h10" strokeLinecap="round" />
            </svg>
            List
          </button>

          <button
            type="button"
            onClick={() => onViewModeChange('calendar')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              border: 'none',
              background: viewMode === 'calendar' ? 'var(--color-canvas-card, #ffffff)' : 'transparent',
              color: viewMode === 'calendar' ? 'var(--color-canvas-ink, #0f1011)' : 'var(--color-canvas-mute, #8a8f98)',
              boxShadow: viewMode === 'calendar' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2.5" width="10" height="9.5" rx="1" />
              <line x1="2" y1="5.5" x2="12" y2="5.5" />
              <line x1="4.5" y1="1.5" x2="4.5" y2="3.5" />
              <line x1="9.5" y1="1.5" x2="9.5" y2="3.5" />
            </svg>
            Calendar
          </button>

          <button
            type="button"
            onClick={() => onViewModeChange('analytics')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              border: 'none',
              background: viewMode === 'analytics' ? 'var(--color-canvas-card, #ffffff)' : 'transparent',
              color: viewMode === 'analytics' ? 'var(--color-canvas-ink, #0f1011)' : 'var(--color-canvas-mute, #8a8f98)',
              boxShadow: viewMode === 'analytics' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 12V8M6 12V4M10 12V6M12 12H2" strokeLinecap="round" />
            </svg>
            Analytics
          </button>
        </div>
      </div>
    </div>
  );
}
