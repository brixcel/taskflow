import { useState } from 'react';

function formatDueDate(dueDateStr) {
  if (!dueDateStr) return null;
  const d = new Date(dueDateStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isOverdue(dueDateStr, status) {
  if (!dueDateStr || status === 'done') return false;
  const d = new Date(dueDateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const endOfDueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return endOfDueDay < now;
}

function PriorityBadge({ priority }) {
  const p = priority?.toLowerCase() || 'medium';

  const config = {
    urgent: { label: 'Urgent', color: '#e5484d', bg: 'rgba(229, 72, 77, 0.12)', border: 'rgba(229, 72, 77, 0.3)' },
    high:   { label: 'High',   color: '#f76808', bg: 'rgba(247, 104, 8, 0.12)', border: 'rgba(247, 104, 8, 0.3)' },
    medium: { label: 'Medium', color: '#0070f3', bg: 'rgba(0, 112, 243, 0.10)', border: 'rgba(0, 112, 243, 0.25)' },
    low:    { label: 'Low',    color: '#8a8f98', bg: 'rgba(138, 143, 152, 0.10)', border: 'rgba(138, 143, 152, 0.2)' },
  }[p] || { label: 'Medium', color: '#0070f3', bg: 'rgba(0, 112, 243, 0.10)', border: 'rgba(0, 112, 243, 0.25)' };

  return (
    <span
      className={`priority-badge priority-${p}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: 10.5,
        fontWeight: 600,
        color: config.color,
        background: config.bg,
        border: `1px solid ${config.border}`,
        lineHeight: 1,
        letterSpacing: '0.01em',
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: config.color,
        }}
      />
      {config.label}
    </span>
  );
}

function AssigneeAvatar({ name }) {
  if (!name) return null;
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span
      title={`Assigned to ${name}`}
      aria-label={`Assigned to ${name}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: 'var(--color-canvas-hover, #f0f1f3)',
        border: '1px solid var(--color-canvas-hairline, #e8eaec)',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--color-canvas-ink, #0f1011)',
        fontFamily: "'JetBrains Mono', monospace",
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

export default function KanbanCard({
  task,
  onSelect,
  onStatusChange,
  onDelete,
  isDragging,
  onDragStart,
  onDragEnd,
}) {
  const [hovered, setHovered] = useState(false);
  const formattedDate = formatDueDate(task.dueDate);
  const overdue = isOverdue(task.dueDate, task.status);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`kanban-card ${isDragging ? 'dragging' : ''}`}
      style={{
        background: 'var(--color-canvas-card, #ffffff)',
        border: '1px solid var(--color-canvas-card-border, #ebebeb)',
        borderRadius: 8,
        padding: '12px 14px',
        marginBottom: 8,
        cursor: 'grab',
        boxShadow: hovered
          ? '0 4px 12px rgba(0, 0, 0, 0.08)'
          : '0 1px 3px rgba(0, 0, 0, 0.02)',
        opacity: isDragging ? 0.35 : 1,
        transform: isDragging ? 'scale(0.98)' : 'none',
        transition: 'box-shadow 120ms ease, border-color 120ms ease, opacity 120ms ease, transform 120ms ease',
        position: 'relative',
      }}
    >
      {/* Top row: Priority & Quick Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 6 }}>
        <PriorityBadge priority={task.priority} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: hovered ? 1 : 0.6, transition: 'opacity 120ms' }}>
          {/* Quick status dropdown */}
          <select
            value={task.status}
            onChange={(e) => {
              e.stopPropagation();
              onStatusChange(task.id, e.target.value);
            }}
            aria-label={`Change status of ${task.title}`}
            style={{
              height: 20,
              padding: '0 4px',
              fontSize: 10,
              fontWeight: 500,
              borderRadius: 3,
              border: '1px solid var(--color-canvas-hairline, #ebebeb)',
              background: 'var(--color-canvas-subtle, #fafafa)',
              color: 'var(--color-canvas-body, #4d4d4d)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
          </select>

          {/* Delete action */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(task.id);
            }}
            title="Delete task"
            aria-label={`Delete task ${task.title}`}
            style={{
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'transparent',
              color: hovered ? 'var(--color-canvas-mute, #888888)' : 'transparent',
              cursor: 'pointer',
              borderRadius: 3,
              transition: 'color 120ms, background 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#c50000'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-canvas-mute, #888888)'; }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Task Content - clickable to open drawer */}
      <div
        onClick={() => onSelect?.(task)}
        style={{ cursor: 'pointer' }}
        title="View details & comments"
      >
        <p
          style={{
            margin: '0 0 4px',
            fontSize: 13.5,
            fontWeight: 500,
            lineHeight: '18px',
            color: task.status === 'done' ? 'var(--color-canvas-mute, #888888)' : 'var(--color-canvas-ink, #0f1011)',
            textDecoration: task.status === 'done' ? 'line-through' : 'none',
            letterSpacing: '-0.01em',
            wordBreak: 'break-word',
          }}
        >
          {task.title}
        </p>

        {task.description && (
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 12,
              color: 'var(--color-canvas-mute, #8a8f98)',
              lineHeight: '16px',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {task.description}
          </p>
        )}
      </div>

      {/* Labels row */}
      {Array.isArray(task.labels) && task.labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {task.labels.map((label, idx) => (
            <span
              key={idx}
              className="label-chip"
              style={{
                fontSize: 10,
                fontWeight: 500,
                padding: '1px 6px',
                borderRadius: 4,
                background: 'var(--color-canvas-subtle, #f5f6f8)',
                color: 'var(--color-canvas-body, #4d4d4d)',
                border: '1px solid var(--color-canvas-hairline, #e8eaec)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              #{label}
            </span>
          ))}
        </div>
      )}

      {/* Bottom row: Due Date + Assignee Avatar + Details Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--color-canvas-hairline, #f0f1f3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {formattedDate ? (
            <span
              className={`badge ${overdue ? 'badge-overdue' : ''}`}
              title={overdue ? `Overdue (${formattedDate})` : `Due ${formattedDate}`}
              style={{
                fontSize: 10.5,
                padding: '2px 5px',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 500,
              }}
            >
              {overdue ? '⚠ Overdue' : formattedDate}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--color-canvas-mute, #a1a1a1)' }}>—</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AssigneeAvatar name={task.assignee?.name} />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(task);
            }}
            aria-label={`Open details for ${task.title}`}
            className="btn-secondary"
            style={{
              height: 20,
              padding: '0 6px',
              fontSize: 10.5,
              fontWeight: 500,
              borderRadius: 3,
            }}
          >
            Details
          </button>
        </div>
      </div>
    </div>
  );
}
