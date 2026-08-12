import { useState, useMemo, useCallback } from 'react';

// ── Date & Timezone Helpers ──────────────────────────────────────────────────
function toDateKey(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // midday local to avoid DST shifts
}

function isSameDay(d1, d2) {
  return toDateKey(d1) === toDateKey(d2);
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay(); // 0 = Sunday
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: '#e5484d', bg: 'rgba(229, 72, 77, 0.12)', border: 'rgba(229, 72, 77, 0.3)' },
  high:   { label: 'High',   color: '#f76808', bg: 'rgba(247, 104, 8, 0.12)', border: 'rgba(247, 104, 8, 0.3)' },
  medium: { label: 'Med',    color: '#0070f3', bg: 'rgba(0, 112, 243, 0.10)', border: 'rgba(0, 112, 243, 0.25)' },
  low:    { label: 'Low',    color: '#8a8f98', bg: 'rgba(138, 143, 152, 0.10)', border: 'rgba(138, 143, 152, 0.2)' },
};

export default function CalendarView({
  tasks = [],
  projects = [],
  members = [],
  currentUserId = null,
  activeProjectId = null,
  onSelectTask = () => {},
  onStatusChange = () => {},
  onTaskReschedule = () => {},
  onQuickAdd = () => {},
}) {
  // Calendar navigation state
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [calendarMode, setCalendarMode] = useState('month'); // 'month' | 'week' | 'day'
  const [showOverduePanel, setShowOverduePanel] = useState(true);

  // Local filtering state
  const [selectedProjectId, setSelectedProjectId] = useState(activeProjectId || 'all');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Drag-and-drop state
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [dragOverDateKey, setDragOverDateKey] = useState(null);

  const todayKey = toDateKey(new Date());

  // Synchronize when activeProjectId changes from props
  if (activeProjectId && selectedProjectId !== activeProjectId && selectedProjectId === 'all') {
    setSelectedProjectId(activeProjectId);
  }

  // ── Navigation actions ─────────────────────────────────────────────────────
  const goToToday = () => setCurrentDate(new Date());

  const goToPrev = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (calendarMode === 'month') {
        d.setMonth(d.getMonth() - 1);
      } else if (calendarMode === 'week') {
        d.setDate(d.getDate() - 7);
      } else {
        d.setDate(d.getDate() - 1);
      }
      return d;
    });
  };

  const goToNext = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (calendarMode === 'month') {
        d.setMonth(d.getMonth() + 1);
      } else if (calendarMode === 'week') {
        d.setDate(d.getDate() + 7);
      } else {
        d.setDate(d.getDate() + 1);
      }
      return d;
    });
  };

  // ── Filtered tasks ─────────────────────────────────────────────────────────
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Project filter
      if (selectedProjectId !== 'all') {
        if (selectedProjectId === 'unassigned') {
          if (t.projectId) return false;
        } else if (t.projectId !== selectedProjectId) {
          return false;
        }
      }

      // Assignee filter
      if (selectedAssigneeId !== 'all') {
        if (selectedAssigneeId === 'me') {
          if (t.assigneeId !== currentUserId) return false;
        } else if (selectedAssigneeId === 'unassigned') {
          if (t.assigneeId) return false;
        } else if (t.assigneeId !== selectedAssigneeId) {
          return false;
        }
      }

      // Status filter
      if (selectedStatus !== 'all') {
        if (t.status !== selectedStatus) return false;
      }

      return true;
    });
  }, [tasks, selectedProjectId, selectedAssigneeId, selectedStatus, currentUserId]);

  // Group tasks by date key
  const tasksByDate = useMemo(() => {
    const map = new Map();
    for (const task of filteredTasks) {
      if (!task.dueDate) continue;
      const key = toDateKey(task.dueDate);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(task);
    }
    return map;
  }, [filteredTasks]);

  // Overdue incomplete tasks
  const overdueTasks = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    return filteredTasks.filter((t) => {
      if (!t.dueDate || t.status === 'done') return false;
      const due = new Date(t.dueDate);
      return due < startOfToday;
    }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }, [filteredTasks]);

  // ── Drag and Drop handlers ─────────────────────────────────────────────────
  const handleDragStart = (e, taskId) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTaskId(taskId);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDragOverDateKey(null);
  };

  const handleDragOver = (e, dateKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDateKey !== dateKey) {
      setDragOverDateKey(dateKey);
    }
  };

  const handleDragLeave = (e, dateKey) => {
    if (dragOverDateKey === dateKey) {
      setDragOverDateKey(null);
    }
  };

  const handleDrop = (e, targetDateKey) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    setDraggedTaskId(null);
    setDragOverDateKey(null);

    if (!taskId || !targetDateKey) return;
    const targetDate = parseDateKey(targetDateKey);
    if (targetDate) {
      onTaskReschedule(taskId, targetDate.toISOString());
    }
  };

  // ── Title display computation ──────────────────────────────────────────────
  const headerTitle = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (calendarMode === 'month') {
      return `${MONTH_NAMES[month]} ${year}`;
    }

    if (calendarMode === 'week') {
      const dayOfWeek = currentDate.getDay();
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - dayOfWeek);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      const startMonth = MONTH_NAMES[startOfWeek.getMonth()].slice(0, 3);
      const endMonth = MONTH_NAMES[endOfWeek.getMonth()].slice(0, 3);

      if (startOfWeek.getFullYear() !== endOfWeek.getFullYear()) {
        return `${startMonth} ${startOfWeek.getDate()}, ${startOfWeek.getFullYear()} – ${endMonth} ${endOfWeek.getDate()}, ${endOfWeek.getFullYear()}`;
      }
      if (startOfWeek.getMonth() !== endOfWeek.getMonth()) {
        return `${startMonth} ${startOfWeek.getDate()} – ${endMonth} ${endOfWeek.getDate()}, ${year}`;
      }
      return `${startMonth} ${startOfWeek.getDate()} – ${endOfWeek.getDate()}, ${year}`;
    }

    // Day mode
    const dayName = DAY_NAMES_FULL[currentDate.getDay()];
    return `${dayName}, ${MONTH_NAMES[month]} ${currentDate.getDate()}, ${year}`;
  }, [currentDate, calendarMode]);

  // ── Month grid calculation ─────────────────────────────────────────────────
  const monthGridDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = getDaysInMonth(year, month);
    const firstDayIndex = getFirstDayOfMonth(year, month);

    const prevMonthDays = getDaysInMonth(year, month - 1);

    const days = [];

    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const date = new Date(year, month - 1, dayNum, 12);
      days.push({
        date,
        dayNum,
        dateKey: toDateKey(date),
        isCurrentMonth: false,
        isToday: toDateKey(date) === todayKey,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d, 12);
      days.push({
        date,
        dayNum: d,
        dateKey: toDateKey(date),
        isCurrentMonth: true,
        isToday: toDateKey(date) === todayKey,
      });
    }

    // Next month padding to fill 35 or 42 grid cells
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d, 12);
      days.push({
        date,
        dayNum: d,
        dateKey: toDateKey(date),
        isCurrentMonth: false,
        isToday: toDateKey(date) === todayKey,
      });
    }

    return days;
  }, [currentDate, todayKey]);

  // ── Week grid calculation ──────────────────────────────────────────────────
  const weekGridDays = useMemo(() => {
    const dayOfWeek = currentDate.getDay();
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - dayOfWeek);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      d.setHours(12, 0, 0, 0);
      days.push({
        date: d,
        dayName: DAY_NAMES_SHORT[i],
        dayNum: d.getDate(),
        dateKey: toDateKey(d),
        isToday: toDateKey(d) === todayKey,
      });
    }
    return days;
  }, [currentDate, todayKey]);

  return (
    <div className="calendar-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Top Header Toolbar ────────────────────────────────────────────── */}
      <div
        className="calendar-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '14px 18px',
          background: 'var(--color-canvas-card, #ffffff)',
          border: '1px solid var(--color-canvas-hairline, #e8eaec)',
          borderRadius: 8,
        }}
      >
        {/* Left: Prev, Today, Next + Month/Year title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 6, border: '1px solid var(--color-canvas-hairline, #e8eaec)' }}>
            <button
              type="button"
              onClick={goToPrev}
              className="calendar-nav-btn"
              title="Previous"
              aria-label="Previous date range"
              style={{
                padding: '6px 10px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--color-canvas-ink, #0f1011)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8.5 3.5L5 7l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <button
              type="button"
              onClick={goToToday}
              style={{
                padding: '6px 12px',
                borderLeft: '1px solid var(--color-canvas-hairline, #e8eaec)',
                borderRight: '1px solid var(--color-canvas-hairline, #e8eaec)',
                borderTop: 'none',
                borderBottom: 'none',
                background: 'transparent',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                color: 'var(--color-canvas-ink, #0f1011)',
              }}
            >
              Today
            </button>

            <button
              type="button"
              onClick={goToNext}
              className="calendar-nav-btn"
              title="Next"
              aria-label="Next date range"
              style={{
                padding: '6px 10px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--color-canvas-ink, #0f1011)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5.5 3.5L9 7l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--color-canvas-ink, #0f1011)',
              letterSpacing: '-0.02em',
              minWidth: 180,
            }}
          >
            {headerTitle}
          </h2>
        </div>

        {/* Center: Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Project Filter */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="field-input"
            style={{ height: 32, fontSize: 12, padding: '0 8px', minWidth: 130 }}
            aria-label="Filter by project"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon ? `${p.icon} ` : ''}{p.name}
              </option>
            ))}
            <option value="unassigned">No Project</option>
          </select>

          {/* Assignee Filter */}
          <select
            value={selectedAssigneeId}
            onChange={(e) => setSelectedAssigneeId(e.target.value)}
            className="field-input"
            style={{ height: 32, fontSize: 12, padding: '0 8px', minWidth: 130 }}
            aria-label="Filter by assignee"
          >
            <option value="all">All Assignees</option>
            <option value="me">Assigned to Me</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
              </option>
            ))}
            <option value="unassigned">Unassigned</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="field-input"
            style={{ height: 32, fontSize: 12, padding: '0 8px', minWidth: 110 }}
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Completed</option>
          </select>
        </div>

        {/* Right: Overdue toggle + View Mode Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {overdueTasks.length > 0 && (
            <button
              type="button"
              onClick={() => setShowOverduePanel((v) => !v)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 6,
                border: showOverduePanel ? '1px solid rgba(229, 72, 77, 0.4)' : '1px solid var(--color-canvas-hairline, #e8eaec)',
                background: showOverduePanel ? 'rgba(229, 72, 77, 0.08)' : 'transparent',
                color: '#e5484d',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Toggle overdue tasks panel"
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#e5484d',
                }}
              />
              Overdue ({overdueTasks.length})
            </button>
          )}

          {/* View Switcher: Month | Week | Day */}
          <div
            className="view-switcher-pill"
            role="radiogroup"
            aria-label="Calendar view mode"
          >
            <button
              type="button"
              onClick={() => setCalendarMode('month')}
              className={`view-switcher-btn ${calendarMode === 'month' ? 'active' : ''}`}
              aria-checked={calendarMode === 'month'}
              role="radio"
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setCalendarMode('week')}
              className={`view-switcher-btn ${calendarMode === 'week' ? 'active' : ''}`}
              aria-checked={calendarMode === 'week'}
              role="radio"
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setCalendarMode('day')}
              className={`view-switcher-btn ${calendarMode === 'day' ? 'active' : ''}`}
              aria-checked={calendarMode === 'day'}
              role="radio"
            >
              Day
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Layout: Calendar Grid + Overdue Side Panel ────────────────── */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Calendar Main Grid Area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {calendarMode === 'month' && (
            <MonthGrid
              days={monthGridDays}
              tasksByDate={tasksByDate}
              dragOverDateKey={dragOverDateKey}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onSelectTask={onSelectTask}
              onStatusChange={onStatusChange}
              onQuickAdd={onQuickAdd}
            />
          )}

          {calendarMode === 'week' && (
            <WeekGrid
              days={weekGridDays}
              tasksByDate={tasksByDate}
              dragOverDateKey={dragOverDateKey}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onSelectTask={onSelectTask}
              onStatusChange={onStatusChange}
              onQuickAdd={onQuickAdd}
            />
          )}

          {calendarMode === 'day' && (
            <DayView
              date={currentDate}
              tasks={tasksByDate.get(toDateKey(currentDate)) || []}
              onSelectTask={onSelectTask}
              onStatusChange={onStatusChange}
              onQuickAdd={onQuickAdd}
            />
          )}
        </div>

        {/* Overdue Section / Tray */}
        {showOverduePanel && overdueTasks.length > 0 && (
          <aside
            className="calendar-overdue-panel"
            style={{
              width: 280,
              flexShrink: 0,
              background: 'var(--color-canvas-card, #ffffff)',
              border: '1px solid var(--color-canvas-hairline, #e8eaec)',
              borderRadius: 8,
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              maxHeight: 'calc(100vh - 240px)',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#e5484d',
                  }}
                />
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-canvas-ink, #0f1011)' }}>
                  Overdue Tasks
                </h3>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#e5484d',
                  background: 'rgba(229, 72, 77, 0.12)',
                  padding: '2px 6px',
                  borderRadius: 10,
                }}
              >
                {overdueTasks.length}
              </span>
            </div>

            <p style={{ margin: 0, fontSize: 11, color: 'var(--color-canvas-mute, #8a8f98)', lineHeight: 1.4 }}>
              Drag any task onto a calendar date to reschedule it.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {overdueTasks.map((task) => {
                const due = new Date(task.dueDate);
                const now = new Date();
                const diffDays = Math.max(1, Math.floor((now - due) / (1000 * 60 * 60 * 24)));

                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onSelectTask(task)}
                    style={{
                      padding: '8px 10px',
                      background: 'var(--color-canvas-subtle, #f9fafa)',
                      border: '1px solid rgba(229, 72, 77, 0.25)',
                      borderRadius: 6,
                      cursor: 'grab',
                      transition: 'all 120ms ease',
                    }}
                    className="calendar-task-card"
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--color-canvas-ink, #0f1011)',
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {task.title}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#e5484d',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {diffDays}d late
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {task.project && (
                          <span
                            style={{
                              fontSize: 10,
                              padding: '1px 5px',
                              borderRadius: 3,
                              background: 'var(--color-canvas-hover, #f0f1f3)',
                              color: 'var(--color-canvas-mute, #686c75)',
                            }}
                          >
                            {task.project.icon} {task.project.name}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTaskReschedule(task.id, new Date().toISOString());
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#0070f3',
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline',
                        }}
                        title="Reschedule to Today"
                      >
                        Move to Today
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ── Month View Grid ──────────────────────────────────────────────────────────
function MonthGrid({
  days = [],
  tasksByDate,
  dragOverDateKey,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelectTask,
  onStatusChange,
  onQuickAdd,
}) {
  return (
    <div
      style={{
        background: 'var(--color-canvas-card, #ffffff)',
        border: '1px solid var(--color-canvas-hairline, #e8eaec)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Day Name Header Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: '1px solid var(--color-canvas-hairline, #e8eaec)',
          background: 'var(--color-canvas-subtle, #f9fafa)',
        }}
      >
        {DAY_NAMES_SHORT.map((name, i) => (
          <div
            key={name}
            style={{
              padding: '10px 8px',
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: i === 0 || i === 6 ? 'var(--color-canvas-mute, #8a8f98)' : 'var(--color-canvas-ink, #0f1011)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Month Days Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridAutoRows: 'minmax(115px, 1fr)',
        }}
      >
        {days.map((day) => {
          const isOver = dragOverDateKey === day.dateKey;
          const dayTasks = tasksByDate.get(day.dateKey) || [];

          return (
            <div
              key={day.dateKey}
              onDragOver={(e) => onDragOver(e, day.dateKey)}
              onDragLeave={(e) => onDragLeave(e, day.dateKey)}
              onDrop={(e) => onDrop(e, day.dateKey)}
              onClick={() => onQuickAdd(day.dateKey)}
              style={{
                borderRight: '1px solid var(--color-canvas-hairline, #e8eaec)',
                borderBottom: '1px solid var(--color-canvas-hairline, #e8eaec)',
                padding: '6px 8px',
                background: isOver
                  ? 'rgba(0, 112, 243, 0.08)'
                  : day.isToday
                  ? 'var(--color-calendar-today-bg, rgba(0, 112, 243, 0.03))'
                  : day.isCurrentMonth
                  ? 'var(--color-canvas-card, #ffffff)'
                  : 'var(--color-canvas-subtle, #fcfcfc)',
                opacity: day.isCurrentMonth ? 1 : 0.45,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                position: 'relative',
                cursor: 'pointer',
                transition: 'background-color 100ms ease',
              }}
            >
              {/* Day Number Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: day.isToday ? 700 : 500,
                    color: day.isToday
                      ? '#ffffff'
                      : day.isCurrentMonth
                      ? 'var(--color-canvas-ink, #0f1011)'
                      : 'var(--color-canvas-mute, #8a8f98)',
                    width: day.isToday ? 22 : 'auto',
                    height: day.isToday ? 22 : 'auto',
                    borderRadius: day.isToday ? '50%' : 0,
                    background: day.isToday ? '#0070f3' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {day.dayNum}
                </span>

                {dayTasks.length > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--color-canvas-mute, #8a8f98)',
                    }}
                  >
                    {dayTasks.length} {dayTasks.length === 1 ? 'task' : 'tasks'}
                  </span>
                )}
              </div>

              {/* Task Chips Container */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflowY: 'auto', maxHeight: 85 }}>
                {dayTasks.slice(0, 3).map((task) => (
                  <TaskChip
                    key={task.id}
                    task={task}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onSelectTask={onSelectTask}
                    onStatusChange={onStatusChange}
                  />
                ))}

                {dayTasks.length > 3 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: '#0070f3',
                      padding: '1px 4px',
                      cursor: 'pointer',
                    }}
                  >
                    +{dayTasks.length - 3} more…
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week View Grid ───────────────────────────────────────────────────────────
function WeekGrid({
  days = [],
  tasksByDate,
  dragOverDateKey,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onSelectTask,
  onStatusChange,
  onQuickAdd,
}) {
  return (
    <div
      style={{
        background: 'var(--color-canvas-card, #ffffff)',
        border: '1px solid var(--color-canvas-hairline, #e8eaec)',
        borderRadius: 8,
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        minHeight: 480,
      }}
    >
      {days.map((day) => {
        const isOver = dragOverDateKey === day.dateKey;
        const dayTasks = tasksByDate.get(day.dateKey) || [];

        return (
          <div
            key={day.dateKey}
            onDragOver={(e) => onDragOver(e, day.dateKey)}
            onDragLeave={(e) => onDragLeave(e, day.dateKey)}
            onDrop={(e) => onDrop(e, day.dateKey)}
            style={{
              borderRight: '1px solid var(--color-canvas-hairline, #e8eaec)',
              display: 'flex',
              flexDirection: 'column',
              background: isOver
                ? 'rgba(0, 112, 243, 0.08)'
                : day.isToday
                ? 'var(--color-calendar-today-bg, rgba(0, 112, 243, 0.03))'
                : 'transparent',
              transition: 'background-color 100ms ease',
            }}
          >
            {/* Column Day Header */}
            <div
              style={{
                padding: '12px 8px',
                textAlign: 'center',
                borderBottom: '1px solid var(--color-canvas-hairline, #e8eaec)',
                background: 'var(--color-canvas-subtle, #f9fafa)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-canvas-mute, #8a8f98)', textTransform: 'uppercase' }}>
                {day.dayName}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 16,
                  fontWeight: 700,
                  color: day.isToday ? '#ffffff' : 'var(--color-canvas-ink, #0f1011)',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: day.isToday ? '#0070f3' : 'transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: day.isToday ? '0 2px 6px rgba(0,112,243,0.3)' : 'none',
                }}
              >
                {day.dayNum}
              </div>
            </div>

            {/* Tasks Container */}
            <div
              style={{
                flex: 1,
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                overflowY: 'auto',
              }}
            >
              {dayTasks.map((task) => (
                <WeekTaskCard
                  key={task.id}
                  task={task}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onSelectTask={onSelectTask}
                  onStatusChange={onStatusChange}
                />
              ))}

              {/* Quick Add Button on Column */}
              <button
                type="button"
                onClick={() => onQuickAdd(day.dateKey)}
                style={{
                  marginTop: 'auto',
                  padding: '6px',
                  borderRadius: 4,
                  border: '1px dashed var(--color-canvas-hairline, #e8eaec)',
                  background: 'transparent',
                  color: 'var(--color-canvas-mute, #8a8f98)',
                  fontSize: 11,
                  cursor: 'pointer',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                + Add
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Day View ─────────────────────────────────────────────────────────────────
function DayView({
  date,
  tasks = [],
  onSelectTask,
  onStatusChange,
  onQuickAdd,
}) {
  const completedCount = tasks.filter((t) => t.status === 'done').length;

  return (
    <div
      style={{
        background: 'var(--color-canvas-card, #ffffff)',
        border: '1px solid var(--color-canvas-hairline, #e8eaec)',
        borderRadius: 8,
        padding: '24px',
      }}
    >
      {/* Day Overview Summary */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: '1px solid var(--color-canvas-hairline, #e8eaec)',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-canvas-ink, #0f1011)' }}>
            {DAY_NAMES_FULL[date.getDay()]} Tasks
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-canvas-mute, #8a8f98)' }}>
            {tasks.length === 0
              ? 'No tasks scheduled for this date'
              : `${completedCount} of ${tasks.length} tasks completed`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onQuickAdd(toDateKey(date))}
          className="btn-primary"
          style={{ height: 32, fontSize: 12, gap: 4 }}
        >
          <span>+</span> Add Task for Today
        </button>
      </div>

      {/* Task List */}
      {tasks.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--color-canvas-subtle, #f9fafa)',
            borderRadius: 6,
            border: '1px dashed var(--color-canvas-hairline, #e8eaec)',
          }}
        >
          <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
            Free day!
          </p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-canvas-mute, #8a8f98)' }}>
            No tasks are scheduled for this day. Click the button above to add one.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => onSelectTask(task)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 6,
                background: 'var(--color-canvas-subtle, #f9fafa)',
                border: '1px solid var(--color-canvas-hairline, #e8eaec)',
                cursor: 'pointer',
                transition: 'all 120ms ease',
              }}
              className="calendar-task-card"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Complete Checkbox */}
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onChange={(e) => {
                    e.stopPropagation();
                    onStatusChange(task.id, e.target.checked ? 'done' : 'todo');
                  }}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />

                <div>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: task.status === 'done' ? 'var(--color-canvas-mute, #8a8f98)' : 'var(--color-canvas-ink, #0f1011)',
                      textDecoration: task.status === 'done' ? 'line-through' : 'none',
                    }}
                  >
                    {task.title}
                  </span>

                  {task.description && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-canvas-mute, #8a8f98)' }}>
                      {task.description.slice(0, 80)}{task.description.length > 80 ? '…' : ''}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {task.project && (
                  <span
                    style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'var(--color-canvas-hover, #f0f1f3)',
                      color: 'var(--color-canvas-ink, #0f1011)',
                    }}
                  >
                    {task.project.icon} {task.project.name}
                  </span>
                )}

                {task.priority && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 4,
                      textTransform: 'uppercase',
                      color: PRIORITY_CONFIG[task.priority]?.color || '#8a8f98',
                      background: PRIORITY_CONFIG[task.priority]?.bg || 'rgba(138,143,152,0.1)',
                      border: `1px solid ${PRIORITY_CONFIG[task.priority]?.border || '#e8eaec'}`,
                    }}
                  >
                    {task.priority}
                  </span>
                )}

                {task.assignee && (
                  <span
                    title={task.assignee.name || task.assignee.email}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: '#0070f3',
                      color: '#ffffff',
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {(task.assignee.name || task.assignee.email)[0].toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Micro Components ─────────────────────────────────────────────────────────
function TaskChip({ task, onDragStart, onDragEnd, onSelectTask, onStatusChange }) {
  const pConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const isDone = task.status === 'done';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation();
        onSelectTask(task);
      }}
      className="calendar-chip"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 6px',
        borderRadius: 4,
        background: isDone ? 'var(--color-canvas-hover, #f0f1f3)' : 'var(--color-canvas-subtle, #f5f6f8)',
        border: `1px solid ${isDone ? 'var(--color-canvas-hairline, #e8eaec)' : pConfig.border}`,
        cursor: 'grab',
        fontSize: 11,
        color: isDone ? 'var(--color-canvas-mute, #8a8f98)' : 'var(--color-canvas-ink, #0f1011)',
        textDecoration: isDone ? 'line-through' : 'none',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}
      title={task.title}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: isDone ? '#8a8f98' : pConfig.color,
          flexShrink: 0,
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {task.title}
      </span>
    </div>
  );
}

function WeekTaskCard({ task, onDragStart, onDragEnd, onSelectTask, onStatusChange }) {
  const pConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const isDone = task.status === 'done';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation();
        onSelectTask(task);
      }}
      className="calendar-task-card"
      style={{
        padding: '8px',
        borderRadius: 6,
        background: isDone ? 'var(--color-canvas-hover, #f0f1f3)' : 'var(--color-canvas-card, #ffffff)',
        border: '1px solid var(--color-canvas-hairline, #e8eaec)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        cursor: 'grab',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <input
          type="checkbox"
          checked={isDone}
          onChange={(e) => {
            e.stopPropagation();
            onStatusChange(task.id, e.target.checked ? 'done' : 'todo');
          }}
          style={{ marginTop: 2, cursor: 'pointer' }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: isDone ? 'var(--color-canvas-mute, #8a8f98)' : 'var(--color-canvas-ink, #0f1011)',
            textDecoration: isDone ? 'line-through' : 'none',
            lineHeight: 1.3,
            flex: 1,
          }}
        >
          {task.title}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 4px',
            borderRadius: 3,
            textTransform: 'uppercase',
            color: pConfig.color,
            background: pConfig.bg,
          }}
        >
          {task.priority || 'med'}
        </span>

        {task.project && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--color-canvas-mute, #8a8f98)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 70,
            }}
          >
            {task.project.icon} {task.project.name}
          </span>
        )}

        {task.assignee && (
          <span
            title={task.assignee.name || task.assignee.email}
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#0070f3',
              color: '#ffffff',
              fontSize: 9,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {(task.assignee.name || task.assignee.email)[0].toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
