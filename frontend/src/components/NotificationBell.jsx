import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useRealtime } from '../context/RealtimeContext';
import { API_URL } from '../api/config';
import NotificationCenter from './NotificationCenter';

const API = API_URL;

/**
 * Format timestamp into relative human-readable string.
 */
export function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 45) return 'just now';
  if (diffSec < 90) return '1m ago';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Visual metadata and icons per event type.
 */
export function getNotificationTypeMeta(type) {
  switch (type) {
    case 'task_assigned':
    case 'task_reassigned':
      return {
        color: '#4f46e5',
        bg: 'rgba(79, 70, 229, 0.10)',
        border: 'rgba(79, 70, 229, 0.25)',
        label: 'Task',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M5.5 3.5h5M5.5 6.5h5M5.5 9.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="2.5" y="1.5" width="11" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        ),
      };

    case 'task_completed':
      return {
        color: '#10b981',
        bg: 'rgba(16, 185, 129, 0.10)',
        border: 'rgba(16, 185, 129, 0.25)',
        label: 'Completed',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 8.2l2.2 2.2L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      };

    case 'status_changed':
      return {
        color: '#0ea5e9',
        bg: 'rgba(14, 165, 233, 0.10)',
        border: 'rgba(14, 165, 233, 0.25)',
        label: 'Status',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h10M9.5 4.5L13 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ),
      };

    case 'mention':
      return {
        color: '#8b5cf6',
        bg: 'rgba(139, 92, 246, 0.10)',
        border: 'rgba(139, 92, 246, 0.25)',
        label: 'Mention',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 8v2a1.5 1.5 0 003 0V8a6 6 0 10-6 6h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
      };

    case 'comment_created':
      return {
        color: '#a855f7',
        bg: 'rgba(168, 85, 247, 0.10)',
        border: 'rgba(168, 85, 247, 0.25)',
        label: 'Comment',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 4.5A2.5 2.5 0 015.5 2h5A2.5 2.5 0 0113 4.5v5A2.5 2.5 0 0110.5 12H6l-3.5 2.5V4.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        ),
      };

    case 'due_date_approaching':
      return {
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.10)',
        border: 'rgba(245, 158, 11, 0.25)',
        label: 'Due Soon',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
      };

    case 'overdue':
      return {
        color: '#ef4444',
        bg: 'rgba(239, 68, 68, 0.10)',
        border: 'rgba(239, 68, 68, 0.25)',
        label: 'Overdue',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.5v4M8 11.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
      };

    case 'team_invitation':
    case 'role_changed':
      return {
        color: '#06b6d4',
        bg: 'rgba(6, 182, 212, 0.10)',
        border: 'rgba(6, 182, 212, 0.25)',
        label: 'Team',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M11.5 14v-1.5a3 3 0 00-3-3h-3a3 3 0 00-3 3V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M14 8.5h-3M12.5 7v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
      };

    default:
      return {
        color: 'var(--color-canvas-mute, #8a8f98)',
        bg: 'var(--color-canvas-hover, #f0f1f3)',
        border: 'var(--color-canvas-hairline, #e8eaec)',
        label: 'Update',
        icon: (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5.5v3M8 10.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        ),
      };
  }
}

/**
 * Notification Bell Button & Dropdown Component
 */
