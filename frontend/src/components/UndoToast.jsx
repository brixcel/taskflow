import { useEffect } from 'react';

/**
 * UndoToast — Interactive notification banner for reversible Kanban moves.
 *
 * Appears when a card is dragged or moved to a new column or reordered.
 * Features:
 * - Clear action description (e.g. 'Moved "Task" to In Progress')
 * - Interactive [Undo] button
 * - Animated 6-second CSS countdown progress bar
 * - Accessible keyboard & dismiss controls
 */
export default function UndoToast({ toast, onUndo, onDismiss }) {
  useEffect(() => {
    if (!toast) return;

    const timer = setTimeout(() => {
      onDismiss?.();
    }, 6000);

    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      key={toast.id}
      role="status"
      aria-live="polite"
      className="undo-toast"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 100,
        minWidth: 320,
        maxWidth: 440,
        background: 'var(--color-canvas-card, #17181c)',
        color: 'var(--color-canvas-ink, #ffffff)',
        border: '1px solid var(--color-canvas-card-border, #2e3138)',
        borderRadius: 8,
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
        overflow: 'hidden',
        animation: 'slideUpToast 180ms ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', gap: 12 }}>
        {/* Icon & Message */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'rgba(0, 112, 243, 0.15)',
              color: '#0070f3',
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </span>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, lineHeight: '18px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {toast.message}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onUndo(toast)}
            style={{
              height: 26,
              padding: '0 10px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 4,
              border: 'none',
              background: '#0070f3',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              transition: 'background 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#0060df'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#0070f3'; }}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-canvas-mute, #888888)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress countdown line */}
      <div style={{ width: '100%', height: 2.5, background: 'rgba(255, 255, 255, 0.08)' }}>
        <div
          className="undo-toast-progress"
          style={{
            height: '100%',
            background: '#0070f3',
            animation: 'toastProgress 6s linear forwards',
          }}
        />
      </div>
    </div>
  );
}
