import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../api/config';

const API = API_URL;

function formatTimestamp(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function UserAvatar({ name }) {
  const initials = (name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: '50%',
        background: '#f0f1f3', border: '1px solid #e8eaec',
        fontSize: 11, fontWeight: 600, color: '#0f1011',
        fontFamily: "'JetBrains Mono', monospace", flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

export default function TaskDetailDrawer({
  task,
  headers,
  onClose,
  onStatusChange,
  onDelete,
}) {
  const [comments, setComments] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activeTab, setActiveTab] = useState('comments'); // 'comments' | 'activity'
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!task?.id) return;
    let isMounted = true;

    axios.get(`${API}/tasks/${task.id}/comments`, { headers })
      .catch(() => ({ data: { comments: [] } }))
      .then(commentsRes => {
        return axios.get(`${API}/tasks/${task.id}/activities`, { headers })
          .catch(() => ({ data: { activities: [] } }))
          .then(activitiesRes => ({ commentsRes, activitiesRes }));
      })
      .then(({ commentsRes, activitiesRes }) => {
        if (isMounted) {
          setComments(commentsRes.data.comments ?? []);
          setActivities(activitiesRes.data.activities ?? []);
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddComment = async (e) => {
    e.preventDefault();
    const content = newComment.trim();
    if (!content || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await axios.post(
        `${API}/tasks/${task.id}/comments`,
        { content },
        { headers }
      );
      setComments((prev) => [...prev, res.data.comment]);
      setNewComment('');

      // Refresh activity log to reflect the new comment
      const actRes = await axios.get(`${API}/tasks/${task.id}/activities`, { headers }).catch(() => null);
      if (actRes?.data?.activities) {
        setActivities(actRes.data.activities);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!task) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(2px)',
          zIndex: 40,
        }}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <aside
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: '100%', maxWidth: 460,
          background: 'var(--color-canvas-card, #ffffff)',
          borderLeft: '1px solid var(--color-canvas-hairline, #ebebeb)',
          boxShadow: 'var(--color-modal-backdrop, rgba(0,0,0,0.12)) -4px 0 24px',
          zIndex: 50,
          display: 'flex', flexDirection: 'column',
          transition: 'background-color 120ms',
        }}
        aria-label="Task Details"
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--color-canvas-mute, #888888)', fontFamily: "'JetBrains Mono', monospace" }}>
              TASK-{task.id.slice(0, 6)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onDelete && (
              <button
                onClick={() => { onDelete(task.id); onClose(); }}
                className="btn-secondary"
                style={{ height: 30, fontSize: 12, color: 'var(--color-btn-danger-fg, #ee0000)' }}
              >
                Delete task
              </button>
            )}
            <button
              onClick={onClose}
              className="btn-secondary"
              style={{
                width: 30, height: 30, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Close task details"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {/* Title & Status */}
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 600, color: 'var(--color-canvas-ink, #171717)', letterSpacing: '-0.4px', lineHeight: '24px' }}>
            {task.title}
          </h2>

          {/* Quick Properties */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px', background: 'var(--color-canvas-subtle, #fafafa)', borderRadius: 8, border: '1px solid var(--color-canvas-hairline, #ebebeb)', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--color-canvas-mute, #888888)' }}>Status</span>
              <select
                value={task.status}
                onChange={(e) => onStatusChange?.(task.id, e.target.value)}
                className={`badge ${task.status === 'done' ? 'badge-done' : task.status === 'in_progress' ? 'badge-progress' : 'badge-todo'}`}
                style={{
                  height: 26,
                  padding: '0 8px',
                  fontSize: 12,
                  borderRadius: 5,
                  border: '1px solid',
                  fontWeight: 500,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="todo" style={{ background: 'var(--color-canvas-card, #fff)', color: 'var(--color-canvas-ink, #171717)' }}>Todo</option>
                <option value="in_progress" style={{ background: 'var(--color-canvas-card, #fff)', color: 'var(--color-canvas-ink, #171717)' }}>In Progress</option>
                <option value="done" style={{ background: 'var(--color-canvas-card, #fff)', color: 'var(--color-canvas-ink, #171717)' }}>Done</option>
              </select>
            </div>

            {task.assignee && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--color-canvas-mute, #888888)' }}>Assignee</span>
                <span style={{ fontWeight: 500, color: 'var(--color-canvas-ink, #171717)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserAvatar name={task.assignee.name} />
                  {task.assignee.name}
                </span>
              </div>
            )}
          </div>

          {/* Tabs: Comments vs Activity */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)', marginBottom: 16 }}>
            <button
              onClick={() => setActiveTab('comments')}
              style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 600,
                color: activeTab === 'comments' ? 'var(--color-canvas-ink, #171717)' : 'var(--color-canvas-mute, #888888)',
                borderBottom: activeTab === 'comments' ? '2px solid var(--color-canvas-ink, #171717)' : '2px solid transparent',
                background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Comments ({comments.length})
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 600,
                color: activeTab === 'activity' ? 'var(--color-canvas-ink, #171717)' : 'var(--color-canvas-mute, #888888)',
                borderBottom: activeTab === 'activity' ? '2px solid var(--color-canvas-ink, #171717)' : '2px solid transparent',
                background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                cursor: 'pointer',
              }}
            >
              Activity Log ({activities.length})
            </button>
          </div>

          {/* Tab 1: Comments */}
          {activeTab === 'comments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Comment Input */}
              <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  className="field-input"
                  rows={3}
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  style={{
                    height: 'auto', padding: '10px 12px', resize: 'vertical',
                    fontSize: 13, fontFamily: 'inherit',
                  }}
                />
                {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-btn-danger-fg, #d93025)' }}>{error}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting || !newComment.trim()}
                    style={{ height: 32, fontSize: 12, padding: '0 12px' }}
                  >
                    {submitting ? 'Posting…' : 'Comment'}
                  </button>
                </div>
              </form>

              <div style={{ borderTop: '1px solid var(--color-canvas-hairline, #f0f1f3)', paddingTop: 12 }} />

              {/* Comments List */}
              {loading ? (
                <p style={{ fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)', textAlign: 'center', margin: '20px 0' }}>Loading comments…</p>
              ) : comments.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)', textAlign: 'center', margin: '20px 0' }}>
                  No comments yet. Start the conversation!
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex', gap: 10, padding: '12px',
                        background: 'var(--color-canvas-subtle, #f9fafa)', borderRadius: 8, border: '1px solid var(--color-canvas-hairline, #f0f1f3)',
                      }}
                    >
                      <UserAvatar name={c.author?.name} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
                            {c.author?.name || 'Unknown User'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--color-canvas-mute, #8a8f98)', fontFamily: "'JetBrains Mono', monospace" }}>
                            {formatTimestamp(c.createdAt)}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-canvas-body, #3d4148)', lineHeight: '18px', whiteSpace: 'pre-wrap' }}>
                          {c.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Activity Log */}
          {activeTab === 'activity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loading ? (
                <p style={{ fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)', textAlign: 'center', margin: '20px 0' }}>Loading activity…</p>
              ) : activities.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)', textAlign: 'center', margin: '20px 0' }}>No activity logged yet.</p>
              ) : (
                activities.map((act) => (
                  <div
                    key={act.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      fontSize: 12, color: 'var(--color-canvas-body, #50545c)', padding: '6px 0',
                      borderBottom: '1px solid var(--color-canvas-hairline, #f0f1f3)',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-canvas-mute, #8a8f98)', marginTop: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
                        {act.user?.name || 'User'}
                      </span>{' '}
                      {act.details || act.action}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--color-canvas-mute, #8a8f98)', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                      {formatTimestamp(act.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