export default function NotificationBell({ onSelectTask = null }) {
  const [unreadCount, setUnreadCount]     = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [dropdownOpen, setDropdownOpen]   = useState(false);
  const [filterTab, setFilterTab]         = useState('all'); // 'all' | 'unread'
  const [centerOpen, setCenterOpen]       = useState(false);
  const [centerInitialTab, setCenterInitialTab] = useState('all');

  const dropdownRef = useRef(null);
  const token = localStorage.getItem('token');
  const { subscribe } = useRealtime();

  // Fetch unread count lightweight
  const fetchUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API}/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUnreadCount(res.data.unreadCount || 0);
    } catch {
      // Graceful fallback
    }
  }, [token]);

  // Fetch recent notifications for dropdown
  const fetchRecentNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API}/notifications?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unreadCount || 0);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Real-time notification arrival listener
  useEffect(() => {
    const unsub = subscribe('notification.created', ({ notification }) => {
      if (!notification) return;
      setUnreadCount((c) => c + 1);
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notification.id)) return prev;
        return [notification, ...prev];
      });
    });

    return () => {
      unsub?.();
    };
  }, [subscribe]);

  // Initial load and periodic polling
  useEffect(() => {
    fetchUnreadCount();

    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 25000);

    const onFocus = () => {
      fetchUnreadCount();
      if (dropdownOpen) fetchRecentNotifications();
    };

    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchUnreadCount, fetchRecentNotifications, dropdownOpen]);

  // Fetch list when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      fetchRecentNotifications();
    }
  }, [dropdownOpen, fetchRecentNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

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
      console.error('Failed to mark notification read:', err);
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      await axios.post(`${API}/notifications/read-all`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  // Delete notification
  const handleDeleteNotification = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await axios.delete(`${API}/notifications/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const deleted = notifications.find((n) => n.id === id);
      if (deleted && !deleted.read) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  // Notification item click
  const handleNotificationClick = async (notification) => {
    if (!notification.read) {
      await handleMarkRead(notification.id);
    }
    setDropdownOpen(false);
    if (notification.taskId && onSelectTask) {
      onSelectTask(notification.taskId);
    }
  };

  const displayedNotifications = filterTab === 'unread'
    ? notifications.filter((n) => !n.read)
    : notifications;

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* ── Bell Icon Button ────────────────────────────────────────────────── */}
      <button
        id="notification-bell-btn"
        type="button"
        onClick={() => setDropdownOpen((v) => !v)}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-haspopup="true"
        aria-expanded={dropdownOpen}
        className="relative flex items-center justify-center w-8 h-8 rounded-[6px] border border-[var(--color-canvas-hairline,#ebebeb)] bg-[var(--color-canvas-card,#ffffff)] text-[var(--color-canvas-ink,#171717)] hover:bg-[var(--color-canvas-hover,#fafafa)] hover:border-[var(--color-canvas-hairline-strong,#a1a1a1)] transition-colors cursor-pointer"
        style={{ padding: 0 }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 2a3.5 3.5 0 00-3.5 3.5v2.2L3.3 9.7A.75.75 0 003.8 11h8.4a.75.75 0 00.5-1.3L11.5 7.7V5.5A3.5 3.5 0 008 2zM6.5 12a1.5 1.5 0 003 0"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-[#e5484d] text-white font-bold leading-none animate-pulse"
            style={{ fontSize: '10px', boxShadow: '0 0 0 2px var(--color-header-bg, #ffffff)' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Notification Dropdown Popover ───────────────────────────────────── */}
      {dropdownOpen && (
        <div
          role="dialog"
          aria-label="Notifications preview"
          className="absolute right-0 mt-2 w-[360px] sm:w-[380px] max-w-[calc(100vw-32px)] bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-hairline,#ebebeb)] rounded-[12px] shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100"
          style={{
            boxShadow: '0 12px 36px rgba(0,0,0,0.15)',
            maxHeight: '520px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-canvas-hairline,#ebebeb)] bg-[var(--color-canvas-card-subtle,#fafafa)]">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold text-[var(--color-canvas-ink,#171717)] tracking-[-0.2px] m-0">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#e5484d]/10 text-[#e5484d] border border-[#e5484d]/20">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[12px] font-medium text-[#0070f3] hover:underline cursor-pointer border-0 bg-transparent p-0"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--color-canvas-hairline,#ebebeb)] bg-[var(--color-canvas-card,#ffffff)]">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-2.5 py-1 rounded-[6px] text-[12px] font-medium transition-colors border-0 cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-[var(--color-canvas-hover,#f0f1f3)] text-[var(--color-canvas-ink,#171717)]'
                  : 'bg-transparent text-[var(--color-canvas-mute,#8a8f98)] hover:text-[var(--color-canvas-ink,#171717)]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterTab('unread')}
              className={`px-2.5 py-1 rounded-[6px] text-[12px] font-medium transition-colors border-0 cursor-pointer ${
                filterTab === 'unread'
                  ? 'bg-[var(--color-canvas-hover,#f0f1f3)] text-[var(--color-canvas-ink,#171717)]'
                  : 'bg-transparent text-[var(--color-canvas-mute,#8a8f98)] hover:text-[var(--color-canvas-ink,#171717)]'
              }`}
            >
              Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
            </button>
          </div>

          {/* Notification Items List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--color-canvas-hairline,#ebebeb)]" style={{ maxHeight: '340px' }}>
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-[var(--color-canvas-mute,#8a8f98)]">
                <span className="inline-block w-5 h-5 border-2 border-[var(--color-canvas-mute,#8a8f98)] border-t-transparent rounded-full animate-spin" />
                <span className="text-[13px]">Loading notifications…</span>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
                <div className="w-10 h-10 rounded-full bg-[var(--color-canvas-hover,#f0f1f3)] flex items-center justify-center text-[var(--color-canvas-mute,#8a8f98)] mb-2.5">
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M8 2a3.5 3.5 0 00-3.5 3.5v2.2L3.3 9.7A.75.75 0 003.8 11h8.4a.75.75 0 00.5-1.3L11.5 7.7V5.5A3.5 3.5 0 008 2zM6.5 12a1.5 1.5 0 003 0"
                      stroke="currentColor"
                      strokeWidth="1.35"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <p className="text-[13px] font-medium text-[var(--color-canvas-ink,#171717)] m-0">
                  {filterTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </p>
                <p className="text-[12px] text-[var(--color-canvas-mute,#8a8f98)] m-0 mt-0.5">
                  {filterTab === 'unread' ? 'You’re all caught up!' : 'Updates and task assignments will appear here.'}
                </p>
              </div>
            ) : (
              displayedNotifications.map((item) => {
                const meta = getNotificationTypeMeta(item.type);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`group relative flex items-start gap-3 p-3 transition-colors cursor-pointer text-left ${
                      !item.read
                        ? 'bg-[var(--color-canvas-card,#ffffff)] hover:bg-[var(--color-canvas-hover,#fafafa)]'
                        : 'bg-[var(--color-canvas-subtle,#fafafa)]/60 hover:bg-[var(--color-canvas-hover,#fafafa)] opacity-90'
                    }`}
                  >
                    {/* Unread indicator bar */}
                    {!item.read && (
                      <span className="absolute left-0 top-3 bottom-3 w-[3px] bg-[#0070f3] rounded-r-full" />
                    )}

                    {/* Icon Badge */}
                    <span
                      className="shrink-0 w-7 h-7 rounded-[6px] flex items-center justify-center border mt-0.5"
                      style={{
                        color: meta.color,
                        background: meta.bg,
                        borderColor: meta.border,
                      }}
                    >
                      {meta.icon}
                    </span>

                    {/* Message Body */}
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-[12px] font-semibold text-[var(--color-canvas-ink,#171717)] truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-[var(--color-canvas-mute,#8a8f98)] shrink-0">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </div>

                      <p className="text-[12px] text-[var(--color-canvas-body,#50545c)] line-clamp-2 leading-[16px] m-0 mb-1">
                        {item.message}
                      </p>

                      {item.task && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-canvas-mute,#8a8f98)] bg-[var(--color-canvas-hover,#f0f1f3)] px-1.5 py-0.5 rounded-[4px] truncate max-w-full">
                          📋 {item.task.title}
                        </span>
                      )}
                    </div>

                    {/* Action buttons on hover */}
                    <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!item.read && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkRead(item.id, e)}
                          title="Mark as read"
                          aria-label="Mark as read"
                          className="w-5 h-5 flex items-center justify-center rounded bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-hairline,#ebebeb)] text-[var(--color-canvas-mute,#8a8f98)] hover:text-[#0070f3] hover:border-[#0070f3] cursor-pointer"
                        >
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6.5L5 9L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteNotification(item.id, e)}
                        title="Delete notification"
                        aria-label="Delete notification"
                        className="w-5 h-5 flex items-center justify-center rounded bg-[var(--color-canvas-card,#ffffff)] border border-[var(--color-canvas-hairline,#ebebeb)] text-[var(--color-canvas-mute,#8a8f98)] hover:text-[#e5484d] hover:border-[#e5484d] cursor-pointer"
                      >
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Bar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--color-canvas-hairline,#ebebeb)] bg-[var(--color-canvas-card-subtle,#fafafa)] text-[12px]">
            <button
              onClick={() => {
                setDropdownOpen(false);
                setCenterInitialTab('all');
                setCenterOpen(true);
              }}
              className="font-medium text-[var(--color-canvas-ink,#171717)] hover:text-[#0070f3] transition-colors cursor-pointer border-0 bg-transparent p-0"
            >
              View all in Notification Center →
            </button>
            <button
              onClick={() => {
                setDropdownOpen(false);
                setCenterInitialTab('preferences');
                setCenterOpen(true);
              }}
              title="Notification Settings"
              className="text-[var(--color-canvas-mute,#8a8f98)] hover:text-[var(--color-canvas-ink,#171717)] transition-colors cursor-pointer border-0 bg-transparent p-0 flex items-center gap-1"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 2.5v1M8 12.5v1M2.5 8h1M12.5 8h1M4.1 4.1l.7.7M11.2 11.2l.7.7M11.2 4.1l-.7.7M4.1 11.2l-.7.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Settings
            </button>
          </div>
        </div>
      )}

      {/* ── Full Notification Center Modal / Drawer ─────────────────────────── */}
      {centerOpen && (
        <NotificationCenter
          isOpen={centerOpen}
          initialTab={centerInitialTab}
          onClose={() => {
            setCenterOpen(false);
            fetchUnreadCount();
          }}
          onSelectTask={(taskId) => {
            setCenterOpen(false);
            if (onSelectTask) onSelectTask(taskId);
          }}
        />
      )}
    </div>
  );
}
