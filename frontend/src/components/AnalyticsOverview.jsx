import { useState } from 'react';
import AIProductivityInsights from './AIProductivityInsights';

// ── Helpers ────────────────────────────────────────────────────────────────
function timeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffInSec = Math.floor((now - past) / 1000);

  if (diffInSec < 60) return 'just now';
  const diffInMin = Math.floor(diffInSec / 60);
  if (diffInMin < 60) return `${diffInMin}m ago`;
  const diffInHours = Math.floor(diffInMin / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return past.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Icons ──────────────────────────────────────────────────────────────────
function IconTarget() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────
export default function AnalyticsOverview({
  analytics,
  loading = false,
  range = '30d',
  onRangeChange,
  scope = 'team',
  onScopeChange,
  activeFilter = null,
  onDrillDown,
  onClearFilter,
  onRefresh,
  teamId = null,
  token = null,
  userId = null,
  projectId = null,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const overview = analytics?.overview || {
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    todoTasks: 0,
    overdueTasks: 0,
    completionRate: 0,
    completedThisWeek: 0,
    completedThisMonth: 0,
    createdInRange: 0,
    completedInRange: 0,
  };

  const statusBreakdown = analytics?.statusBreakdown || [
    { status: 'todo', label: 'Todo', count: 0, percentage: 0 },
    { status: 'in_progress', label: 'In Progress', count: 0, percentage: 0 },
    { status: 'done', label: 'Done', count: 0, percentage: 0 },
  ];

  const workloadDistribution = analytics?.workloadDistribution || [];
  const unassigned = analytics?.unassigned || { totalTasks: 0, completedTasks: 0, inProgressTasks: 0, todoTasks: 0, overdueTasks: 0 };
  const recentActivities = analytics?.recentActivities || [];

  return (
    <section aria-label="Productivity Analytics" className="analytics-container">
      {/* ── AI Productivity Insights Hero Widget ── */}
      {teamId && token && (
        <AIProductivityInsights
          teamId={teamId}
          token={token}
          range={range}
          onRangeChange={onRangeChange}
          userId={userId}
          projectId={projectId}
          scope={scope}
        />
      )}

      {/* ── Toolbar: Scope, Range & Collapse Toggle ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10, marginBottom: 14,
      }}>
        {/* Left: Scope switcher */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', padding: 2,
          background: 'var(--color-canvas-card, #ffffff)',
          border: '1px solid var(--color-canvas-hairline, #ebebeb)',
          borderRadius: 6,
        }}>
          <button
            onClick={() => onScopeChange?.('team')}
            className={`btn-secondary${scope === 'team' ? ' active' : ''}`}
            style={{
              height: 26, padding: '0 10px', fontSize: 12, fontWeight: 500,
              borderRadius: 4, border: 'none', cursor: 'pointer',
              background: scope === 'team' ? 'var(--color-canvas-ink, #171717)' : 'transparent',
              color: scope === 'team' ? 'var(--color-canvas-main, #ffffff)' : 'var(--color-canvas-body, #4d4d4d)',
            }}
          >
            Team Overview
          </button>
          <button
            onClick={() => onScopeChange?.('mine')}
            className={`btn-secondary${scope === 'mine' ? ' active' : ''}`}
            style={{
              height: 26, padding: '0 10px', fontSize: 12, fontWeight: 500,
              borderRadius: 4, border: 'none', cursor: 'pointer',
              background: scope === 'mine' ? 'var(--color-canvas-ink, #171717)' : 'transparent',
              color: scope === 'mine' ? 'var(--color-canvas-main, #ffffff)' : 'var(--color-canvas-body, #4d4d4d)',
            }}
          >
            My Productivity
          </button>
        </div>

        {/* Right: Range Selector & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', padding: 2,
            background: 'var(--color-canvas-card, #ffffff)',
            border: '1px solid var(--color-canvas-hairline, #ebebeb)',
            borderRadius: 6,
          }}>
            {[
              { key: '7d', label: '7D' },
              { key: '30d', label: '30D' },
              { key: '90d', label: '90D' },
              { key: 'all', label: 'All' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => onRangeChange?.(key)}
                style={{
                  height: 24, padding: '0 8px', fontSize: 11, fontWeight: 600,
                  borderRadius: 4, border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-mono, monospace)',
                  background: range === key ? 'var(--color-canvas-hover, #f0f1f3)' : 'transparent',
                  color: range === key ? 'var(--color-canvas-ink, #171717)' : 'var(--color-canvas-mute, #888888)',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={onRefresh}
            title="Refresh metrics"
            aria-label="Refresh metrics"
            className="btn-secondary"
            style={{ width: 28, height: 28, padding: 0, borderRadius: 6 }}
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>

          <button
            onClick={() => setCollapsed(v => !v)}
            className="btn-secondary"
            style={{ height: 28, padding: '0 8px', fontSize: 11, borderRadius: 6, gap: 4 }}
          >
            {collapsed ? 'Show Insights' : 'Hide Insights'}
            <svg
              width="10" height="10" viewBox="0 0 12 12" fill="none"
              style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 150ms' }}
            >
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Active Filter Bar ── */}
      {activeFilter && (
        <div className="filter-active-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--color-canvas-mute, #888888)' }}>Filtered by:</span>
            <strong>{activeFilter.label}</strong>
          </div>
          <button
            onClick={onClearFilter}
            style={{
              background: 'none', border: 'none', padding: 0,
              fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-ink, #171717)',
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Main Insights Grid (Collapsible) ── */}
      {!collapsed && (
        <>
          {/* 4 Metric Cards */}
          <div className="metrics-grid">
            {/* Card 1: Completion */}
            <div
              onClick={() => onDrillDown?.({ type: 'status', value: 'done', label: 'Done' })}
              className={`metric-card interactive${activeFilter?.value === 'done' ? ' active-filter' : ''}`}
            >
              <div className="metric-label">
                <span>Completion</span>
                <IconTarget />
              </div>
              <div className="metric-value">
                {overview.completionRate}%
              </div>
              <div className="progress-track-subtle">
                <div
                  className="progress-fill-subtle"
                  style={{ width: `${Math.min(100, overview.completionRate)}%` }}
                />
              </div>
              <div className="metric-sub">
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
                  {overview.completedTasks}/{overview.totalTasks} tasks finished
                </span>
              </div>
            </div>

            {/* Card 2: Velocity */}
            <div className="metric-card">
              <div className="metric-label">
                <span>Completed Velocity</span>
                <IconActivity />
              </div>
              <div className="metric-value">
                +{overview.completedThisWeek} <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-canvas-mute, #888888)' }}>this week</span>
              </div>
              <div className="metric-sub">
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
                  {overview.completedThisMonth} tasks this month
                </span>
              </div>
            </div>

            {/* Card 3: Active Pipeline */}
            <div className="metric-card">
              <div className="metric-label">
                <span>Active Pipeline</span>
                <IconLayers />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <div
                  onClick={() => onDrillDown?.({ type: 'status', value: 'in_progress', label: 'In Progress' })}
                  style={{
                    flex: 1, padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
                    background: activeFilter?.value === 'in_progress' ? 'var(--color-badge-progress-bg)' : 'transparent',
                    border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--color-badge-progress-fg, #ab570a)', fontWeight: 600 }}>IN PROGRESS</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)', marginTop: 1 }}>
                    {overview.inProgressTasks}
                  </div>
                </div>

                <div
                  onClick={() => onDrillDown?.({ type: 'status', value: 'todo', label: 'Todo' })}
                  style={{
                    flex: 1, padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
                    background: activeFilter?.value === 'todo' ? 'var(--color-badge-todo-bg)' : 'transparent',
                    border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                  }}
                >
                  <div style={{ fontSize: 10, color: 'var(--color-canvas-mute, #888888)', fontWeight: 600 }}>TODO</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)', marginTop: 1 }}>
                    {overview.todoTasks}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4: Overdue Alert */}
            <div
              onClick={() => overview.overdueTasks > 0 && onDrillDown?.({ type: 'overdue', value: 'overdue', label: 'Overdue' })}
              className={`metric-card${overview.overdueTasks > 0 ? ' alert-card interactive' : ''}${activeFilter?.value === 'overdue' ? ' active-filter' : ''}`}
            >
              <div className="metric-label" style={{ color: overview.overdueTasks > 0 ? 'var(--color-btn-danger-fg, #c50000)' : undefined }}>
                <span>Overdue Tasks</span>
                <IconAlert />
              </div>
              <div className="metric-value" style={{ color: overview.overdueTasks > 0 ? 'var(--color-btn-danger-fg, #c50000)' : undefined }}>
                {overview.overdueTasks}
              </div>
              <div className="metric-sub" style={{ color: overview.overdueTasks > 0 ? 'var(--color-btn-danger-fg, #c50000)' : undefined }}>
                <span style={{ fontSize: 11 }}>
                  {overview.overdueTasks > 0 ? 'Requires attention' : 'All tasks on track'}
                </span>
              </div>
            </div>
          </div>

          {/* Breakdown Panels */}
          <div className="insights-panel">
            {/* Status & Member Workload */}
            <div className="insights-card">
              <div className="insights-card-header">
                <h3 className="insights-card-title">
                  <IconLayers /> Workload Distribution
                </h3>
              </div>

              {/* Status Segmented Bar */}
              <div style={{
                display: 'flex', height: 6, width: '100%', borderRadius: 3, overflow: 'hidden',
                background: 'var(--color-canvas-hover, #f0f1f3)', marginBottom: 12,
              }}>
                {statusBreakdown.map((s) => (
                  s.percentage > 0 && (
                    <div
                      key={s.status}
                      title={`${s.label}: ${s.count} (${s.percentage}%)`}
                      style={{
                        width: `${s.percentage}%`,
                        height: '100%',
                        background: s.status === 'done' ? '#0070f3' : s.status === 'in_progress' ? '#f5a623' : '#888888',
                      }}
                    />
                  )
                ))}
              </div>

              {/* Members List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {workloadDistribution.map((member) => (
                  <div
                    key={member.userId}
                    onClick={() => onDrillDown?.({ type: 'assignee', value: member.userId, label: member.name })}
                    className={`workload-item${activeFilter?.value === member.userId ? ' active' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%', background: 'var(--color-canvas-hover, #f0f1f3)',
                        border: '1px solid var(--color-canvas-hairline, #ebebeb)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 9, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)',
                        flexShrink: 0, fontFamily: 'var(--font-mono, monospace)',
                      }}>
                        {getInitials(member.name)}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--color-canvas-ink, #171717)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {member.name}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {member.overdueTasks > 0 && (
                        <span className="badge badge-overdue" style={{ fontSize: 10, padding: '1px 5px' }}>
                          {member.overdueTasks} overdue
                        </span>
                      )}
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-canvas-mute, #888888)' }}>
                        {member.completedTasks}/{member.totalTasks} ({member.completionRate}%)
                      </span>
                    </div>
                  </div>
                ))}

                {unassigned.totalTasks > 0 && (
                  <div
                    onClick={() => onDrillDown?.({ type: 'assignee', value: 'unassigned', label: 'Unassigned' })}
                    className={`workload-item${activeFilter?.value === 'unassigned' ? ' active' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%', background: 'transparent',
                        border: '1px dashed var(--color-canvas-hairline-strong, #a1a1a1)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--color-canvas-mute, #888888)',
                        flexShrink: 0,
                      }}>
                        -
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--color-canvas-mute, #888888)' }}>
                        Unassigned
                      </span>
                    </div>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: 'var(--color-canvas-mute, #888888)' }}>
                      {unassigned.totalTasks} tasks
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Team Activity Feed */}
            <div className="insights-card">
              <div className="insights-card-header">
                <h3 className="insights-card-title">
                  <IconActivity /> Recent Activity
                </h3>
              </div>

              {recentActivities.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-canvas-mute, #888888)', fontSize: 12 }}>
                  No recent activity recorded.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 220 }}>
                  {recentActivities.map((act) => (
                    <div key={act.id} className="activity-item">
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%', background: 'var(--color-canvas-hover, #f0f1f3)',
                        border: '1px solid var(--color-canvas-hairline, #ebebeb)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'var(--color-canvas-ink, #171717)',
                        flexShrink: 0, marginTop: 1, fontFamily: 'var(--font-mono, monospace)',
                      }}>
                        {getInitials(act.user?.name)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--color-canvas-ink, #171717)', lineHeight: '16px' }}>
                          <span style={{ fontWeight: 500 }}>{act.user?.name || 'Member'}</span> {act.details || act.action}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, fontSize: 11, color: 'var(--color-canvas-mute, #888888)' }}>
                          {act.task && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                              <IconPin /> {act.task.title}
                            </span>
                          )}
                          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10 }}>
                            · {timeAgo(act.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
