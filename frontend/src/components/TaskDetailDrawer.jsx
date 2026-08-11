import { useState, useEffect, useRef } from 'react';
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

function formatShortDate(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isSubtaskOverdue(dueDateStr, completed) {
  if (!dueDateStr || completed) return false;
  const d = new Date(dueDateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return endOfDay < now;
}

function UserAvatar({ name, size = 26 }) {
  const initials = (name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span
      title={name}
      aria-label={name}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%',
        background: 'var(--color-canvas-hover, #f0f1f3)', border: '1px solid var(--color-canvas-hairline, #e8eaec)',
        fontSize: size <= 20 ? 8.5 : size <= 22 ? 9.5 : 10.5, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)',
        fontFamily: "'JetBrains Mono', monospace", flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

function getActivityIcon(action) {
  switch (action) {
    case 'created':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0070f3" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
      );
    case 'status_changed':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f76808" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      );
    case 'priority_changed':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e5484d" strokeWidth="2.5" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
      );
    case 'subtask_created':
    case 'subtask_updated':
    case 'subtask_assigned':
    case 'subtask_due_date_changed':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0070f3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
      );
    case 'subtask_completed':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      );
    case 'subtask_deleted':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e5484d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      );
    case 'watched':
    case 'unwatched':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8a8f98" strokeWidth="2.5" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
      );
    case 'commented':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0070f3" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      );
    default:
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="3" /></svg>
      );
  }
}

