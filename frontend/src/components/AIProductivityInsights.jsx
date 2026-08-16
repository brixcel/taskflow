import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../api/config';

export default function AIProductivityInsights({
  teamId,
  token,
  range = '7d',
  onRangeChange,
  userId = null,
  projectId = null,
  scope = 'team',
}) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const fetchInsights = useCallback(async () => {
    if (!teamId || !token) return;

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (range) params.append('range', range);
      if (userId && scope === 'mine') params.append('userId', userId);
      if (projectId) params.append('projectId', projectId);

      const res = await fetch(`${API_BASE}/ai/productivity-insights?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load AI productivity insights');
      }

      const data = await res.json();
      setInsights(data.insights);
    } catch (err) {
      setError(err.message || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, [teamId, token, range, userId, projectId, scope]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleCopySummary = () => {
    if (!insights) return;
    const textToCopy = `✨ TaskFlow AI Productivity Insights (${insights.timeRange?.label || range})\n\n${insights.summary}\n\n🚀 Highlights:\n${insights.highlights?.map(h => `• ${h}`).join('\n') || 'None'}\n\n⚠️ Bottlenecks:\n${insights.bottlenecks?.map(b => `• ${b}`).join('\n') || 'None'}\n\n💡 Recommendations:\n${insights.recommendations?.map(r => `• ${r}`).join('\n') || 'None'}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const metrics = insights?.metrics || {};

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--color-canvas-card, #ffffff)',
        border: '1px solid var(--color-canvas-card-border, #ebebeb)',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 20,
        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Top Gradient Accent Glow Line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
        }}
      />

      {/* Header Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: isExpanded ? 14 : 0,
        }}
      >
        {/* Left Badge & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: 20,
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              fontSize: 12,
              fontWeight: 600,
              color: '#6366f1',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#6366f1',
                boxShadow: '0 0 6px #6366f1',
                display: 'inline-block',
              }}
            />
            AI Productivity Intelligence
          </div>

          {insights?.timeRange?.label && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-canvas-mute, #8a8f98)',
                fontWeight: 500,
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              {insights.timeRange.label}
            </span>
          )}
        </div>

        {/* Right Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Quick Range Pills */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: 2,
              background: 'var(--color-canvas-subtle, #f9fafa)',
              border: '1px solid var(--color-canvas-hairline, #ebebeb)',
              borderRadius: 6,
            }}
          >
            {[
              { key: '7d', label: '7D' },
              { key: '30d', label: '30D' },
              { key: '90d', label: '90D' },
              { key: 'this_week', label: 'This Week' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => onRangeChange?.(key)}
                style={{
                  height: 22,
                  padding: '0 7px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono, monospace)',
                  background: range === key ? 'var(--color-canvas-ink, #171717)' : 'transparent',
                  color: range === key ? 'var(--color-canvas-main, #ffffff)' : 'var(--color-canvas-mute, #888888)',
                  transition: 'all 120ms ease',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Copy Button */}
          <button
            onClick={handleCopySummary}
            disabled={loading || !insights}
            className="btn-secondary"
            title="Copy Insights Summary"
            style={{
              height: 26,
              padding: '0 8px',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 6,
              gap: 4,
            }}
          >
            {copied ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ color: '#10b981' }}>Copied!</span>
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Share</span>
              </>
            )}
          </button>

          {/* Refresh Button */}
          <button
            onClick={fetchInsights}
            disabled={loading}
            className="btn-secondary"
            title="Regenerate Insights"
            style={{ width: 26, height: 26, padding: 0, borderRadius: 6 }}
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>

          {/* Expand / Collapse */}
          <button
            onClick={() => setIsExpanded(v => !v)}
            className="btn-secondary"
            style={{ width: 26, height: 26, padding: 0, borderRadius: 6 }}
            title={isExpanded ? 'Collapse Insights' : 'Expand Insights'}
          >
            <svg
              width="10" height="10" viewBox="0 0 12 12" fill="none"
              style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}
            >
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {isExpanded && (
        <>
          {loading && !insights && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-canvas-mute, #8a8f98)' }}>
              <div
                style={{
                  display: 'inline-block',
                  width: 24,
                  height: 24,
                  border: '2px solid rgba(99, 102, 241, 0.2)',
                  borderTopColor: '#6366f1',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  marginBottom: 8,
                }}
              />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>Generating AI productivity insights...</p>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'var(--color-btn-danger-bg, #f7d4d6)',
                color: 'var(--color-btn-danger-fg, #c50000)',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{error}</span>
              <button
                onClick={fetchInsights}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Retry
              </button>
            </div>
          )}

          {insights && !loading && (
            <div>
              {/* Executive Summary Card */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.04) 0%, rgba(236, 72, 153, 0.04) 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.12)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 14,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    lineHeight: '20px',
                    color: 'var(--color-canvas-ink, #0f1011)',
                    fontWeight: 500,
                  }}
                >
                  {insights.summary}
                </p>

                {/* Quick Metric Pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {metrics.tasksCompleted !== undefined && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'var(--color-badge-done-bg, #d3e5ff)',
                        color: 'var(--color-badge-done-fg, #0761d1)',
                      }}
                    >
                      <span>✓ {metrics.tasksCompleted} Completed</span>
                      {metrics.velocityChangePct !== undefined && metrics.velocityChangePct !== 0 && (
                        <span style={{ opacity: 0.85, fontSize: 10 }}>
                          ({metrics.velocityChangePct > 0 ? `+${metrics.velocityChangePct}%` : `${metrics.velocityChangePct}%`})
                        </span>
                      )}
                    </div>
                  )}

                  {metrics.overdueCount > 0 && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'var(--color-badge-overdue-bg, #f7d4d6)',
                        color: 'var(--color-btn-danger-fg, #c50000)',
                      }}
                    >
                      <span>⚠️ {metrics.overdueCount} Overdue</span>
                    </div>
                  )}

                  {metrics.highestWorkloadMember?.name && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'var(--color-badge-progress-bg, #ffefcf)',
                        color: 'var(--color-badge-progress-fg, #ab570a)',
                      }}
                    >
                      <span>⚡ Heavy Load: {metrics.highestWorkloadMember.name}</span>
                    </div>
                  )}

                  {metrics.peakProductivityDay && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'var(--color-canvas-hover, #f0f1f3)',
                        color: 'var(--color-canvas-body, #4d4d4d)',
                      }}
                    >
                      <span>📅 Peak: {metrics.peakProductivityDay}s</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 4 Categorized Insight Columns / Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 12,
                }}
              >
                {/* 1. Highlights & Velocity */}
                <div
                  style={{
                    background: 'var(--color-canvas-subtle, #f9fafa)',
                    border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                    borderRadius: 8,
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#10b981',
                      marginBottom: 8,
                    }}
                  >
                    <span>🚀 Velocity & Highlights</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--color-canvas-body, #4d4d4d)', lineHeight: '18px' }}>
                    {insights.highlights?.map((h, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>{h}</li>
                    ))}
                  </ul>
                </div>

                {/* 2. Bottlenecks & Overdue */}
                <div
                  style={{
                    background: 'var(--color-canvas-subtle, #f9fafa)',
                    border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                    borderRadius: 8,
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#f59e0b',
                      marginBottom: 8,
                    }}
                  >
                    <span>⚠️ Bottlenecks & Alerts</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--color-canvas-body, #4d4d4d)', lineHeight: '18px' }}>
                    {insights.bottlenecks?.map((b, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>{b}</li>
                    ))}
                  </ul>
                </div>

                {/* 3. Workload Balance */}
                <div
                  style={{
                    background: 'var(--color-canvas-subtle, #f9fafa)',
                    border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                    borderRadius: 8,
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#6366f1',
                      marginBottom: 8,
                    }}
                  >
                    <span>👥 Team Workload</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--color-canvas-body, #4d4d4d)', lineHeight: '18px' }}>
                    {insights.workloadAnalysis?.map((w, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>{w}</li>
                    ))}
                  </ul>
                </div>

                {/* 4. Actionable Recommendations */}
                <div
                  style={{
                    background: 'var(--color-canvas-subtle, #f9fafa)',
                    border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                    borderRadius: 8,
                    padding: '12px 14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#8b5cf6',
                      marginBottom: 8,
                    }}
                  >
                    <span>💡 Recommendations</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--color-canvas-body, #4d4d4d)', lineHeight: '18px' }}>
                    {insights.recommendations?.map((r, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
