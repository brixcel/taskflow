import { useState } from 'react';
import KanbanCard from './KanbanCard';

const COLUMNS = [
  { id: 'todo',        label: 'Todo',        color: '#8a8f98', bg: 'rgba(138, 143, 152, 0.12)' },
  { id: 'in_progress', label: 'In Progress', color: '#f76808', bg: 'rgba(247, 104, 8, 0.12)' },
  { id: 'done',        label: 'Done',        color: '#0070f3', bg: 'rgba(0, 112, 243, 0.12)' },
];

export default function KanbanBoard({
  tasks = [],
  onTaskMove,
  onSelectTask,
  onStatusChange,
  onDeleteTask,
  onQuickAdd,
}) {
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [dropIndex,   setDropIndex]   = useState(null);

  // Group tasks by column and sort by order ascending
  const columnTasks = {
    todo:        tasks.filter(t => t.status === 'todo').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    in_progress: tasks.filter(t => t.status === 'in_progress').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    done:        tasks.filter(t => t.status === 'done').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  };

  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverCol(null);
    setDropIndex(null);
  };

  const handleDragOverColumn = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colId) {
      setDragOverCol(colId);
    }
  };

  const handleCardDragOver = (e, colId, index) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const targetIdx = e.clientY > midY ? index + 1 : index;

    setDragOverCol(colId);
    setDropIndex(targetIdx);
  };

  const calculateNewOrder = (colId, targetIdx, currentTask) => {
    const list = columnTasks[colId].filter(t => t.id !== currentTask.id);

    if (list.length === 0) {
      return 1000;
    }

    if (targetIdx <= 0) {
      const firstOrder = list[0].order ?? 1000;
      return firstOrder > 1 ? firstOrder / 2 : firstOrder - 1000;
    }

    if (targetIdx >= list.length) {
      const lastOrder = list[list.length - 1].order ?? 1000;
      return lastOrder + 1000;
    }

    const prevOrder = list[targetIdx - 1].order ?? 0;
    const nextOrder = list[targetIdx].order ?? prevOrder + 2000;
    return (prevOrder + nextOrder) / 2;
  };

  const handleDrop = (e, colId) => {
    e.preventDefault();
    if (!draggedTask) return;

    const targetIdx = dropIndex != null ? dropIndex : columnTasks[colId].length;
    const newOrder = calculateNewOrder(colId, targetIdx, draggedTask);

    const previousState = {
      id: draggedTask.id,
      status: draggedTask.status,
      order: draggedTask.order,
      title: draggedTask.title,
    };

    onTaskMove(draggedTask.id, {
      status: colId,
      order: newOrder,
      previousState,
    });

    setDraggedTask(null);
    setDragOverCol(null);
    setDropIndex(null);
  };

  return (
    <div
      className="kanban-board"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
        gap: 16,
        alignItems: 'start',
        width: '100%',
      }}
    >
      {COLUMNS.map((col) => {
        const colList = columnTasks[col.id] || [];
        const isColumnOver = dragOverCol === col.id;

        return (
          <div
            key={col.id}
            onDragOver={(e) => handleDragOverColumn(e, col.id)}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`kanban-column ${isColumnOver ? 'drag-over' : ''}`}
            style={{
              background: 'var(--color-canvas-subtle, #f9fafa)',
              border: `1px solid ${isColumnOver ? 'var(--color-input-focus-border, #0070f3)' : 'var(--color-canvas-hairline, #ebebeb)'}`,
              borderRadius: 10,
              padding: '12px 10px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 480,
              transition: 'border-color 120ms ease, background-color 120ms ease',
            }}
          >
            {/* Column Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 6px 12px',
                borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)',
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: col.color,
                  }}
                />
                <h3
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: 'var(--color-canvas-ink, #0f1011)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {col.label}
                </h3>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 999,
                    background: 'var(--color-canvas-card, #ffffff)',
                    border: '1px solid var(--color-canvas-hairline, #e8eaec)',
                    color: 'var(--color-canvas-body, #4d4d4d)',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {colList.length}
                </span>
              </div>

              {/* Quick Add button on column header */}
              <button
                type="button"
                onClick={() => onQuickAdd?.(col.id)}
                title={`Add task to ${col.label}`}
                aria-label={`Add task to ${col.label}`}
                className="btn-secondary"
                style={{
                  width: 24,
                  height: 24,
                  padding: 0,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M7 2.5V11.5M2.5 7H11.5" />
                </svg>
              </button>
            </div>

            {/* Column Cards Container */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 120,
              }}
            >
              {colList.length === 0 ? (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '32px 16px',
                    border: '1px dashed var(--color-canvas-hairline, #e8eaec)',
                    borderRadius: 6,
                    color: 'var(--color-canvas-mute, #888888)',
                    textAlign: 'center',
                    gap: 6,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>
                    No tasks in {col.label}
                  </p>
                  <button
                    type="button"
                    onClick={() => onQuickAdd?.(col.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      fontSize: 11.5,
                      color: '#0070f3',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    + Add a task
                  </button>
                </div>
              ) : (
                colList.map((task, idx) => {
                  const showIndicatorAbove = isColumnOver && dropIndex === idx;
                  const showIndicatorBelow = isColumnOver && dropIndex === idx + 1 && idx === colList.length - 1;

                  return (
                    <div
                      key={task.id}
                      onDragOver={(e) => handleCardDragOver(e, col.id, idx)}
                    >
                      {showIndicatorAbove && (
                        <div
                          className="kanban-drop-indicator"
                          style={{
                            height: 3,
                            background: '#0070f3',
                            borderRadius: 2,
                            margin: '4px 0',
                            boxShadow: '0 0 6px rgba(0, 112, 243, 0.5)',
                          }}
                        />
                      )}

                      <KanbanCard
                        task={task}
                        isDragging={draggedTask?.id === task.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onSelect={onSelectTask}
                        onStatusChange={onStatusChange}
                        onDelete={onDeleteTask}
                      />

                      {showIndicatorBelow && (
                        <div
                          className="kanban-drop-indicator"
                          style={{
                            height: 3,
                            background: '#0070f3',
                            borderRadius: 2,
                            margin: '4px 0',
                            boxShadow: '0 0 6px rgba(0, 112, 243, 0.5)',
                          }}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
