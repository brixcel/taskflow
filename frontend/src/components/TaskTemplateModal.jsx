import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  Tag,
  Plus,
  Trash2,
  Copy,
  Layers,
  ArrowRight,
  Folder,
  X,
  AlertTriangle,
  Flame,
  Check,
  Zap,
} from 'lucide-react';
import { API_URL } from '../api/config';

export default function TaskTemplateModal({
  isOpen,
  onClose,
  projects = [],
  activeProjectId = null,
  onTemplateApplied,
  userRole = 'member',
}) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [targetProjectId, setTargetProjectId] = useState(activeProjectId || '');
  const [customTitle, setCustomTitle] = useState('');
  const [applying, setApplying] = useState(false);

  // New Custom Template Creator State
  const [isCreatingCustom, setIsCreatingCustom] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState('Engineering');
  const [newTemplatePriority, setNewTemplatePriority] = useState('medium');
  const [newAutoDueDays, setNewAutoDueDays] = useState(3);
  const [newSubtasks, setNewSubtasks] = useState([
    { title: 'Step 1: Initial research and discovery' },
    { title: 'Step 2: Implementation & testing' },
  ]);
  const [savingCustom, setSavingCustom] = useState(false);

  // Fetch templates when modal opens
  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      const teamId = localStorage.getItem('teamId');
      const headers = {
        Authorization: `Bearer ${token}`,
        ...(teamId ? { 'X-Team-Id': teamId } : {}),
      };

      const res = await axios.get(`${API_URL}/task-templates`, { headers });
      const tpls = res.data.templates || [];
      setTemplates(tpls);
      if (tpls.length > 0 && !activeTemplate) {
        setActiveTemplate(tpls[0]);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load task templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setTargetProjectId(activeProjectId || '');
      setIsCreatingCustom(false);
    }
  }, [isOpen, activeProjectId]);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set(['All']);
    templates.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return Array.from(set);
  }, [templates]);

  // Filter templates by category
  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'All') return templates;
    return templates.filter(
      (t) => t.category?.toLowerCase() === selectedCategory.toLowerCase()
    );
  }, [templates, selectedCategory]);

  // Handle Apply Template
  const handleApply = async () => {
    if (!activeTemplate) return;
    try {
      setApplying(true);
      setError(null);
      const token = localStorage.getItem('token');
      const teamId = localStorage.getItem('teamId');
      const headers = {
        Authorization: `Bearer ${token}`,
        ...(teamId ? { 'X-Team-Id': teamId } : {}),
      };

      const payload = {
        projectId: targetProjectId || undefined,
        title: customTitle.trim() || undefined,
      };

      const res = await axios.post(
        `${API_URL}/task-templates/${activeTemplate.id}/apply`,
        payload,
        { headers }
      );

      if (onTemplateApplied) {
        onTemplateApplied(res.data);
      }
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to instantiate task from template');
    } finally {
      setApplying(false);
    }
  };

  // Handle Create Custom Template
  const handleCreateCustom = async (e) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;

    try {
      setSavingCustom(true);
      setError(null);
      const token = localStorage.getItem('token');
      const teamId = localStorage.getItem('teamId');
      const headers = {
        Authorization: `Bearer ${token}`,
        ...(teamId ? { 'X-Team-Id': teamId } : {}),
      };

      const validSubtasks = newSubtasks
        .filter((st) => st.title.trim())
        .map((st) => ({ title: st.title.trim() }));

      const payload = {
        name: newTemplateName.trim(),
        description: newTemplateDescription.trim() || undefined,
        category: newTemplateCategory,
        defaultPriority: newTemplatePriority,
        subtasks: validSubtasks,
        automationRules: {
          autoDueDays: Number(newAutoDueDays) || 0,
          defaultStatus: 'todo',
          autoAssignToCreator: true,
        },
      };

      const res = await axios.post(`${API_URL}/task-templates`, payload, { headers });
      const created = res.data.template;
      setTemplates((prev) => [created, ...prev]);
      setActiveTemplate(created);
      setIsCreatingCustom(false);
      setNewTemplateName('');
      setNewTemplateDescription('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create custom template');
    } finally {
      setSavingCustom(false);
    }
  };

  const handleAddSubtaskInput = () => {
    setNewSubtasks((prev) => [...prev, { title: '' }]);
  };

  const handleSubtaskChange = (index, val) => {
    setNewSubtasks((prev) => {
      const next = [...prev];
      next[index].title = val;
      return next;
    });
  };

  const handleRemoveSubtask = (index) => {
    setNewSubtasks((prev) => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Task Templates & Workflow Automation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-4xl rounded-2xl shadow-2xl border flex flex-col overflow-hidden"
        style={{
          background: 'var(--color-canvas-card, #141518)',
          borderColor: 'var(--color-canvas-card-border, #2a2d34)',
          color: 'var(--color-canvas-ink, #f0f1f3)',
          maxHeight: '90vh',
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--color-canvas-hairline, #23252a)' }}
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Zap size={18} />
            </span>
            <div>
              <h2 className="text-[17px] font-semibold tracking-tight">
                {isCreatingCustom ? 'Create Custom Task Template' : 'Task Templates & Workflows'}
              </h2>
              <p className="text-[12px] text-[var(--color-canvas-mute,#8a8f98)]">
                {isCreatingCustom
                  ? 'Define reusable workflows with automated subtasks and due date offsets'
                  : 'Instantly instantiate structured tasks with automated subtask checklists'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isCreatingCustom && (
              <button
                type="button"
                onClick={() => setIsCreatingCustom(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg bg-[var(--color-canvas-hover,#1b1c20)] hover:bg-[var(--color-canvas-card,#22242b)] border border-[var(--color-canvas-hairline,#2a2d34)] text-[var(--color-canvas-ink,#f0f1f3)] transition-colors"
              >
                <Plus size={14} />
                New Template
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--color-canvas-mute,#8a8f98)] hover:text-[var(--color-canvas-ink,#f0f1f3)] hover:bg-[var(--color-canvas-hover,#1b1c20)] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {error && (
          <div className="px-6 py-2.5 bg-red-500/10 border-b border-red-500/20 text-red-400 text-[13px] flex items-center gap-2 shrink-0">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Body */}
        {isCreatingCustom ? (
          <form onSubmit={handleCreateCustom} className="p-6 overflow-y-auto space-y-5 flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-medium text-[var(--color-canvas-mute,#8a8f98)] mb-1.5">
                  Template Name *
                </label>
                <input
                  type="text"
                  required
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. Design Handoff & QA Review"
                  className="w-full px-3 py-2 rounded-lg text-[13px] bg-[var(--color-input-bg,#1b1c20)] border border-[var(--color-input-border,#2a2d34)] text-[var(--color-canvas-ink,#f0f1f3)] outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[var(--color-canvas-mute,#8a8f98)] mb-1.5">
                  Category
                </label>
                <select
                  value={newTemplateCategory}
                  onChange={(e) => setNewTemplateCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-[13px] bg-[var(--color-input-bg,#1b1c20)] border border-[var(--color-input-border,#2a2d34)] text-[var(--color-canvas-ink,#f0f1f3)] outline-none focus:border-indigo-500"
                >
                  <option value="Engineering">Engineering</option>
                  <option value="Design">Design</option>
                  <option value="Product">Product</option>
                  <option value="Operations">Operations</option>
                  <option value="Marketing">Marketing</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--color-canvas-mute,#8a8f98)] mb-1.5">
                Description
              </label>
              <textarea
                rows={2}
                value={newTemplateDescription}
                onChange={(e) => setNewTemplateDescription(e.target.value)}
                placeholder="Briefly describe what this workflow accomplishes..."
                className="w-full px-3 py-2 rounded-lg text-[13px] bg-[var(--color-input-bg,#1b1c20)] border border-[var(--color-input-border,#2a2d34)] text-[var(--color-canvas-ink,#f0f1f3)] outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-medium text-[var(--color-canvas-mute,#8a8f98)] mb-1.5">
                  Default Priority
                </label>
                <select
                  value={newTemplatePriority}
                  onChange={(e) => setNewTemplatePriority(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-[13px] bg-[var(--color-input-bg,#1b1c20)] border border-[var(--color-input-border,#2a2d34)] text-[var(--color-canvas-ink,#f0f1f3)] outline-none focus:border-indigo-500"
                >
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[var(--color-canvas-mute,#8a8f98)] mb-1.5">
                  Workflow Auto-Due Offset (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={newAutoDueDays}
                  onChange={(e) => setNewAutoDueDays(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-[13px] bg-[var(--color-input-bg,#1b1c20)] border border-[var(--color-input-border,#2a2d34)] text-[var(--color-canvas-ink,#f0f1f3)] outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[12px] font-medium text-[var(--color-canvas-mute,#8a8f98)]">
                  Automated Subtasks Checklist ({newSubtasks.length})
                </label>
                <button
                  type="button"
                  onClick={handleAddSubtaskInput}
                  className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <Plus size={12} /> Add Subtask
                </button>
              </div>

              <div className="space-y-2">
                {newSubtasks.map((st, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[var(--color-canvas-mute,#7c8088)] w-5 text-right">
                      {i + 1}.
                    </span>
                    <input
                      type="text"
                      value={st.title}
                      onChange={(e) => handleSubtaskChange(i, e.target.value)}
                      placeholder={`Subtask ${i + 1} title`}
                      className="flex-1 px-3 py-1.5 rounded-lg text-[13px] bg-[var(--color-input-bg,#1b1c20)] border border-[var(--color-input-border,#2a2d34)] text-[var(--color-canvas-ink,#f0f1f3)] outline-none focus:border-indigo-500"
                    />
                    {newSubtasks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSubtask(i)}
                        className="p-1.5 text-[var(--color-canvas-mute,#8a8f98)] hover:text-red-400 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-canvas-hairline,#23252a)]">
              <button
                type="button"
                onClick={() => setIsCreatingCustom(false)}
                className="px-4 py-2 text-[13px] font-medium rounded-lg text-[var(--color-canvas-mute,#8a8f98)] hover:text-[var(--color-canvas-ink,#f0f1f3)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingCustom || !newTemplateName.trim()}
                className="px-4 py-2 text-[13px] font-medium rounded-lg bg-[var(--color-btn-primary-bg,#f0f1f3)] text-[var(--color-btn-primary-fg,#0f1011)] hover:opacity-90 disabled:opacity-50"
              >
                {savingCustom ? 'Saving Template...' : 'Save Template'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            {/* Left Sidebar: Template Selection */}
            <div
              className="w-full md:w-5/12 border-b md:border-b-0 md:border-r flex flex-col overflow-hidden"
              style={{ borderColor: 'var(--color-canvas-hairline, #23252a)' }}
            >
              {/* Category Pills */}
              <div
                className="p-3 border-b flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-none"
                style={{ borderColor: 'var(--color-canvas-hairline, #23252a)' }}
              >
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-full shrink-0 transition-colors ${
                      selectedCategory === cat
                        ? 'bg-[var(--color-canvas-ink,#f0f1f3)] text-[var(--color-canvas-main,#0f1011)]'
                        : 'bg-[var(--color-canvas-hover,#1b1c20)] text-[var(--color-canvas-mute,#8a8f98)] hover:text-[var(--color-canvas-ink,#f0f1f3)]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Template List */}
              <div className="overflow-y-auto p-3 space-y-2 flex-1 scrollbar-thin">
                {loading ? (
                  <div className="py-12 text-center text-[13px] text-[var(--color-canvas-mute,#8a8f98)]">
                    Loading workflow templates...
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="py-12 text-center text-[13px] text-[var(--color-canvas-mute,#8a8f98)]">
                    No templates in this category.
                  </div>
                ) : (
                  filteredTemplates.map((tpl) => {
                    const isSelected = activeTemplate?.id === tpl.id;
                    const subtaskCount = Array.isArray(tpl.subtasks) ? tpl.subtasks.length : 0;

                    return (
                      <div
                        key={tpl.id}
                        onClick={() => {
                          setActiveTemplate(tpl);
                          setCustomTitle(tpl.name);
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-indigo-500/10 border-indigo-500/40 text-[var(--color-canvas-ink,#f0f1f3)] shadow-sm'
                            : 'bg-[var(--color-canvas-hover,#18191d)] border-[var(--color-canvas-hairline,#26282e)] text-[var(--color-canvas-body,#a1a5ad)] hover:border-[var(--color-canvas-card-border,#353842)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-[13px] font-semibold text-[var(--color-canvas-ink,#f0f1f3)]">
                            {tpl.name}
                          </h3>
                          {tpl.isPreset && (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide rounded bg-indigo-500/20 text-indigo-300 shrink-0">
                              Preset
                            </span>
                          )}
                        </div>

                        {tpl.description && (
                          <p className="text-[11px] text-[var(--color-canvas-mute,#7c8088)] line-clamp-2 mt-1">
                            {tpl.description}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--color-canvas-mute,#8a8f98)]">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-indigo-400" />
                            {subtaskCount} subtasks
                          </span>
                          {tpl.automationRules?.autoDueDays && (
                            <span className="flex items-center gap-1">
                              <Clock size={12} className="text-amber-400" />
                              +{tpl.automationRules.autoDueDays}d due
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Pane: Template Preview & Instantiate */}
            <div className="w-full md:w-7/12 p-6 flex flex-col justify-between overflow-y-auto">
              {activeTemplate ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                        {activeTemplate.category || 'Workflow'}
                      </span>
                      <span className="text-[11px] text-[var(--color-canvas-mute,#7c8088)]">•</span>
                      <span className="text-[11px] text-[var(--color-canvas-mute,#7c8088)] capitalize">
                        Priority: {activeTemplate.defaultPriority || 'medium'}
                      </span>
                    </div>

                    <h3 className="text-[18px] font-semibold text-[var(--color-canvas-ink,#f0f1f3)]">
                      {activeTemplate.name}
                    </h3>
                    <p className="text-[13px] text-[var(--color-canvas-body,#a1a5ad)] mt-1">
                      {activeTemplate.description || 'Structured task workflow.'}
                    </p>
                  </div>

                  {/* Config fields */}
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-[12px] font-medium text-[var(--color-canvas-mute,#8a8f98)] mb-1">
                        Task Title (Customize)
                      </label>
                      <input
                        type="text"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        placeholder={activeTemplate.name}
                        className="w-full px-3 py-2 rounded-lg text-[13px] bg-[var(--color-input-bg,#1b1c20)] border border-[var(--color-input-border,#2a2d34)] text-[var(--color-canvas-ink,#f0f1f3)] outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-[var(--color-canvas-mute,#8a8f98)] mb-1">
                        Target Project
                      </label>
                      <select
                        value={targetProjectId}
                        onChange={(e) => setTargetProjectId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg text-[13px] bg-[var(--color-input-bg,#1b1c20)] border border-[var(--color-input-border,#2a2d34)] text-[var(--color-canvas-ink,#f0f1f3)] outline-none focus:border-indigo-500"
                      >
                        <option value="">No Project (Standalone Workspace Task)</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Subtask Blueprint Preview */}
                  <div>
                    <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[var(--color-canvas-mute,#7c8088)] mb-2.5">
                      Subtask Checklist to Generate
                    </h4>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {(activeTemplate.subtasks || []).map((st, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[var(--color-canvas-hover,#1b1c20)] border border-[var(--color-canvas-hairline,#26282e)] text-[12.5px]"
                        >
                          <span className="w-4 h-4 rounded border border-[var(--color-canvas-mute,#7c8088)] flex items-center justify-center text-[10px] font-mono text-[var(--color-canvas-mute,#8a8f98)]">
                            {i + 1}
                          </span>
                          <span className="truncate flex-1 text-[var(--color-canvas-ink,#f0f1f3)]">
                            {st.title}
                          </span>
                          {st.estimatedHours && (
                            <span className="text-[11px] text-[var(--color-canvas-mute,#7c8088)] font-mono">
                              ~{st.estimatedHours}h
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-24 text-center text-[var(--color-canvas-mute,#8a8f98)]">
                  Select a workflow template to preview.
                </div>
              )}

              {/* Action Footer */}
              <div
                className="flex items-center justify-end gap-3 pt-6 mt-4 border-t shrink-0"
                style={{ borderColor: 'var(--color-canvas-hairline, #23252a)' }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-[13px] font-medium rounded-lg text-[var(--color-canvas-mute,#8a8f98)] hover:text-[var(--color-canvas-ink,#f0f1f3)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!activeTemplate || applying}
                  onClick={handleApply}
                  className="inline-flex items-center gap-2 px-5 py-2 text-[13px] font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all"
                >
                  <Zap size={14} />
                  {applying ? 'Instantiating...' : 'Apply Template'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
