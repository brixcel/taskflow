import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useRealtime } from '../context/RealtimeContext';
import { API_URL } from '../api/config';
import { formatRelativeTime, getNotificationTypeMeta } from './NotificationBell';

const API = API_URL;

const CATEGORY_MAP = {
  all: null,
  unread: null,
  tasks: ['task_assigned', 'task_reassigned', 'status_changed', 'task_completed'],
  comments: ['comment_created', 'mention'],
  due_dates: ['due_date_approaching', 'overdue'],
  team: ['team_invitation', 'role_changed'],
};

export default function NotificationCenter({
  isOpen,
  onClose,
  onSelectTask,
  initialTab = 'all',
}) {
  const [activeTab, setActiveTab]         = useState(initialTab);
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal]                 = useState(0);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [page, setPage]                   = useState(1);
  const [totalPages, setTotalPages]       = useState(1);
  const [loading, setLoading]             = useState(false);
  const [searchQuery, setSearchQuery]     = useState('');
  const [preferences, setPreferences]     = useState({
    taskAssigned: true,
    statusChanged: true,
    commentsAndMentions: true,
    dueDates: true,
    teamUpdates: true,
    emailNotifications: false,
  });
  const [savingPrefs, setSavingPrefs]     = useState(false);
  const [prefSaveSuccess, setPrefSaveSuccess] = useState(false);

  const token = localStorage.getItem('token');
  const { subscribe } = useRealtime();

  // Load preferences
  const fetchPreferences = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/notifications/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.preferences) {
        setPreferences(res.data.preferences);
      }
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
    }
  }, [token]);

  // Load paginated notifications
  const fetchNotifications = useCallback(async (targetPage = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(targetPage));
      params.append('limit', '15');

      if (activeTab === 'unread') {
        params.append('unread', 'true');
      }

      const res = await axios.get(`${API}/notifications?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setNotifications(res.data.notifications || []);
      setTotal(res.data.total || 0);
      setUnreadCount(res.data.unreadCount || 0);
      setPage(res.data.page || 1);
      setTotalPages(res.data.totalPages || 1);
    } catch (err) {
      console.error('Failed to load notifications in center:', err);
    } finally {
      setLoading(false);
    }
  }, [token, activeTab]);

  // Live real-time notification receiver in center
  useEffect(() => {
    const unsub = subscribe('notification.created', ({ notification }) => {
      if (!notification) return;
      setUnreadCount((c) => c + 1);
      setTotal((t) => t + 1);
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notification.id)) return prev;
        return [notification, ...prev];
      });
    });

    return () => {
      unsub?.();
    };
  }, [subscribe]);

  useEffect(() => {
    if (isOpen) {
      fetchPreferences();
      if (activeTab !== 'preferences') {
        fetchNotifications(1);
      }
    }
  }, [isOpen, activeTab, fetchPreferences, fetchNotifications]);

  // Mark single as read
  const handleMarkRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await axios.patch(`${API}/notifications/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      await axios.post(`${API}/notifications/read-all`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  // Clear all read
  const handleClearRead = async () => {
    try {
      await axios.delete(`${API}/notifications/clear-all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchNotifications(1);
    } catch (err) {
      console.error('Failed to clear read notifications:', err);
    }
  };

  // Delete single notification
  const handleDeleteNotification = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await axios.delete(`${API}/notifications/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  // Toggle preference option
  const handleTogglePreference = async (key) => {
    const updated = { ...preferences, [key]: !preferences[key] };
    setPreferences(updated);
    setSavingPrefs(true);
    try {
      await axios.patch(`${API}/notifications/preferences`, updated, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPrefSaveSuccess(true);
      setTimeout(() => setPrefSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update preference:', err);
    } finally {
      setSavingPrefs(false);
    }
  };

  // Client-side category and search filtering
  const filteredNotifications = useMemo(() => {
    let list = notifications;

    // Category filter
    const allowedTypes = CATEGORY_MAP[activeTab];
    if (allowedTypes) {
      list = list.filter((n) => allowedTypes.includes(n.type));
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          n.message?.toLowerCase().includes(q) ||
          n.task?.title?.toLowerCase().includes(q) ||
          n.actor?.name?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [notifications, activeTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-center-title"
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-card-border,#ebebeb)] rounded-[16px] shadow-2xl flex flex-col overflow-hidden text-[var(--color-canvas-ink,#171717)]"
        style={{ boxShadow: '0 20px 48px rgba(0,0,0,0.18)' }}
      >
        {/* ── Top Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-canvas-hairline,#ebebeb)] bg-[var(--color-canvas-card-subtle,#fafafa)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[8px] bg-[var(--color-canvas-ink,#171717)] text-[var(--color-canvas-main,#ffffff)] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 2a3.5 3.5 0 00-3.5 3.5v2.2L3.3 9.7A.75.75 0 003.8 11h8.4a.75.75 0 00.5-1.3L11.5 7.7V5.5A3.5 3.5 0 008 2zM6.5 12a1.5 1.5 0 003 0"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h2 id="notification-center-title" className="text-[16px] font-bold tracking-[-0.3px] m-0">
                Notification Center
              </h2>
              <p className="text-[12px] text-[var(--color-canvas-mute,#8a8f98)] m-0">
                {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="btn-secondary"
                style={{ height: '32px', fontSize: '12px', padding: '0 10px' }}
              >
                Mark all as read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Notification Center"
              className="w-8 h-8 flex items-center justify-center rounded-[6px] border border-[var(--color-canvas-hairline,#ebebeb)] hover:bg-[var(--color-canvas-hover,#f0f1f3)] text-[var(--color-canvas-mute,#8a8f98)] hover:text-[var(--color-canvas-ink,#171717)] transition-colors cursor-pointer bg-transparent"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Sub-header: Navigation Tabs & Search ────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-6 py-3 border-b border-[var(--color-canvas-hairline,#ebebeb)] bg-[var(--color-canvas-card,#ffffff)]">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {[
              { key: 'all',        label: 'Inbox' },
              { key: 'unread',     label: `Unread ${unreadCount > 0 ? `(${unreadCount})` : ''}` },
              { key: 'tasks',      label: 'Tasks' },
              { key: 'comments',   label: 'Comments' },
              { key: 'due_dates',  label: 'Due Dates' },
              { key: 'team',       label: 'Team' },
              { key: 'preferences', label: 'Preferences' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveTab(key);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors whitespace-nowrap border-0 cursor-pointer ${
                  activeTab === key
                    ? 'bg-[var(--color-canvas-ink,#171717)] text-[var(--color-canvas-main,#ffffff)]'
                    : 'bg-transparent text-[var(--color-canvas-mute,#8a8f98)] hover:text-[var(--color-canvas-ink,#171717)] hover:bg-[var(--color-canvas-hover,#f5f5f5)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search bar (when not in preferences) */}
          {activeTab !== 'preferences' && (
            <div className="relative shrink-0 sm:w-56">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-canvas-mute,#8a8f98)] pointer-events-none">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M7 12A5 5 0 107 2a5 5 0 000 10zM14 14l-3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notifications…"
                className="field-input"
                style={{ height: '30px', paddingLeft: '28px', fontSize: '12px', width: '100%' }}
              />
            </div>
          )}
        </div>

        {/* ── Main Content Area ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6" style={{ minHeight: '320px' }}>
          {activeTab === 'preferences' ? (
            /* ── Preferences Settings Panel ── */
            <div className="max-w-xl mx-auto space-y-6">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--color-canvas-ink,#171717)] m-0 mb-1">
                  Notification Alert Preferences
                </h3>
                <p className="text-[13px] text-[var(--color-canvas-body,#50545c)] m-0">
                  Choose which events in your workspace trigger in-app notifications and banner alerts.
                </p>
              </div>

              {prefSaveSuccess && (
                <div className="success-banner text-[13px] p-2.5 rounded-[6px]">
                  Preferences updated successfully!
                </div>
              )}

              <div className="space-y-3 bg-[var(--color-canvas-card-subtle,#fafafa)] border border-[var(--color-canvas-hairline,#ebebeb)] rounded-[12px] p-4 divide-y divide-[var(--color-canvas-hairline,#ebebeb)]">
                {[
                  {
                    key: 'taskAssigned',
                    title: 'Task Assignments & Reassignments',
                    desc: 'When you are assigned to a task or when an existing task is reassigned to you.',
                  },
                  {
                    key: 'statusChanged',
                    title: 'Task Status & Completion',
                    desc: 'When the status of a task you created or are assigned to changes or is completed.',
                  },
                  {
                    key: 'commentsAndMentions',
                    title: 'Comments & @Mentions',
                    desc: 'When team members comment on your tasks or directly @mention you in notes.',
                  },
                  {
                    key: 'dueDates',
                    title: 'Due Dates & Overdue Notices',
                    desc: 'Reminders when assigned tasks are due within 24 hours or become overdue.',
                  },
                  {
                    key: 'teamUpdates',
                    title: 'Team Invitations & Role Changes',
                    desc: 'When you are added to a team workspace or your member role is updated.',
                  },
                  {
                    key: 'emailNotifications',
                    title: 'Email Notifications (Digest)',
                    desc: 'Receive transactional emails for important critical events.',
                  },
                ].map(({ key, title, desc }) => (
                  <div key={key} className="flex items-center justify-between gap-4 pt-3 first:pt-0">
                    <div className="pr-4">
                      <p className="text-[13px] font-semibold text-[var(--color-canvas-ink,#171717)] m-0 mb-0.5">
                        {title}
                      </p>
                      <p className="text-[12px] text-[var(--color-canvas-mute,#8a8f98)] m-0 leading-tight">
                        {desc}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={Boolean(preferences[key])}
                        onChange={() => handleTogglePreference(key)}
                        disabled={savingPrefs}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0070f3]" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ) : loading ? (
            /* ── Loading Spinner ── */
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-[var(--color-canvas-mute,#8a8f98)]">
              <span className="inline-block w-6 h-6 border-2 border-[var(--color-canvas-mute,#8a8f98)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[13px]">Loading notifications…</span>
            </div>
          ) : filteredNotifications.length === 0 ? (
            /* ── Empty State ── */
            <div className="py-20 px-6 text-center max-w-sm mx-auto">
              <div className="w-12 h-12 rounded-full bg-[var(--color-canvas-hover,#f0f1f3)] flex items-center justify-center text-[var(--color-canvas-mute,#8a8f98)] mx-auto mb-3">
                <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 2a3.5 3.5 0 00-3.5 3.5v2.2L3.3 9.7A.75.75 0 003.8 11h8.4a.75.75 0 00.5-1.3L11.5 7.7V5.5A3.5 3.5 0 008 2zM6.5 12a1.5 1.5 0 003 0"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="text-[14px] font-semibold text-[var(--color-canvas-ink,#171717)] m-0 mb-1">
                {searchQuery ? 'No matching notifications' : 'No notifications in this category'}
              </h3>
              <p className="text-[13px] text-[var(--color-canvas-mute,#8a8f98)] m-0">
                {searchQuery
                  ? `No items found matching "${searchQuery}". Try a different keyword.`
                  : 'You’re all caught up! New events and updates will be shown here.'}
              </p>
            </div>
          ) : (
            /* ── Notifications List ── */
            <div className="space-y-2.5">
              {filteredNotifications.map((item) => {
                const meta = getNotificationTypeMeta(item.type);
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (!item.read) handleMarkRead(item.id);
                      if (item.taskId && onSelectTask) onSelectTask(item.taskId);
                    }}
                    className={`group relative flex items-start gap-4 p-4 rounded-[10px] border transition-all cursor-pointer ${
                      !item.read
                        ? 'bg-[var(--color-canvas-card,#ffffff)] border-[#0070f3]/30 shadow-sm hover:border-[#0070f3]'
                        : 'bg-[var(--color-canvas-card-subtle,#fafafa)] border-[var(--color-canvas-hairline,#ebebeb)] hover:border-[var(--color-canvas-hairline-strong,#a1a1a1)] opacity-90'
                    }`}
                  >
                    {/* Unread Accent Bar */}
                    {!item.read && (
                      <span className="absolute left-0 top-3 bottom-3 w-[4px] bg-[#0070f3] rounded-r-full" />
                    )}

                    {/* Icon Badge */}
                    <span
                      className="shrink-0 w-8 h-8 rounded-[8px] flex items-center justify-center border mt-0.5"
                      style={{
                        color: meta.color,
                        background: meta.bg,
                        borderColor: meta.border,
                      }}
                    >
                      {meta.icon}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-8">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[13px] font-semibold text-[var(--color-canvas-ink,#171717)]">
                          {item.title}
                        </span>
                        <span
                          className="px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: meta.color, background: meta.bg }}
                        >
                          {meta.label}
                        </span>
                        <span className="text-[11px] text-[var(--color-canvas-mute,#8a8f98)] ml-auto">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>

                      <p className="text-[13px] text-[var(--color-canvas-body,#50545c)] m-0 mb-2 leading-[18px]">
                        {item.message}
                      </p>

                      {/* Associated Task Pill */}
                      {item.task && (
                        <div className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-canvas-ink,#171717)] bg-[var(--color-canvas-hover,#f0f1f3)] px-2 py-1 rounded-[6px] border border-[var(--color-canvas-hairline,#ebebeb)] hover:bg-[var(--color-canvas-card,#ffffff)] transition-colors">
                          <span>📋</span>
                          <span className="truncate max-w-xs">{item.task.title}</span>
                          <span className="text-[10px] text-[var(--color-canvas-mute,#8a8f98)] uppercase font-mono">
                            {item.task.status}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Quick actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {!item.read ? (
                        <button
                          type="button"
                          onClick={(e) => handleMarkRead(item.id, e)}
                          title="Mark read"
                          className="px-2 py-1 rounded-[5px] text-[11px] font-medium text-[#0070f3] hover:bg-[#0070f3]/10 transition-colors border-0 bg-transparent cursor-pointer"
                        >
                          Mark read
                        </button>
                      ) : (
                        <span className="text-[11px] text-[var(--color-canvas-mute,#8a8f98)] px-2">
                          Read
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleDeleteNotification(item.id, e)}
                        title="Delete notification"
                        aria-label="Delete notification"
                        className="w-7 h-7 flex items-center justify-center rounded-[5px] text-[var(--color-canvas-mute,#8a8f98)] hover:text-[#e5484d] hover:bg-[#e5484d]/10 transition-colors border-0 bg-transparent cursor-pointer"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer Controls ─────────────────────────────────────────────────── */}
        {activeTab !== 'preferences' && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--color-canvas-hairline,#ebebeb)] bg-[var(--color-canvas-card-subtle,#fafafa)] text-[12px]">
            <div className="flex items-center gap-3">
              <span className="text-[var(--color-canvas-mute,#8a8f98)]">
                Showing {filteredNotifications.length} of {total} notifications
              </span>
              <button
                type="button"
                onClick={handleClearRead}
                className="text-[var(--color-canvas-mute,#8a8f98)] hover:text-[#e5484d] transition-colors border-0 bg-transparent cursor-pointer p-0 underline"
              >
                Clear all read
              </button>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchNotifications(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="btn-secondary"
                  style={{ height: '28px', padding: '0 8px', fontSize: '11px' }}
                >
                  Previous
                </button>
                <span className="text-[var(--color-canvas-mute,#8a8f98)] font-mono">
                  {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => fetchNotifications(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="btn-secondary"
                  style={{ height: '28px', padding: '0 8px', fontSize: '11px' }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
