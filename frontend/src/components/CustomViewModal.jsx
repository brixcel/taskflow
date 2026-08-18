import { useState, useEffect } from 'react';
import {
  X,
  Check,
  Eye,
  Sliders,
  Bookmark,
  Sparkles,
  Lock,
  Globe,
  Pin,
  Kanban,
  ListTodo,
  Calendar,
  Layers,
} from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../api/config';

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

const VIEW_ICONS = ['👁️', '🔥', '⚠️', '📅', '👤', '✅', '🚀', '🎯', '⚡', '💡', '🏷️', '📌'];

export default function CustomViewModal({
  isOpen,
  onClose,
  activeFilters = {},
  editingView = null,
  userRole = 'member',
  onViewSaved,
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('👁️');
  const [color, setColor] = useState('#6366f1');
  const [viewType, setViewType] = useState('board');
  const [isShared, setIsShared] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const token = localStorage.getItem('token');
  const team = (() => {
    try {
      return JSON.parse(localStorage.getItem('team'));
    } catch {
      return null;
    }
  })();

  const isElevated = userRole === 'owner' || userRole === 'admin';

  useEffect(() => {
    if (isOpen) {
      if (editingView) {
        setName(editingView.name || '');
        setDescription(editingView.description || '');
        setIcon(editingView.icon || '👁️');
        setColor(editingView.color || '#6366f1');
        setViewType(editingView.viewType || 'board');
        setIsShared(editingView.isShared || false);
        setIsPinned(editingView.isPinned || false);
      } else {
        setName('');
        setDescription('');
        setIcon('👁️');
        setColor('#6366f1');
        setViewType('board');
        setIsShared(false);
        setIsPinned(false);
      }
      setError('');
    }
  }, [isOpen, editingView]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a name for this saved view');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        icon,
        color,
        viewType,
        filters: editingView ? editingView.filters : activeFilters,
        isShared: isElevated ? isShared : false,
        isPinned,
      };

      let res;
      if (editingView && !editingView.isPreset) {
        res = await axios.patch(`${API_URL}/views/${editingView.id}`, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Team-Id': team?.id,
          },
        });
      } else {
        res = await axios.post(`${API_URL}/views`, payload, {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Team-Id': team?.id,
          },
        });
      }

      const savedView = res.data.view;
      onViewSaved?.(savedView);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.errors?.[0]?.message || 'Failed to save view';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#1a1d21',
          border: '1px solid #2e3238',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 20px',
            borderBottom: '1px solid #2e3238',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                backgroundColor: `${color}20`,
                border: `1px solid ${color}50`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
              }}
            >
              {icon}
            </span>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#f3f4f6', margin: 0 }}>
                {editingView ? 'Edit Saved View' : 'Save as Custom View'}
              </h2>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>
                Save your active search & filter conditions for 1-click access
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSave} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          {/* View Name & Icon Preview */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#d1d5db', marginBottom: '6px' }}>
              View Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My High Priority Tasks"
                required
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#111315',
                  border: '1px solid #374151',
                  color: '#ffffff',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#d1d5db', marginBottom: '6px' }}>
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of what this view displays"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 12px',
                borderRadius: '8px',
                backgroundColor: '#111315',
                border: '1px solid #374151',
                color: '#ffffff',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          {/* Icon & Color Selector */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {/* Icon Picker */}
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#d1d5db', marginBottom: '6px' }}>
                Icon
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {VIEW_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '6px',
                      backgroundColor: icon === ic ? `${color}30` : '#111315',
                      border: icon === ic ? `1px solid ${color}` : '1px solid #374151',
                      cursor: 'pointer',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Palette */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#d1d5db', marginBottom: '6px' }}>
                Accent Color
              </label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      backgroundColor: c,
                      border: color === c ? '2px solid #ffffff' : 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Preferred View Layout */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#d1d5db', marginBottom: '6px' }}>
              Default Layout Mode
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { id: 'board', label: 'Kanban Board', icon: Kanban },
                { id: 'list', label: 'List View', icon: ListTodo },
                { id: 'calendar', label: 'Calendar', icon: Calendar },
              ].map((opt) => {
                const IconComponent = opt.icon;
                const isSelected = viewType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setViewType(opt.id)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px',
                      borderRadius: '8px',
                      backgroundColor: isSelected ? `${color}20` : '#111315',
                      border: isSelected ? `1px solid ${color}` : '1px solid #374151',
                      color: isSelected ? '#ffffff' : '#9ca3af',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    <IconComponent size={14} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sharing & Pinned Toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px', borderTop: '1px solid #2e3238' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#d1d5db',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Pin size={14} className={isPinned ? 'text-indigo-400' : 'text-gray-400'} />
                Pin to Sidebar
              </span>
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
            </label>

            {isElevated && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#d1d5db',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Globe size={14} className={isShared ? 'text-emerald-400' : 'text-gray-400'} />
                  Share with Workspace Team
                </span>
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
              </label>
            )}
          </div>

          {/* Modal Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              paddingTop: '12px',
              borderTop: '1px solid #2e3238',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              style={{ padding: '8px 14px', fontSize: '13px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ padding: '8px 18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Check size={14} />
              {loading ? 'Saving...' : editingView ? 'Update View' : 'Save View'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
