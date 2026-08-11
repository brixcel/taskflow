import { useState, useEffect } from 'react';
import { API_BASE } from '../api/config';

export default function ProjectAnalytics({ projectId, teamId, token, project }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId || !token) return;

    let isMounted = true;
    setLoading(true);

    fetch(`${API_BASE}/projects/${projectId}/stats`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Team-Id': teamId,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load project analytics');
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setStats(data.stats);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [projectId, teamId, token]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-canvas-mute, #8a8f98)' }}>
        <p>Loading project analytics...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: '#ef4444' }}>
        <p>{error || 'Unable to load project statistics'}</p>
      </div>
    );
  }

  const {
    totalTasks = 0,
    completedTasks = 0,
    inProgressTasks = 0,
    todoTasks = 0,
    overdueTasks = 0,
    progress = 0,
    statusCounts = { todo: 0, in_progress: 0, done: 0 },
    priorityCounts = { low: 0, medium: 0, high: 0, urgent: 0 },
    workload = [],
  } = stats;

  return (
    <div style={{ padding: '0 8px 32px 8px', maxWidth: 1100, margin: '0 auto' }}>
      {/* 4 Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: 'var(--color-canvas-card, #ffffff)',
            border: '1px solid var(--color-canvas-card-border, #ebebeb)',
            borderRadius: 10,
            padding: '16px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <p style={{ margin: '0 0 6px 0', fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-mute, #8a8f98)' }}>
            Completion Rate
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-canvas-ink, #0f1011)' }}>
              {progress}%
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-canvas-body, #4d4d4d)' }}>
              {completedTasks} of {totalTasks} tasks
            </span>
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-canvas-card, #ffffff)',
            border: '1px solid var(--color-canvas-card-border, #ebebeb)',
            borderRadius: 10,
            padding: '16px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <p style={{ margin: '0 0 6px 0', fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-mute, #8a8f98)' }}>
            In Progress
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>
              {inProgressTasks}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-canvas-body, #4d4d4d)' }}>
              active tasks
            </span>
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-canvas-card, #ffffff)',
            border: '1px solid var(--color-canvas-card-border, #ebebeb)',
            borderRadius: 10,
            padding: '16px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <p style={{ margin: '0 0 6px 0', fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-mute, #8a8f98)' }}>
            To Do / Backlog
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-canvas-ink, #0f1011)' }}>
              {todoTasks}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-canvas-body, #4d4d4d)' }}>
              pending
            </span>
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-canvas-card, #ffffff)',
            border: '1px solid var(--color-canvas-card-border, #ebebeb)',
            borderRadius: 10,
            padding: '16px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <p style={{ margin: '0 0 6px 0', fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-mute, #8a8f98)' }}>
            Overdue Tasks
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: overdueTasks > 0 ? '#ef4444' : '#10b981' }}>
              {overdueTasks}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-canvas-body, #4d4d4d)' }}>
              {overdueTasks > 0 ? 'needs attention' : 'on track'}
            </span>
          </div>
        </div>
      </div>

      {/* Breakdown Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {/* Status Distribution */}
        <div
          style={{
            background: 'var(--color-canvas-card, #ffffff)',
            border: '1px solid var(--color-canvas-card-border, #ebebeb)',
            borderRadius: 10,
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
            Status Distribution
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--color-canvas-body, #4d4d4d)' }}>Completed</span>
                <span style={{ fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
                  {statusCounts.done} ({totalTasks > 0 ? Math.round((statusCounts.done / totalTasks) * 100) : 0}%)
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--color-canvas-hover, #f0f1f3)', overflow: 'hidden' }}>
                <div style={{ width: `${totalTasks > 0 ? (statusCounts.done / totalTasks) * 100 : 0}%`, height: '100%', background: '#10b981' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--color-canvas-body, #4d4d4d)' }}>In Progress</span>
                <span style={{ fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
                  {statusCounts.in_progress} ({totalTasks > 0 ? Math.round((statusCounts.in_progress / totalTasks) * 100) : 0}%)
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--color-canvas-hover, #f0f1f3)', overflow: 'hidden' }}>
                <div style={{ width: `${totalTasks > 0 ? (statusCounts.in_progress / totalTasks) * 100 : 0}%`, height: '100%', background: '#f59e0b' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--color-canvas-body, #4d4d4d)' }}>To Do</span>
                <span style={{ fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
                  {statusCounts.todo} ({totalTasks > 0 ? Math.round((statusCounts.todo / totalTasks) * 100) : 0}%)
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--color-canvas-hover, #f0f1f3)', overflow: 'hidden' }}>
                <div style={{ width: `${totalTasks > 0 ? (statusCounts.todo / totalTasks) * 100 : 0}%`, height: '100%', background: '#94a3b8' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Priority Breakdown */}
        <div
          style={{
            background: 'var(--color-canvas-card, #ffffff)',
            border: '1px solid var(--color-canvas-card-border, #ebebeb)',
            borderRadius: 10,
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
            Priority Breakdown
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: 10, borderRadius: 6, background: '#fef2f2', border: '1px solid #fee2e2' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>Urgent</span>
              <p style={{ margin: '4px 0 0 0', fontSize: 20, fontWeight: 700, color: '#991b1b' }}>
                {priorityCounts.urgent || 0}
              </p>
            </div>

            <div style={{ padding: 10, borderRadius: 6, background: '#fff7ed', border: '1px solid #ffedd5' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#ea580c', textTransform: 'uppercase' }}>High</span>
              <p style={{ margin: '4px 0 0 0', fontSize: 20, fontWeight: 700, color: '#9a3412' }}>
                {priorityCounts.high || 0}
              </p>
            </div>

            <div style={{ padding: 10, borderRadius: 6, background: '#f0fdf4', border: '1px solid #dcfce7' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Medium</span>
              <p style={{ margin: '4px 0 0 0', fontSize: 20, fontWeight: 700, color: '#166534' }}>
                {priorityCounts.medium || 0}
              </p>
            </div>

            <div style={{ padding: 10, borderRadius: 6, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Low</span>
              <p style={{ margin: '4px 0 0 0', fontSize: 20, fontWeight: 700, color: '#334155' }}>
                {priorityCounts.low || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Team Workload in Project */}
        <div
          style={{
            gridColumn: '1 / -1',
            background: 'var(--color-canvas-card, #ffffff)',
            border: '1px solid var(--color-canvas-card-border, #ebebeb)',
            borderRadius: 10,
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
            Assignee Workload
          </h3>

          {workload.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)', margin: 0 }}>
              No tasks assigned yet in this project.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {workload.map((w) => (
                <div
                  key={w.userId || 'unassigned'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: 'var(--color-canvas-subtle, #f9fafa)',
                    border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        backgroundColor: '#3b82f6',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {(w.name || 'U')[0].toUpperCase()}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-ink, #0f1011)' }}>
                      {w.name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>{w.completed} done</span>
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>{w.inProgress} active</span>
                      <span style={{ color: 'var(--color-canvas-mute, #8a8f98)' }}>{w.todo} todo</span>
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        backgroundColor: 'var(--color-canvas-hover, #f0f1f3)',
                        color: 'var(--color-canvas-ink, #0f1011)',
                      }}
                    >
                      {w.total} total
                    </span>
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
