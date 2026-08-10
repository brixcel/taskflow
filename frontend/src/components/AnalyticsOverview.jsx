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
}) {
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
    <div style={{ marginBottom: 24 }}>
      {/* ── Toolbar: Scope Switcher & Range Controls ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, marginBottom: 16,
      }}>
        {/* Scope Switcher */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', padding: 2,
          background: 'var(--color-canvas-card, #fff)',
          border: '1px solid var(--color-canvas-hairline, #e8eaec)',
          borderRadius: 8,
        }}>
          <button
            onClick={() => onScopeChange?.('team')}
            style={{
              height: 28, padding: '0 12px', fontSize: 12, fontWeight: 500,
              borderRadius: 6, border: 'none', cursor: 'pointer',
              background: scope === 'team' ? 'var(--color-canvas-ink, #0f1011)' : 'transparent',
              color: scope === 'team' ? 'var(--color-canvas-main, #ffffff)' : 'var(--color-canvas-body, #50545c)',
              transition: 'all 120ms',
            }}
          >
            Team Overview
          </button>
          <button
            onClick={() => onScopeChange?.('mine')}
            style={{
              height: 28, padding: '0 12px', fontSize: 12, fontWeight: 500,
              borderRadius: 6, border: 'none', cursor: 'pointer',
              background: scope === 'mine' ? 'var(--color-canvas-ink, #0f1011)' : 'transparent',
              color: scope === 'mine' ? 'var(--color-canvas-main, #ffffff)' : 'var(--color-canvas-body, #50545c)',
              transition: 'all 120ms',
            }}
          >
            My Productivity
          </button>
        </div>

        {/* Date Range Selector & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', padding: 2,
            background: 'var(--color-canvas-card, #fff)',
            border: '1px solid var(--color-canvas-hairline, #e8eaec)',
            borderRadius: 8,
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
                  height: 28, padding: '0 10px', fontSize: 11, fontWeight: 600,
                  borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  background: range === key ? 'var(--color-canvas-hover, #f0f1f3)' : 'transparent',
                  color: range === key ? 'var(--color-canvas-ink, #0f1011)' : 'var(--color-canvas-mute, #8a8f98)',
                  transition: 'all 120ms',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={onRefresh}
            title="Refresh analytics"
            aria-label="Refresh analytics"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid var(--color-canvas-hairline, #e8eaec)',
              background: 'var(--color-canvas-card, #fff)',
              color: 'var(--color-canvas-body, #50545c)',
              cursor: 'pointer',
            }}
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Active Drill-Down Filter Banner ── */}
      {activeFilter && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', borderRadius: 8, marginBottom: 16,
          background: 'var(--color-banner-success-bg, #d3e5ff)',
          border: '1px solid var(--color-banner-success-border, rgba(0,112,243,0.25))',
          color: 'var(--color-banner-success-fg, #0761d1)',
          fontSize: 13, fontWeight: 500,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span>Active Filter: <strong>{activeFilter.label}</strong></span>
          </div>
          <button
            onClick={onClearFilter}
            style={{
              background: 'none', border: 'none', padding: '2px 8px',
              fontSize: 12, fontWeight: 600, color: 'inherit',
              cursor: 'pointer', textDecoration: 'underline',
            }}
          >
            Clear filter
          </button>
        </div>
      )}

      {/* ── 4 Key Metrics Cards Grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
        marginBottom: 16,
      }}>
        {/* Card 1: Completion Rate */}
        <div
          onClick={() => onDrillDown?.({ type: 'status', value: 'done', label: 'Completed Tasks' })}
          style={{
            background: 'var(--color-canvas-card, #fff)',
            border: `1px solid ${activeFilter?.value === 'done' ? '#0070f3' : 'var(--color-canvas-hairline, #e8eaec)'}`,
            borderRadius: 10, padding: '16px 18px', cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            transition: 'border-color 150ms, transform 150ms',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-mute, #8a8f98)' }}>
              Completion Rate
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
              background: 'var(--color-badge-done-bg, #d3e5ff)', color: 'var(--color-badge-done-fg, #0761d1)',
            }}>
              {overview.totalTasks} total
            </span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-canvas-ink, #0f1011)', letterSpacing: '-0.8px', lineHeight: 1 }}>
            {overview.completionRate}%
          </div>
          {/* Progress bar */}
          <div style={{ width: '100%', height: 5, background: 'var(--color-canvas-hover, #f0f1f3)', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.min(100, overview.completionRate)}%`,
              height: '100%',
              background: '#0070f3',
              borderRadius: 3,
              transition: 'width 300ms ease',
            }} />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--color-canvas-body, #50545c)' }}>
            {overview.completedTasks} of {overview.totalTasks} tasks done
          </p>
        </div>

        {/* Card 2: Velocity / Momentum */}
        <div style={{
          background: 'var(--color-canvas-card, #fff)',
          border: '1px solid var(--color-canvas-hairline, #e8eaec)',
          borderRadius: 10, padding: '16px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-mute, #8a8f98)' }}>
              Completed Velocity
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-canvas-mute, #8a8f98)' }}>
              This Week
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-canvas-ink, #0f1011)', letterSpacing: '-0.8px', lineHeight: 1 }}>
              {overview.completedThisWeek}
            </span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#0761d1' }}>
              tasks
            </span>
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 11, color: 'var(--color-canvas-body, #50545c)' }}>
            <strong style={{ color: 'var(--color-canvas-ink, #0f1011)' }}>{overview.completedThisMonth}</strong> tasks completed this month
          </p>
        </div>

        {/* Card 3: Active Workload */}
        <div style={{
          background: 'var(--color-canvas-card, #fff)',
          border: '1px solid var(--color-canvas-hairline, #e8eaec)',
          borderRadius: 10, padding: '16px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-mute, #8a8f98)' }}>
              Active Pipeline
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <div
              onClick={() => onDrillDown?.({ type: 'status', value: 'in_progress', label: 'In Progress Tasks' })}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: activeFilter?.value === 'in_progress' ? 'var(--color-badge-progress-bg, #ffefcf)' : 'var(--color-canvas-subtle, #f9fafa)',
                border: '1px solid var(--color-canvas-hairline, #e8eaec)',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 600, color: '#ab570a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                In Progress
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-canvas-ink, #0f1011)', marginTop: 2 }}>
                {overview.inProgressTasks}
              </div>
            </div>

            <div
              onClick={() => onDrillDown?.({ type: 'status', value: 'todo', label: 'Todo Tasks' })}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                background: activeFilter?.value === 'todo' ? 'var(--color-badge-todo-bg, #f5f5f5)' : 'var(--color-canvas-subtle, #f9fafa)',
                border: '1px solid var(--color-canvas-hairline, #e8eaec)',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-canvas-mute, #8a8f98)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                To Do
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-canvas-ink, #0f1011)', marginTop: 2 }}>
                {overview.todoTasks}
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Attention / Overdue */}
        <div
          onClick={() => overview.overdueTasks > 0 && onDrillDown?.({ type: 'overdue', value: 'overdue', label: 'Overdue Tasks' })}
          style={{
            background: overview.overdueTasks > 0 ? 'var(--color-badge-overdue-bg, #f7d4d6)' : 'var(--color-canvas-card, #fff)',
            border: `1px solid ${overview.overdueTasks > 0 ? 'var(--color-badge-overdue-border, rgba(238,0,0,0.25))' : 'var(--color-canvas-hairline, #e8eaec)'}`,
            borderRadius: 10, padding: '16px 18px',
            cursor: overview.overdueTasks > 0 ? 'pointer' : 'default',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            transition: 'all 150ms',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: overview.overdueTasks > 0 ? '#c50000' : 'var(--color-canvas-mute, #8a8f98)' }}>
              Overdue Attention
            </span>
            {overview.overdueTasks > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                background: '#c50000', color: '#fff', textTransform: 'uppercase',
              }}>
                Action needed
              </span>
            )}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: overview.overdueTasks > 0 ? '#c50000' : 'var(--color-canvas-ink, #0f1011)', letterSpacing: '-0.8px', lineHeight: 1 }}>
            {overview.overdueTasks}
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 11, color: overview.overdueTasks > 0 ? '#c50000' : 'var(--color-canvas-body, #50545c)' }}>
            {overview.overdueTasks > 0
              ? 'Click to view overdue tasks'
              : 'All tasks on schedule'}
          </p>
        </div>
      </div>

      {/* ── Status Distribution & Workload / Activity Split Section ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 16,
      }}>
        {/* Left Panel: Status Breakdown & Workload */}
        <div style={{
          background: 'var(--color-canvas-card, #fff)',
          border: '1px solid var(--color-canvas-hairline, #e8eaec)',
          borderRadius: 10, padding: 18,
        }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
            Status Distribution
          </h3>

          {/* Segmented multi-color bar */}
          <div style={{
            display: 'flex', height: 10, width: '100%', borderRadius: 5, overflow: 'hidden',
            background: 'var(--color-canvas-hover, #f0f1f3)', marginBottom: 14,
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
                    transition: 'width 200ms ease',
                  }}
                />
              )
            ))}
          </div>

          {/* Status interactive pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {statusBreakdown.map((s) => (
              <button
                key={s.status}
                onClick={() => onDrillDown?.({ type: 'status', value: s.status, label: `${s.label} Tasks` })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', borderRadius: 6,
                  border: `1px solid ${activeFilter?.value === s.status ? '#0070f3' : 'var(--color-canvas-hairline, #e8eaec)'}`,
                  background: activeFilter?.value === s.status ? 'var(--color-badge-done-bg, #d3e5ff)' : 'var(--color-canvas-subtle, #f9fafa)',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: s.status === 'done' ? '#0070f3' : s.status === 'in_progress' ? '#f5a623' : '#888888',
                }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-ink, #0f1011)' }}>
                  {s.label}
                </span>
                <span style={{
                  fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                  color: 'var(--color-canvas-mute, #8a8f98)',
                }}>
                  {s.count} ({s.percentage}%)
                </span>
              </button>
            ))}
          </div>

          {/* Workload by Member */}
          <div style={{ marginTop: 20 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
              Team Member Workload
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {workloadDistribution.map((member) => (
                <div
                  key={member.userId}
                  onClick={() => onDrillDown?.({ type: 'assignee', value: member.userId, label: member.name })}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 6,
                    background: activeFilter?.value === member.userId ? 'var(--color-canvas-hover, #f0f1f3)' : 'transparent',
                    border: '1px solid var(--color-canvas-hairline, #e8eaec)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', background: '#f0f1f3',
                      border: '1px solid #e8eaec', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 600, color: '#0f1011', flexShrink: 0,
                    }}>
                      {getInitials(member.name)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-ink, #0f1011)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {member.name}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {member.overdueTasks > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, color: '#c50000',
                        background: 'var(--color-badge-overdue-bg, #f7d4d6)', padding: '1px 5px', borderRadius: 4,
                      }}>
                        {member.overdueTasks} overdue
                      </span>
                    )}
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-canvas-body, #50545c)' }}>
                      {member.completedTasks}/{member.totalTasks} done ({member.completionRate}%)
                    </span>
                  </div>
                </div>
              ))}

              {/* Unassigned row */}
              {unassigned.totalTasks > 0 && (
                <div
                  onClick={() => onDrillDown?.({ type: 'assignee', value: 'unassigned', label: 'Unassigned Tasks' })}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', borderRadius: 6,
                    background: activeFilter?.value === 'unassigned' ? 'var(--color-canvas-hover, #f0f1f3)' : 'transparent',
                    border: '1px dashed var(--color-canvas-hairline, #e8eaec)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', background: '#fafafa',
                      border: '1px dashed #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: '#9ca3af', flexShrink: 0,
                    }}>
                      ?
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-mute, #8a8f98)' }}>
                      Unassigned
                    </span>
                  </div>
                  <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-canvas-mute, #8a8f98)' }}>
                    {unassigned.totalTasks} tasks
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Recent Team Activity Stream */}
        <div style={{
          background: 'var(--color-canvas-card, #fff)',
          border: '1px solid var(--color-canvas-hairline, #e8eaec)',
          borderRadius: 10, padding: 18,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
              Recent Team Activity
            </h3>
            <span style={{ fontSize: 11, color: 'var(--color-canvas-mute, #8a8f98)' }}>
              Live Stream
            </span>
          </div>

          {recentActivities.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '32px 16px', color: 'var(--color-canvas-mute, #8a8f98)', fontSize: 13,
            }}>
              No recent activity recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 310 }}>
              {recentActivities.map((act) => (
                <div
                  key={act.id}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 10px', borderRadius: 6,
                    background: 'var(--color-canvas-subtle, #f9fafa)',
                    border: '1px solid var(--color-canvas-hairline, #f0f1f3)',
                  }}
                >
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#f0f1f3',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 8, fontWeight: 700, color: '#0f1011', flexShrink: 0, marginTop: 2,
                  }}>
                    {getInitials(act.user?.name)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--color-canvas-ink, #0f1011)', lineHeight: '16px' }}>
                      <strong>{act.user?.name || 'Someone'}</strong> {act.details || act.action}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      {act.task && (
                        <span style={{
                          fontSize: 11, color: 'var(--color-canvas-body, #50545c)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180,
                        }}>
                          📌 {act.task.title}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: 'var(--color-canvas-mute, #8a8f98)', fontFamily: "'JetBrains Mono', monospace" }}>
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
    </div>
  );
}
