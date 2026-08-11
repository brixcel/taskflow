import { useState, useEffect } from 'react';
import { API_BASE } from '../api/config';

const COLOR_PRESETS = [
  '#6366f1', // Indigo
  '#3b82f6', // Blue
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#ec4899', // Pink
  '#8b5cf6', // Violet
];

const ICON_PRESETS = ['📁', '🚀', '⚡', '🎨', '🛠️', '📊', '🎯', '💡', '🛡️', '🌐', '📦', '✨'];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: '#3b82f6' },
  { value: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { value: 'planning', label: 'Planning', color: '#8b5cf6' },
  { value: 'completed', label: 'Completed', color: '#10b981' },
  { value: 'on_hold', label: 'On Hold', color: '#6b7280' },
  { value: 'archived', label: 'Archived', color: '#4b5563' },
];

export default function ProjectModal({
  isOpen,
  onClose,
  project = null, // null for create, project object for edit
  teamId,
  token,
  teamMembers = [],
  onProjectSaved,
  onProjectDeleted,
}) {
  const isEdit = Boolean(project && project.id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📁');
  const [color, setColor] = useState('#6366f1');
  const [status, setStatus] = useState('active');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [isArchived, setIsArchived] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTasksAlso, setDeleteTasksAlso] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (project) {
        setName(project.name || '');
        setDescription(project.description || '');
        setIcon(project.icon || '📁');
        setColor(project.color || '#6366f1');
        setStatus(project.status || 'active');
        setStartDate(project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : '');
        setTargetDate(project.targetDate ? new Date(project.targetDate).toISOString().split('T')[0] : '');
        setSelectedMemberIds(project.members ? project.members.map((m) => m.userId) : []);
        setIsArchived(Boolean(project.isArchived));
      } else {
        setName('');
        setDescription('');
        setIcon('📁');
        setColor('#6366f1');
        setStatus('active');
        setStartDate('');
        setTargetDate('');
        setSelectedMemberIds([]);
        setIsArchived(false);
      }
      setError('');
      setShowDeleteConfirm(false);
    }
  }, [isOpen, project]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const url = isEdit ? `${API_BASE}/projects/${project.id}` : `${API_BASE}/projects`;
      const method = isEdit ? 'PATCH' : 'POST';

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        icon,
        color,
        status,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        targetDate: targetDate ? new Date(targetDate).toISOString() : null,
      };

      if (!isEdit) {
        payload.memberIds = selectedMemberIds;
      } else {
        payload.isArchived = isArchived;
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || (data.errors && data.errors[0]?.message) || 'Failed to save project');
      }

      onProjectSaved(data.project);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!project?.id) return;
    setLoading(true);
    setError('');

    try {
      const query = deleteTasksAlso ? '?deleteTasks=true' : '';
      const res = await fetch(`${API_BASE}/projects/${project.id}${query}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete project');
      }

      if (onProjectDeleted) {
        onProjectDeleted(project.id);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (memberId) => {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-modal-backdrop, rgba(0, 0, 0, 0.5))',
        backdropFilter: 'blur(4px)',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          backgroundColor: 'var(--color-modal-bg, #ffffff)',
          border: '1px solid var(--color-modal-border, #ebebeb)',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-canvas-card-subtle, #fafafa)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {icon}
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
                {isEdit ? 'Edit Project' : 'Create New Project'}
              </h2>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-canvas-mute, #8a8f98)' }}>
                {isEdit ? 'Update project settings and members' : 'Organize tasks into a dedicated workspace'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-canvas-mute, #8a8f98)',
              padding: 6,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close modal"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content / Form */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px', flex: 1 }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'var(--color-banner-error-bg, #f7d4d6)',
                color: 'var(--color-banner-error-fg, #c50000)',
                fontSize: 13,
                marginBottom: 16,
                border: '1px solid var(--color-banner-error-border, rgba(238, 0, 0, 0.25))',
              }}
            >
              {error}
            </div>
          )}

          {/* Icon & Color Selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-ink, #0f1011)', marginBottom: 8 }}>
              Icon & Theme Color
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {ICON_PRESETS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    border: icon === ic ? `2px solid ${color}` : '1px solid var(--color-canvas-hairline, #ebebeb)',
                    background: icon === ic ? 'var(--color-canvas-hover, #f0f1f3)' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {COLOR_PRESETS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setColor(col)}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    backgroundColor: col,
                    border: color === col ? '2px solid var(--color-canvas-ink, #0f1011)' : '2px solid transparent',
                    cursor: 'pointer',
                    outlineOffset: 2,
                    boxShadow: color === col ? '0 0 0 2px var(--color-canvas-main, #ffffff)' : 'none',
                  }}
                  title={col}
                />
              ))}
            </div>
          </div>

          {/* Project Name */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-ink, #0f1011)', marginBottom: 6 }}>
              Project Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Website Redesign, Mobile App v2, Marketing Launch"
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-input-border, #ebebeb)',
                background: 'var(--color-input-bg, #ffffff)',
                color: 'var(--color-input-text, #171717)',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-ink, #0f1011)', marginBottom: 6 }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe goals, milestones, or deliverables..."
              rows={3}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-input-border, #ebebeb)',
                background: 'var(--color-input-bg, #ffffff)',
                color: 'var(--color-input-text, #171717)',
                fontSize: 13,
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Status & Dates Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-ink, #0f1011)', marginBottom: 6 }}>
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--color-input-border, #ebebeb)',
                  background: 'var(--color-input-bg, #ffffff)',
                  color: 'var(--color-input-text, #171717)',
                  fontSize: 13,
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-ink, #0f1011)', marginBottom: 6 }}>
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--color-input-border, #ebebeb)',
                  background: 'var(--color-input-bg, #ffffff)',
                  color: 'var(--color-input-text, #171717)',
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-ink, #0f1011)', marginBottom: 6 }}>
                Target Date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--color-input-border, #ebebeb)',
                  background: 'var(--color-input-bg, #ffffff)',
                  color: 'var(--color-input-text, #171717)',
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Members assignment */}
          {!isEdit && teamMembers.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--color-canvas-ink, #0f1011)', marginBottom: 6 }}>
                Initial Team Members
              </label>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  maxHeight: 120,
                  overflowY: 'auto',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                  background: 'var(--color-canvas-subtle, #f9fafa)',
                }}
              >
                {teamMembers.map((m) => {
                  const isSelected = selectedMemberIds.includes(m.userId || m.id);
                  return (
                    <button
                      key={m.userId || m.id}
                      type="button"
                      onClick={() => toggleMember(m.userId || m.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 500,
                        border: isSelected ? '1px solid #3b82f6' : '1px solid var(--color-canvas-hairline, #ebebeb)',
                        background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'var(--color-canvas-main, #ffffff)',
                        color: isSelected ? '#2563eb' : 'var(--color-canvas-body, #4d4d4d)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>{m.user?.name || m.name || m.email}</span>
                      {isSelected && <span>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Archive Toggle (Edit mode only) */}
          {isEdit && (
            <div style={{ padding: '12px 0', borderTop: '1px solid var(--color-canvas-hairline, #ebebeb)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isArchived}
                  onChange={(e) => setIsArchived(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-canvas-ink, #0f1011)' }}>
                    Archive this project
                  </span>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--color-canvas-mute, #8a8f98)' }}>
                    Archived projects are hidden from sidebar and standard views.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Delete Danger Section */}
          {isEdit && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-canvas-hairline, #ebebeb)' }}>
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    padding: '6px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Delete Project...
                </button>
              ) : (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    background: 'var(--color-banner-error-bg, #f7d4d6)',
                    border: '1px solid var(--color-banner-error-border, rgba(238, 0, 0, 0.25))',
                  }}
                >
                  <p style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 600, color: '#c50000' }}>
                    Are you sure you want to delete this project?
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4b5563', marginBottom: 12 }}>
                    <input
                      type="checkbox"
                      checked={deleteTasksAlso}
                      onChange={(e) => setDeleteTasksAlso(e.target.checked)}
                    />
                    Also delete all tasks in this project (unchecked will keep tasks unassigned)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={loading}
                      style={{
                        padding: '6px 14px',
                        background: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {loading ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px solid #9ca3af',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid var(--color-canvas-hairline, #ebebeb)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid var(--color-btn-secondary-border, #ebebeb)',
                background: 'var(--color-btn-secondary-bg, #ffffff)',
                color: 'var(--color-btn-secondary-fg, #171717)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 20px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--color-btn-primary-bg, #171717)',
                color: 'var(--color-btn-primary-fg, #ffffff)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              }}
            >
              {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