function buildSubtaskTree(flatList = []) {
  const map = new Map();
  const roots = [];
  flatList.forEach(item => {
    map.set(item.id, { ...item, children: [] });
  });
  flatList.forEach(item => {
    const node = map.get(item.id);
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export default function TaskDetailDrawer({
  task: initialTask,
  headers,
  members = [],
  currentUserId,
  userRole,
  isEditRequested = false,
  onClose,
  onTaskUpdated,
  onStatusChange,
  onDelete,
}) {
  const [task,         setTask]         = useState(initialTask);
  const [loading,      setLoading]      = useState(true);
  const [comments,     setComments]     = useState([]);
  const [subtasks,     setSubtasks]     = useState(initialTask?.subtasks || []);
  const [activities,   setActivities]   = useState([]);
  const [watchers,     setWatchers]     = useState([]);
  const [activeTab,    setActiveTab]    = useState('comments'); // 'comments' | 'activity'
  const [newComment,   setNewComment]   = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState('');
  const [copySuccess,  setCopySuccess]  = useState(false);

  // Inline editing state
  const [isEditingTitle, setIsEditingTitle] = useState(isEditRequested);
  const [titleDraft,     setTitleDraft]     = useState(initialTask?.title || '');
  const [isEditingDesc,  setIsEditingDesc]  = useState(false);
  const [descDraft,      setDescDraft]      = useState(initialTask?.description || '');
  const [newLabelInput,  setNewLabelInput]  = useState('');
  const [showAddLabel,   setShowAddLabel]   = useState(false);

  // Subtasks State
  const [subtaskDraft,        setSubtaskDraft]        = useState('');
  const [subtaskAssignee,     setSubtaskAssignee]     = useState('');
  const [subtaskDueDate,      setSubtaskDueDate]      = useState('');
  const [showSubtaskOptions,  setShowSubtaskOptions]  = useState(false);
  const [addingNestedToId,    setAddingNestedToId]    = useState(null);
  const [nestedDraft,         setNestedDraft]         = useState('');
  const [nestedAssignee,      setNestedAssignee]      = useState('');
  const [nestedDueDate,       setNestedDueDate]       = useState('');
  const [subtaskFilter,       setSubtaskFilter]       = useState('all'); // 'all' | 'incomplete'
  const [collapsedParents,    setCollapsedParents]    = useState({});
  const [editingSubtaskId,    setEditingSubtaskId]    = useState(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const [isSubtaskSubmitting, setIsSubtaskSubmitting] = useState(false);

  // Comment edit state
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [commentDraft,     setCommentDraft]     = useState('');

  const titleInputRef = useRef(null);
  const subtaskInputRef = useRef(null);

  // Fetch full task graph
  const reloadTaskDetails = async () => {
    if (!initialTask?.id) return;
    try {
      const res = await axios.get(`${API}/tasks/${initialTask.id}`, { headers });
      if (res.data?.task) {
        setTask(res.data.task);
        setTitleDraft(res.data.task.title || '');
        setDescDraft(res.data.task.description || '');
        setComments(res.data.task.comments || []);
        setSubtasks(res.data.task.subtasks || []);
        setActivities(res.data.task.activities || []);
        setWatchers(res.data.task.watchers?.map(w => w.user) || []);
      }
    } catch {
      /* non-fatal */
    }
  };

  useEffect(() => {
    let active = true;
    const fetchGraph = async () => {
      if (!initialTask?.id) return;
      try {
        const res = await axios.get(`${API}/tasks/${initialTask.id}`, { headers });
        if (active && res.data?.task) {
          setTask(res.data.task);
          setTitleDraft(res.data.task.title || '');
          setDescDraft(res.data.task.description || '');
          setComments(res.data.task.comments || []);
          setSubtasks(res.data.task.subtasks || []);
          setActivities(res.data.task.activities || []);
          setWatchers(res.data.task.watchers?.map(w => w.user) || []);
        }
      } catch {
        /* non-fatal */
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchGraph();
    return () => { active = false; };
  }, [initialTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isEditRequested) {
      const timer = setTimeout(() => setIsEditingTitle(true), 10);
      return () => clearTimeout(timer);
    }
  }, [isEditRequested]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const isWatching = watchers.some(w => w.id === currentUserId);
  const canDelete  = task?.createdById === currentUserId || ['admin', 'owner'].includes(userRole);

  // Save Title
  const handleSaveTitle = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === task.title) {
      setIsEditingTitle(false);
      setTitleDraft(task.title);
      return;
    }
    try {
      const res = await axios.patch(`${API}/tasks/${task.id}`, { title: trimmed }, { headers });
      setTask(prev => ({ ...prev, ...res.data.task }));
      onTaskUpdated?.(res.data.task);
      reloadTaskDetails();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update title.');
    } finally {
      setIsEditingTitle(false);
    }
  };

  // Save Description
  const handleSaveDesc = async () => {
    try {
      const res = await axios.patch(`${API}/tasks/${task.id}`, { description: descDraft.trim() || null }, { headers });
      setTask(prev => ({ ...prev, ...res.data.task }));
      onTaskUpdated?.(res.data.task);
      reloadTaskDetails();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update description.');
    } finally {
      setIsEditingDesc(false);
    }
  };

  // Save Priority
  const handlePriorityChange = async (newPriority) => {
    try {
      const res = await axios.patch(`${API}/tasks/${task.id}`, { priority: newPriority }, { headers });
      setTask(prev => ({ ...prev, priority: newPriority }));
      onTaskUpdated?.(res.data.task);
      reloadTaskDetails();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update priority.');
    }
  };

  // Save Assignee
  const handleAssigneeChange = async (newAssigneeId) => {
    try {
      const res = await axios.patch(`${API}/tasks/${task.id}`, { assigneeId: newAssigneeId || null }, { headers });
      setTask(prev => ({ ...prev, ...res.data.task }));
      onTaskUpdated?.(res.data.task);
      reloadTaskDetails();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update assignee.');
    }
  };

  // Save Due Date
  const handleDueDateChange = async (newDueDate) => {
    try {
      const res = await axios.patch(`${API}/tasks/${task.id}`, { dueDate: newDueDate || null }, { headers });
      setTask(prev => ({ ...prev, ...res.data.task }));
      onTaskUpdated?.(res.data.task);
      reloadTaskDetails();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update due date.');
    }
  };

  // Add / Remove Labels
  const handleAddLabel = async () => {
    const lbl = newLabelInput.trim();
    if (!lbl) { setShowAddLabel(false); return; }
    const currentLabels = task.labels || [];
    if (currentLabels.includes(lbl)) { setNewLabelInput(''); setShowAddLabel(false); return; }
    const updated = [...currentLabels, lbl];
    try {
      const res = await axios.patch(`${API}/tasks/${task.id}`, { labels: updated }, { headers });
      setTask(prev => ({ ...prev, labels: updated }));
      onTaskUpdated?.(res.data.task);
      setNewLabelInput('');
      setShowAddLabel(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add label.');
    }
  };

  const handleRemoveLabel = async (labelToRemove) => {
    const updated = (task.labels || []).filter(l => l !== labelToRemove);
    try {
      const res = await axios.patch(`${API}/tasks/${task.id}`, { labels: updated }, { headers });
      setTask(prev => ({ ...prev, labels: updated }));
      onTaskUpdated?.(res.data.task);
    } catch {
      setError('Failed to remove label.');
    }
  };

  // ─── Subtasks CRUD Handlers ─────────────────────────────────────────────────

  const handleCreateSubtask = async (e, parentId = null) => {
    e?.preventDefault();
    const rawTitle = parentId ? nestedDraft : subtaskDraft;
    const title = rawTitle.trim();
    if (!title || isSubtaskSubmitting) return;

    setIsSubtaskSubmitting(true);
    setError('');

    const payload = {
      title,
      assigneeId: parentId ? (nestedAssignee || null) : (subtaskAssignee || null),
      dueDate: parentId ? (nestedDueDate || null) : (subtaskDueDate || null),
      parentId: parentId || null,
    };

    try {
      const res = await axios.post(`${API}/tasks/${task.id}/subtasks`, payload, { headers });
      const created = res.data.subtask;

      setSubtasks(prev => [...prev, created]);
      setTask(prev => ({
        ...prev,
        subtasks: [...(prev.subtasks || []), created],
      }));
      onTaskUpdated?.({
        ...task,
        subtasks: [...(subtasks || []), created],
      });

      if (parentId) {
        setNestedDraft('');
        setNestedAssignee('');
        setNestedDueDate('');
        setAddingNestedToId(null);
      } else {
        setSubtaskDraft('');
        setSubtaskAssignee('');
        setSubtaskDueDate('');
        setShowSubtaskOptions(false);
      }
      reloadTaskDetails();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add subtask.');
    } finally {
      setIsSubtaskSubmitting(false);
    }
  };

  const handleToggleSubtask = async (subtaskId) => {
    const target = subtasks.find(s => s.id === subtaskId);
    if (!target) return;
    const nextCompleted = !target.completed;

    // Optimistic UI update
    setSubtasks(prev => prev.map(s => s.id === subtaskId ? { ...s, completed: nextCompleted } : s));
    setTask(prev => ({
      ...prev,
      subtasks: (prev.subtasks || []).map(s => s.id === subtaskId ? { ...s, completed: nextCompleted } : s),
    }));

    try {
      const res = await axios.patch(`${API}/subtasks/${subtaskId}`, { completed: nextCompleted }, { headers });
      const updated = res.data.subtask;
      setSubtasks(prev => prev.map(s => s.id === subtaskId ? updated : s));
      onTaskUpdated?.({
        ...task,
        subtasks: subtasks.map(s => s.id === subtaskId ? updated : s),
      });
      reloadTaskDetails();
    } catch (err) {
      // Revert on error
      setSubtasks(prev => prev.map(s => s.id === subtaskId ? target : s));
      setError(err.response?.data?.error || 'Failed to update subtask status.');
    }
  };

  const handleSaveSubtaskTitle = async (subtaskId) => {
    const trimmed = editingSubtaskTitle.trim();
    if (!trimmed) {
      setEditingSubtaskId(null);
      return;
    }

    try {
      const res = await axios.patch(`${API}/subtasks/${subtaskId}`, { title: trimmed }, { headers });
      setSubtasks(prev => prev.map(s => s.id === subtaskId ? res.data.subtask : s));
      setEditingSubtaskId(null);
      setEditingSubtaskTitle('');
      reloadTaskDetails();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to rename subtask.');
    }
  };

  const handleUpdateSubtaskAssignee = async (subtaskId, newAssigneeId) => {
    try {
      const res = await axios.patch(`${API}/subtasks/${subtaskId}`, { assigneeId: newAssigneeId || null }, { headers });
      setSubtasks(prev => prev.map(s => s.id === subtaskId ? res.data.subtask : s));
      reloadTaskDetails();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reassign subtask.');
    }
  };

  const handleUpdateSubtaskDueDate = async (subtaskId, newDueDate) => {
    try {
      const res = await axios.patch(`${API}/subtasks/${subtaskId}`, { dueDate: newDueDate || null }, { headers });
      setSubtasks(prev => prev.map(s => s.id === subtaskId ? res.data.subtask : s));
      reloadTaskDetails();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update subtask due date.');
    }
  };

  const handleDeleteSubtask = async (subtaskId) => {
    try {
      await axios.delete(`${API}/subtasks/${subtaskId}`, { headers });
      // Remove subtask and its nested children
      const remaining = subtasks.filter(s => s.id !== subtaskId && s.parentId !== subtaskId);
      setSubtasks(remaining);
      setTask(prev => ({ ...prev, subtasks: remaining }));
      onTaskUpdated?.({ ...task, subtasks: remaining });
      reloadTaskDetails();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete subtask.');
    }
  };

  // Watch / Unwatch
  const handleToggleWatch = async () => {
    try {
      if (isWatching) {
        await axios.delete(`${API}/tasks/${task.id}/watch`, { headers });
        setWatchers(prev => prev.filter(w => w.id !== currentUserId));
      } else {
        await axios.post(`${API}/tasks/${task.id}/watch`, {}, { headers });
        const me = members.find(m => m.id === currentUserId) || { id: currentUserId, name: 'You' };
        setWatchers(prev => [...prev, me]);
      }
      reloadTaskDetails();
    } catch {
      setError('Failed to update watch status.');
    }
  };

  // Comments CRUD
  const handleAddComment = async (e) => {
    e?.preventDefault();
    const content = newComment.trim();
    if (!content || submitting) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await axios.post(`${API}/tasks/${task.id}/comments`, { content }, { headers });
      setComments(prev => [...prev, res.data.comment]);
      setNewComment('');
      reloadTaskDetails();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditComment = async (commentId) => {
    const content = commentDraft.trim();
    if (!content) return;
    try {
      const res = await axios.patch(`${API}/tasks/${task.id}/comments/${commentId}`, { content }, { headers });
      setComments(prev => prev.map(c => c.id === commentId ? res.data.comment : c));
      setEditingCommentId(null);
      setCommentDraft('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to edit comment.');
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await axios.delete(`${API}/tasks/${task.id}/comments/${commentId}`, { headers });
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete comment.');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  if (!initialTask) return null;

  // Subtask calculations
  const totalSubtasks = subtasks.length;
  const completedSubtasks = subtasks.filter(s => s.completed).length;
  const progressPercent = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

  const subtaskTree = buildSubtaskTree(subtasks);

  // Subtask row renderer
  const renderSubtaskItem = (subtaskItem, depth = 0) => {
    const hasChildren = subtaskItem.children && subtaskItem.children.length > 0;
    const isCollapsed = Boolean(collapsedParents[subtaskItem.id]);
    const isEditingThis = editingSubtaskId === subtaskItem.id;
    const isAddingChild = addingNestedToId === subtaskItem.id;
    const overdue = isSubtaskOverdue(subtaskItem.dueDate, subtaskItem.completed);
    const formattedDueDate = formatShortDate(subtaskItem.dueDate);

    // Apply filtering
    if (subtaskFilter === 'incomplete' && subtaskItem.completed && !hasChildren) {
      return null;
    }

    return (
      <div key={subtaskItem.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          className="subtask-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '7px 10px',
            paddingLeft: depth > 0 ? `${12 + depth * 22}px` : '10px',
            borderRadius: 6,
            background: subtaskItem.completed ? 'var(--color-canvas-subtle, #f9fafa)' : 'var(--color-canvas-card, #ffffff)',
            border: '1px solid var(--color-canvas-hairline, #ebebeb)',
            position: 'relative',
            transition: 'background 120ms, border-color 120ms',
          }}
        >
          {/* Depth tree guide indicator */}
          {depth > 0 && (
            <div
              style={{
                position: 'absolute',
                left: `${depth * 22 - 6}px`,
                top: 0,
                bottom: 0,
                width: 2,
                background: 'var(--color-canvas-hairline, #e8eaec)',
              }}
            />
          )}

          {/* Left part: collapse chevron + checkbox + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            {/* Collapse toggle if has children */}
            {hasChildren ? (
              <button
                type="button"
                onClick={() => setCollapsedParents(prev => ({ ...prev, [subtaskItem.id]: !isCollapsed }))}
                style={{
                  background: 'none', border: 'none', padding: 0, width: 14, height: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--color-canvas-mute, #888888)', flexShrink: 0,
                }}
                title={isCollapsed ? 'Expand subtasks' : 'Collapse subtasks'}
              >
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 120ms' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            ) : depth > 0 ? (
              <span style={{ width: 14, flexShrink: 0 }} />
            ) : null}

            {/* Interactive Checkbox */}
            <button
              type="button"
              onClick={() => handleToggleSubtask(subtaskItem.id)}
              className="subtask-checkbox"
              style={{
                width: 17,
                height: 17,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: subtaskItem.completed ? '#0070f3' : 'var(--color-canvas-card, #ffffff)',
                border: subtaskItem.completed ? '1.5px solid #0070f3' : '1.5px solid var(--color-canvas-hairline, #c8cacc)',
                padding: 0,
                flexShrink: 0,
                transition: 'all 120ms ease',
              }}
              title={subtaskItem.completed ? 'Mark incomplete' : 'Mark complete'}
              aria-label={subtaskItem.completed ? 'Mark incomplete' : 'Mark complete'}
            >
              {subtaskItem.completed && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>

            {/* Subtask Title (inline editable) */}
            {isEditingThis ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <input
                  type="text"
                  value={editingSubtaskTitle}
                  onChange={e => setEditingSubtaskTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveSubtaskTitle(subtaskItem.id);
                    if (e.key === 'Escape') setEditingSubtaskId(null);
                  }}
                  className="field-input"
                  style={{ height: 24, fontSize: 12.5, padding: '0 6px', flex: 1 }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn-primary"
                  style={{ height: 22, fontSize: 10.5, padding: '0 6px' }}
                  onClick={() => handleSaveSubtaskTitle(subtaskItem.id)}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ height: 22, fontSize: 10.5, padding: '0 6px' }}
                  onClick={() => setEditingSubtaskId(null)}
                >
                  ✕
                </button>
              </div>
            ) : (
              <span
                onClick={() => { setEditingSubtaskId(subtaskItem.id); setEditingSubtaskTitle(subtaskItem.title); }}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: subtaskItem.completed ? 'var(--color-canvas-mute, #888888)' : 'var(--color-canvas-ink, #0f1011)',
                  textDecoration: subtaskItem.completed ? 'line-through' : 'none',
                  lineHeight: '18px',
                  cursor: 'text',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
                title="Click to rename"
              >
                {subtaskItem.title}
              </span>
            )}
          </div>

          {/* Right part: Assignee + Due Date + Actions */}
          {!isEditingThis && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {/* Due Date pill */}
              {formattedDueDate ? (
                <span
                  className={`badge ${overdue ? 'badge-overdue' : ''}`}
                  style={{
                    fontSize: 10,
                    padding: '1px 5px',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                  title={overdue ? `Overdue (${formattedDueDate})` : `Due ${formattedDueDate}`}
                >
                  {overdue ? '⚠ ' : ''}{formattedDueDate}
                </span>
              ) : null}

              {/* Assignee Avatar / Picker */}
              <select
                value={subtaskItem.assigneeId || ''}
                onChange={e => handleUpdateSubtaskAssignee(subtaskItem.id, e.target.value)}
                style={{
                  fontSize: 10,
                  height: 20,
                  padding: '0 4px',
                  borderRadius: 4,
                  border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                  background: 'var(--color-canvas-subtle, #fafafa)',
                  color: subtaskItem.assigneeId ? 'var(--color-canvas-ink, #0f1011)' : 'var(--color-canvas-mute, #888888)',
                  cursor: 'pointer',
                  outline: 'none',
                  maxWidth: 90,
                }}
                title="Change assignee"
              >
                <option value="">+ Assign</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name.split(' ')[0]}{m.id === currentUserId ? ' (me)' : ''}
                  </option>
                ))}
              </select>

              {/* Add nested child subtask button (allowed if depth < 2 to keep hierarchy clean) */}
              {depth < 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setAddingNestedToId(isAddingChild ? null : subtaskItem.id);
                    setNestedDraft('');
                  }}
                  style={{
                    background: 'none', border: 'none', padding: '0 4px', fontSize: 11,
                    color: isAddingChild ? '#0070f3' : 'var(--color-canvas-mute, #888888)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2,
                  }}
                  title="Add nested checklist item"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Sub
                </button>
              )}

              {/* Delete button */}
              <button
                type="button"
                onClick={() => handleDeleteSubtask(subtaskItem.id)}
                style={{
                  background: 'none', border: 'none', padding: '0 3px',
                  color: 'var(--color-canvas-mute, #888888)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                }}
                title="Delete subtask"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Nested Child Creation Input */}
        {isAddingChild && (
          <form
            onSubmit={(e) => handleCreateSubtask(e, subtaskItem.id)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              marginLeft: `${24 + depth * 22}px`, padding: '8px 10px',
              borderRadius: 6, background: 'var(--color-canvas-subtle, #f9fafa)',
              border: '1px dashed var(--color-canvas-hairline, #ebebeb)',
            }}
          >
            <input
              type="text"
              value={nestedDraft}
              onChange={e => setNestedDraft(e.target.value)}
              placeholder={`Add sub-item under "${subtaskItem.title}"…`}
              className="field-input"
              style={{ height: 26, fontSize: 12 }}
              autoFocus
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <select
                  value={nestedAssignee}
                  onChange={e => setNestedAssignee(e.target.value)}
                  style={{ height: 22, fontSize: 10.5, borderRadius: 3, border: '1px solid var(--color-canvas-hairline)' }}
                >
                  <option value="">Assignee</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={nestedDueDate}
                  onChange={e => setNestedDueDate(e.target.value)}
                  style={{ height: 22, fontSize: 10.5, borderRadius: 3, border: '1px solid var(--color-canvas-hairline)' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ height: 22, fontSize: 10.5, padding: '0 6px' }}
                  onClick={() => setAddingNestedToId(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!nestedDraft.trim()}
                  className="btn-primary"
                  style={{ height: 22, fontSize: 10.5, padding: '0 8px' }}
                >
                  Add Sub-item
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Render child subtasks recursively */}
        {hasChildren && !isCollapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {subtaskItem.children.map(child => renderSubtaskItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(3px)',
          zIndex: 50,
        }}
        aria-hidden="true"
      />

      {/* Workspace Drawer Panel */}
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '100%', maxWidth: 760,
          background: 'var(--color-canvas-card, #ffffff)',
          borderLeft: '1px solid var(--color-canvas-hairline, #ebebeb)',
          boxShadow: '-8px 0 36px rgba(0, 0, 0, 0.16)',
          zIndex: 60, display: 'flex', flexDirection: 'column',
          animation: 'slideLeft 180ms ease-out',
        }}
        role="dialog"
        aria-label="Task Detail Workspace"
      >
        {/* Top Header Bar */}
        <header
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, background: 'var(--color-canvas-main, #ffffff)',
          }}
        >
          {/* Left: Task ID & Copy link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-canvas-mute, #888888)', fontFamily: "'JetBrains Mono', monospace" }}>
              TASK-{task.id.slice(0, 6).toUpperCase()}
            </span>

            <button
              type="button"
              onClick={handleCopyLink}
              title="Copy task link"
              className="btn-secondary"
              style={{ height: 24, padding: '0 7px', fontSize: 11, gap: 4 }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              {copySuccess ? 'Copied!' : 'Copy link'}
            </button>
          </div>

          {/* Right: Watch button + Delete + Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Watch toggle */}
            <button
              type="button"
              onClick={handleToggleWatch}
              className={`btn-secondary ${isWatching ? 'active' : ''}`}
              style={{
                height: 28, padding: '0 10px', fontSize: 11.5, gap: 5,
                background: isWatching ? 'rgba(0, 112, 243, 0.08)' : undefined,
                borderColor: isWatching ? '#0070f3' : undefined,
                color: isWatching ? '#0070f3' : undefined,
              }}
              title={isWatching ? 'Stop watching this task' : 'Watch this task for updates'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {isWatching ? 'Following' : 'Watch'}
              {watchers.length > 0 && (
                <span style={{ fontSize: 10.5, opacity: 0.8, fontFamily: "'JetBrains Mono', monospace" }}>
                  ({watchers.length})
                </span>
              )}
            </button>

            {/* Permission-aware Delete */}
            {canDelete && onDelete && (
              <button
                type="button"
                onClick={() => { onDelete(task.id); onClose(); }}
                className="btn-secondary"
                style={{ height: 28, fontSize: 11.5, color: '#e5484d', borderColor: 'rgba(229, 72, 77, 0.3)' }}
                title="Delete task"
              >
                Delete
              </button>
            )}

            {/* Close button with Esc helper */}
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              style={{ height: 28, width: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Close (Esc)"
              aria-label="Close task workspace"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 3l8 8M11 3l-8 8" />
              </svg>
            </button>
          </div>
        </header>

        {/* Error notification banner */}
        {error && (
          <div style={{ margin: '12px 20px 0', padding: '8px 12px', background: 'var(--color-banner-error-bg, #f7d4d6)', color: 'var(--color-banner-error-fg, #c50000)', borderRadius: 6, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
          </div>
        )}

        {/* Workspace Body — 2 Column Layout or Skeleton Loading */}
        {loading ? (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ height: 28, width: '60%', background: 'var(--color-canvas-hover, #f0f1f3)', borderRadius: 4, animation: 'pulseIndicator 1s infinite alternate' }} />
            <div style={{ height: 90, width: '100%', background: 'var(--color-canvas-hover, #f0f1f3)', borderRadius: 6, animation: 'pulseIndicator 1s infinite alternate' }} />
            <div style={{ height: 160, width: '100%', background: 'var(--color-canvas-hover, #f0f1f3)', borderRadius: 6, animation: 'pulseIndicator 1s infinite alternate' }} />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflowY: 'auto', flexDirection: 'row', flexWrap: 'wrap' }}>
            {/* Main Column (Title, Description, Subtasks & Checklists, Comments & Activity) */}
            <div style={{ flex: '1 1 420px', minWidth: 320, padding: '24px', borderRight: '1px solid var(--color-canvas-hairline, #ebebeb)', display: 'flex', flexDirection: 'column', gap: 22 }}>
              {/* Title Section with Inline Edit */}
              <div>
                {isEditingTitle ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      ref={titleInputRef}
                      type="text"
                      value={titleDraft}
                      onChange={e => setTitleDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveTitle();
                        if (e.key === 'Escape') { setTitleDraft(task.title); setIsEditingTitle(false); }
                      }}
                      className="field-input"
                      style={{ fontSize: 18, fontWeight: 600, padding: '6px 10px' }}
                    />
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn-secondary" style={{ height: 24, fontSize: 11 }} onClick={() => { setTitleDraft(task.title); setIsEditingTitle(false); }}>Cancel</button>
                      <button type="button" className="btn-primary" style={{ height: 24, fontSize: 11 }} onClick={handleSaveTitle}>Save</button>
                    </div>
                  </div>
                ) : (
                  <h1
                    onClick={() => setIsEditingTitle(true)}
                    title="Click or press 'E' to edit"
                    style={{
                      margin: 0, fontSize: 19, fontWeight: 600,
                      color: task.status === 'done' ? 'var(--color-canvas-mute, #888888)' : 'var(--color-canvas-ink, #0f1011)',
                      textDecoration: task.status === 'done' ? 'line-through' : 'none',
                      letterSpacing: '-0.02em', lineHeight: '26px', cursor: 'text',
                      padding: '2px 4px', borderRadius: 4, transition: 'background 120ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-canvas-hover, #f0f1f3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {task.title}
                  </h1>
                )}
              </div>

              {/* Description Section with Inline Edit */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-canvas-mute, #888888)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Description
                  </span>
                  {!isEditingDesc && (
                    <button
                      type="button"
                      onClick={() => setIsEditingDesc(true)}
                      style={{ background: 'none', border: 'none', padding: 0, fontSize: 11.5, color: '#0070f3', cursor: 'pointer', fontWeight: 500 }}
                    >
                      {task.description ? 'Edit' : '+ Add description'}
                    </button>
                  )}
                </div>

                {isEditingDesc ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <textarea
                      rows={4}
                      value={descDraft}
                      onChange={e => setDescDraft(e.target.value)}
                      className="field-input"
                      placeholder="Add more details, links, or specifications…"
                      style={{ fontSize: 13, resize: 'vertical' }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn-secondary" style={{ height: 24, fontSize: 11 }} onClick={() => { setDescDraft(task.description || ''); setIsEditingDesc(false); }}>Cancel</button>
                      <button type="button" className="btn-primary" style={{ height: 24, fontSize: 11 }} onClick={handleSaveDesc}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => setIsEditingDesc(true)}
                    style={{
                      padding: '8px 10px', borderRadius: 6,
                      background: 'var(--color-canvas-subtle, #f9fafa)',
                      border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                      fontSize: 13, color: task.description ? 'var(--color-canvas-ink, #171717)' : 'var(--color-canvas-mute, #888888)',
                      lineHeight: '20px', minHeight: 48, whiteSpace: 'pre-wrap', cursor: 'pointer',
                    }}
                  >
                    {task.description || 'No description provided. Click to add.'}
                  </div>
                )}
              </div>

              {/* ─── Phase 20: Subtasks & Checklists Workspace Section ──────────────── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px', borderRadius: 8, background: 'var(--color-canvas-subtle, #fafafa)', border: '1px solid var(--color-canvas-hairline, #ebebeb)' }}>
                {/* Header & Progress Stats */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-canvas-body, #333333)' }}>
                      Subtasks & Checklists
                    </span>
                    {totalSubtasks > 0 && (
                      <span
                        style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                          background: progressPercent === 100 ? 'rgba(16, 185, 129, 0.15)' : 'var(--color-canvas-hover, #e8eaec)',
                          color: progressPercent === 100 ? '#10b981' : 'var(--color-canvas-body, #4d4d4d)',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {completedSubtasks}/{totalSubtasks} ({progressPercent}%)
                      </span>
                    )}
                  </div>

                  {/* Filter toggle */}
                  {totalSubtasks > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => setSubtaskFilter('all')}
                        style={{
                          padding: '2px 6px', fontSize: 10.5, borderRadius: 4,
                          background: subtaskFilter === 'all' ? 'var(--color-canvas-card, #ffffff)' : 'transparent',
                          border: subtaskFilter === 'all' ? '1px solid var(--color-canvas-hairline, #ebebeb)' : '1px solid transparent',
                          fontWeight: subtaskFilter === 'all' ? 600 : 500,
                          color: subtaskFilter === 'all' ? '#0070f3' : 'var(--color-canvas-mute, #888888)',
                          cursor: 'pointer',
                        }}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubtaskFilter('incomplete')}
                        style={{
                          padding: '2px 6px', fontSize: 10.5, borderRadius: 4,
                          background: subtaskFilter === 'incomplete' ? 'var(--color-canvas-card, #ffffff)' : 'transparent',
                          border: subtaskFilter === 'incomplete' ? '1px solid var(--color-canvas-hairline, #ebebeb)' : '1px solid transparent',
                          fontWeight: subtaskFilter === 'incomplete' ? 600 : 500,
                          color: subtaskFilter === 'incomplete' ? '#0070f3' : 'var(--color-canvas-mute, #888888)',
                          cursor: 'pointer',
                        }}
                      >
                        Incomplete
                      </button>
                    </div>
                  )}
                </div>

                {/* Visual Progress Bar */}
                {totalSubtasks > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div
                      style={{
                        height: 6,
                        width: '100%',
                        borderRadius: 99,
                        background: 'var(--color-canvas-hairline, #e2e4e8)',
                        overflow: 'hidden',
                      }}
                      role="progressbar"
                      aria-valuenow={progressPercent}
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${progressPercent}%`,
                          background: progressPercent === 100
                            ? '#10b981'
                            : 'linear-gradient(90deg, #0070f3, #00c6ff)',
                          borderRadius: 99,
                          transition: 'width 240ms ease-out',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--color-canvas-mute, #888888)' }}>
                      <span>{progressPercent}% complete</span>
                      <span>{totalSubtasks - completedSubtasks} remaining</span>
                    </div>
                  </div>
                )}

                {/* Subtasks Tree List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {totalSubtasks === 0 ? (
                    <p style={{ margin: '4px 0', fontSize: 12.5, color: 'var(--color-canvas-mute, #888888)', fontStyle: 'italic' }}>
                      Break this task down into subtasks and checklist items below.
                    </p>
                  ) : (
                    subtaskTree.map(rootItem => renderSubtaskItem(rootItem, 0))
                  )}
                </div>

                {/* Add Subtask Quick Input */}
                <form
                  onSubmit={e => handleCreateSubtask(e, null)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    marginTop: 6,
                    paddingTop: 8,
                    borderTop: '1px solid var(--color-canvas-hairline, #ebebeb)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      ref={subtaskInputRef}
                      type="text"
                      value={subtaskDraft}
                      onChange={e => setSubtaskDraft(e.target.value)}
                      onFocus={() => setShowSubtaskOptions(true)}
                      placeholder="Add a subtask or checklist item… (Press Enter)"
                      className="field-input"
                      style={{ fontSize: 12.5, height: 30, flex: 1 }}
                    />
                    <button
                      type="submit"
                      disabled={!subtaskDraft.trim() || isSubtaskSubmitting}
                      className="btn-primary"
                      style={{ height: 30, fontSize: 11.5, padding: '0 12px' }}
                    >
                      {isSubtaskSubmitting ? 'Adding…' : 'Add'}
                    </button>
                  </div>

                  {/* Optional Assignee and Due Date bar */}
                  {showSubtaskOptions && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <select
                          value={subtaskAssignee}
                          onChange={e => setSubtaskAssignee(e.target.value)}
                          style={{
                            height: 24, fontSize: 11, borderRadius: 4,
                            border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                            background: 'var(--color-canvas-card, #ffffff)',
                            color: 'var(--color-canvas-body, #4d4d4d)',
                          }}
                        >
                          <option value="">Assign to…</option>
                          {members.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name}{m.id === currentUserId ? ' (me)' : ''}
                            </option>
                          ))}
                        </select>

                        <input
                          type="date"
                          value={subtaskDueDate}
                          onChange={e => setSubtaskDueDate(e.target.value)}
                          style={{
                            height: 24, fontSize: 11, borderRadius: 4,
                            border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                            background: 'var(--color-canvas-card, #ffffff)',
                            color: 'var(--color-canvas-body, #4d4d4d)',
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setShowSubtaskOptions(false);
                          setSubtaskDraft('');
                          setSubtaskAssignee('');
                          setSubtaskDueDate('');
                        }}
                        style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--color-canvas-mute, #888888)', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </form>
              </div>

              {/* Tabbed Section: Comments vs Activity */}
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', flex: 1 }}>
                {/* Tab Header */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--color-canvas-hairline, #ebebeb)', marginBottom: 14 }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('comments')}
                    style={{
                      padding: '8px 14px', fontSize: 13, fontWeight: 600,
                      color: activeTab === 'comments' ? 'var(--color-canvas-ink, #0f1011)' : 'var(--color-canvas-mute, #888888)',
                      borderBottom: activeTab === 'comments' ? '2px solid #0070f3' : '2px solid transparent',
                      background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    Comments
                    {comments.length > 0 && (
                      <span style={{ fontSize: 11, padding: '1px 5px', borderRadius: 99, background: 'var(--color-canvas-hover, #f0f1f3)', color: 'var(--color-canvas-body, #4d4d4d)' }}>
                        {comments.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('activity')}
                    style={{
                      padding: '8px 14px', fontSize: 13, fontWeight: 600,
                      color: activeTab === 'activity' ? 'var(--color-canvas-ink, #0f1011)' : 'var(--color-canvas-mute, #888888)',
                      borderBottom: activeTab === 'activity' ? '2px solid #0070f3' : '2px solid transparent',
                      background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    Activity
                    {activities.length > 0 && (
                      <span style={{ fontSize: 11, padding: '1px 5px', borderRadius: 99, background: 'var(--color-canvas-hover, #f0f1f3)', color: 'var(--color-canvas-body, #4d4d4d)' }}>
                        {activities.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Comments Tab Content */}
                {activeTab === 'comments' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Comments list */}
                    {comments.length === 0 ? (
                      <p style={{ margin: '12px 0', fontSize: 12.5, color: 'var(--color-canvas-mute, #888888)', fontStyle: 'italic' }}>
                        No comments yet. Start the conversation below.
                      </p>
                    ) : (
                      comments.map(c => {
                        const isAuthor = c.authorId === currentUserId;
                        const isEditing = editingCommentId === c.id;

                        return (
                          <div
                            key={c.id}
                            style={{
                              padding: '10px 12px', borderRadius: 8,
                              background: 'var(--color-canvas-subtle, #f9fafa)',
                              border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                              display: 'flex', flexDirection: 'column', gap: 6,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <UserAvatar name={c.author?.name} size={22} />
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
                                  {c.author?.name || 'User'}
                                  {isAuthor && <span style={{ marginLeft: 4, fontSize: 10, color: '#0070f3', fontWeight: 500 }}>(you)</span>}
                                </span>
                                <span style={{ fontSize: 11, color: 'var(--color-canvas-mute, #888888)' }}>
                                  {formatTimestamp(c.createdAt)}
                                </span>
                              </div>

                              {/* Comment actions */}
                              <div style={{ display: 'flex', gap: 4 }}>
                                {isAuthor && !isEditing && (
                                  <button
                                    type="button"
                                    onClick={() => { setEditingCommentId(c.id); setCommentDraft(c.content); }}
                                    style={{ background: 'none', border: 'none', padding: '0 4px', fontSize: 11, color: 'var(--color-canvas-mute, #888888)', cursor: 'pointer' }}
                                  >
                                    Edit
                                  </button>
                                )}
                                {(isAuthor || ['admin', 'owner'].includes(userRole)) && !isEditing && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(c.id)}
                                    style={{ background: 'none', border: 'none', padding: '0 4px', fontSize: 11, color: '#e5484d', cursor: 'pointer' }}
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>

                            {isEditing ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                <textarea
                                  rows={2}
                                  value={commentDraft}
                                  onChange={e => setCommentDraft(e.target.value)}
                                  className="field-input"
                                  style={{ fontSize: 12.5 }}
                                />
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                  <button type="button" className="btn-secondary" style={{ height: 22, fontSize: 10.5 }} onClick={() => setEditingCommentId(null)}>Cancel</button>
                                  <button type="button" className="btn-primary" style={{ height: 22, fontSize: 10.5 }} onClick={() => handleEditComment(c.id)}>Save</button>
                                </div>
                              </div>
                            ) : (
                              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-canvas-body, #333333)', lineHeight: '18px', whiteSpace: 'pre-wrap' }}>
                                {c.content}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}

                    {/* New Comment Box */}
                    <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      <textarea
                        rows={3}
                        value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        onKeyDown={e => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleAddComment(e);
                        }}
                        className="field-input"
                        placeholder="Write a comment… (Cmd + Enter to send)"
                        style={{ fontSize: 13, resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: 'var(--color-canvas-mute, #888888)' }}>
                          Press <kbd style={{ fontFamily: "'JetBrains Mono', monospace", background: 'var(--color-canvas-hover, #f0f1f3)', padding: '1px 4px', borderRadius: 3 }}>⌘↵</kbd> to submit
                        </span>
                        <button
                          type="submit"
                          disabled={submitting || !newComment.trim()}
                          className="btn-primary"
                          style={{ height: 28, fontSize: 12, padding: '0 12px' }}
                        >
                          {submitting ? 'Sending…' : 'Comment'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Activity Tab Content */}
                {activeTab === 'activity' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
                    {activities.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-canvas-mute, #888888)', fontStyle: 'italic' }}>
                        No activity recorded.
                      </p>
                    ) : (
                      activities.map((act) => (
                        <div
                          key={act.id}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            fontSize: 12.5, color: 'var(--color-canvas-body, #4d4d4d)',
                            padding: '6px 0', borderBottom: '1px solid var(--color-canvas-hairline, #f0f1f3)',
                          }}
                        >
                          <span style={{ marginTop: 2 }}>{getActivityIcon(act.action)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontWeight: 600, color: 'var(--color-canvas-ink, #0f1011)' }}>
                              {act.user?.name || 'System'}
                            </span>{' '}
                            <span>{act.details || act.action}</span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--color-canvas-mute, #888888)', flexShrink: 0 }}>
                            {formatTimestamp(act.createdAt)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Properties Panel */}
            <div style={{ flex: '0 0 260px', width: 260, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 18, background: 'var(--color-canvas-subtle, #fafafa)' }}>
              <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-canvas-mute, #888888)' }}>
                Properties
              </h3>

              {/* Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-canvas-mute, #888888)' }}>Status</label>
                <select
                  value={task.status}
                  onChange={e => {
                    onStatusChange?.(task.id, e.target.value);
                    setTask(prev => ({ ...prev, status: e.target.value }));
                  }}
                  className={`badge ${task.status === 'done' ? 'badge-done' : task.status === 'in_progress' ? 'badge-progress' : 'badge-todo'}`}
                  style={{
                    height: 28, padding: '0 8px', fontSize: 12, borderRadius: 5,
                    fontWeight: 600, cursor: 'pointer', outline: 'none', border: '1px solid',
                  }}
                >
                  <option value="todo">Todo</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>

              {/* Priority */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-canvas-mute, #888888)' }}>Priority</label>
                <select
                  value={task.priority || 'medium'}
                  onChange={e => handlePriorityChange(e.target.value)}
                  className="field-input"
                  style={{ height: 28, padding: '0 8px', fontSize: 12, fontWeight: 500 }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              {/* Assignee */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-canvas-mute, #888888)' }}>Assignee</label>
                <select
                  value={task.assigneeId || ''}
                  onChange={e => handleAssigneeChange(e.target.value)}
                  className="field-input"
                  style={{ height: 28, padding: '0 8px', fontSize: 12 }}
                >
                  <option value="">Unassigned</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}{m.id === currentUserId ? ' (you)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Due Date */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-canvas-mute, #888888)' }}>Due date</label>
                <input
                  type="date"
                  value={task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}
                  onChange={e => handleDueDateChange(e.target.value)}
                  className="field-input"
                  style={{ height: 28, padding: '0 8px', fontSize: 12 }}
                />
              </div>

              {/* Labels Manager */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-canvas-mute, #888888)' }}>Labels</label>
                  <button
                    type="button"
                    onClick={() => setShowAddLabel(v => !v)}
                    style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: '#0070f3', cursor: 'pointer' }}
                  >
                    + Add
                  </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(task.labels || []).map((lbl, idx) => (
                    <span
                      key={idx}
                      className="label-chip"
                      style={{
                        fontSize: 10.5, padding: '2px 6px', borderRadius: 4,
                        background: 'var(--color-canvas-card, #ffffff)',
                        border: '1px solid var(--color-canvas-hairline, #ebebeb)',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      #{lbl}
                      <button
                        type="button"
                        onClick={() => handleRemoveLabel(lbl)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-canvas-mute, #888888)', display: 'flex' }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>

                {showAddLabel && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <input
                      type="text"
                      value={newLabelInput}
                      onChange={e => setNewLabelInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddLabel(); }}
                      placeholder="Tag name…"
                      className="field-input"
                      style={{ height: 24, fontSize: 11, padding: '0 6px' }}
                      autoFocus
                    />
                    <button type="button" className="btn-primary" style={{ height: 24, fontSize: 10.5, padding: '0 8px' }} onClick={handleAddLabel}>Add</button>
                  </div>
                )}
              </div>

              {/* Watchers Stack */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-canvas-mute, #888888)' }}>
                  Watchers ({watchers.length})
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {watchers.map(w => (
                    <UserAvatar key={w.id} name={w.name} size={24} />
                  ))}
                </div>
              </div>

              {/* Metadata Footer */}
              <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--color-canvas-hairline, #ebebeb)', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: 'var(--color-canvas-mute, #888888)' }}>
                <div>Created by {task.createdBy?.name || 'Unknown'}</div>
                <div>{task.createdAt ? new Date(task.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</div>
              </div>

              {/* Keyboard shortcuts legend */}
              <div style={{ padding: '8px 10px', background: 'var(--color-canvas-card, #ffffff)', borderRadius: 6, border: '1px solid var(--color-canvas-hairline, #ebebeb)', fontSize: 10.5, color: 'var(--color-canvas-mute, #888888)' }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--color-canvas-body, #4d4d4d)' }}>Shortcuts:</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Edit task</span><kbd>E</kbd></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>New task</span><kbd>C</kbd></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Search</span><kbd>/</kbd></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Close</span><kbd>Esc</kbd></div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
