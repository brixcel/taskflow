/**
 * TaskSkeleton.jsx
 * Loading skeleton component for the task list.
 * Displays animated shimmer rows to prevent cumulative layout shift while tasks load.
 */

export function TaskSkeletonRow({ isLast }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderBottom: isLast ? 'none' : '1px solid var(--color-canvas-hairline, #ebebeb)',
        background: 'var(--color-canvas-card, #fff)',
      }}
      aria-hidden="true"
    >
      {/* Circle placeholder */}
      <div
        className="skeleton"
        style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0 }}
      />

      {/* Text block placeholder */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          className="skeleton"
          style={{ width: '45%', height: 14, borderRadius: 4 }}
        />
        <div
          className="skeleton"
          style={{ width: '70%', height: 11, borderRadius: 4 }}
        />
      </div>

      {/* Right meta placeholders */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Date placeholder */}
        <div
          className="skeleton"
          style={{ width: 50, height: 12, borderRadius: 3 }}
        />
        {/* Avatar placeholder */}
        <div
          className="skeleton"
          style={{ width: 24, height: 24, borderRadius: '50%' }}
        />
        {/* Badge placeholder */}
        <div
          className="skeleton"
          style={{ width: 60, height: 22, borderRadius: 4 }}
        />
      </div>
    </div>
  );
}

export default function TaskSkeleton({ count = 3 }) {
  return (
    <div
      style={{
        background: 'var(--color-canvas-card, #fff)',
        border: '1px solid var(--color-canvas-hairline, #ebebeb)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
      aria-label="Loading tasks..."
      role="status"
    >
      {Array.from({ length: count }).map((_, i) => (
        <TaskSkeletonRow key={i} isLast={i === count - 1} />
      ))}
      <span className="sr-only">Loading tasks...</span>
    </div>
  );
}
