import { useState, useEffect, useMemo } from 'react';
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

const ICON_PRESETS = ['🚀', '🛒', '📱', '☁️', '🎨', '⚡', '📊', '🛡️', '🎯', '💡', '📦', '✨'];

const PROMPT_TEMPLATES = [
  {
    title: '🛒 E-Commerce Platform',
    prompt: 'Build a modern e-commerce platform with product catalog, cart, Stripe payment checkout, and order fulfillment',
    weeks: 4,
  },
  {
    title: '📱 Mobile App MVP',
    prompt: 'Design and launch an iOS & Android cross-platform mobile app MVP with offline sync and push notifications',
    weeks: 6,
  },
  {
    title: '☁️ Cloud & CI/CD Migration',
    prompt: 'Migrate database and backend services to AWS with Docker, Kubernetes, and automated GitHub Actions CI/CD',
    weeks: 4,
  },
  {
    title: '✨ AI Assistant Integration',
    prompt: 'Build an AI assistant integration with natural language processing, automated prompt routing, and vector search',
    weeks: 3,
  },
  {
    title: '🚀 SaaS Product Launch',
    prompt: 'Execute a 30-day SaaS product marketing launch with landing page, analytics tracking, and social campaigns',
    weeks: 4,
  },
];

const TIMEFRAME_OPTIONS = [
  { label: '2 Weeks', weeks: 2 },
  { label: '4 Weeks (1 Mo)', weeks: 4 },
  { label: '8 Weeks (2 Mos)', weeks: 8 },
  { label: '12 Weeks (3 Mos)', weeks: 12 },
];

export default function AIProjectPlannerModal({
  isOpen,
  onClose,
  teamId,
  token,
  onProjectCreated,
}) {
  const [step, setStep] = useState('prompt'); // 'prompt' | 'review' | 'saving'
  const [promptText, setPromptText] = useState('');
  const [timeframeWeeks, setTimeframeWeeks] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Generated Plan State
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planIcon, setPlanIcon] = useState('🚀');
  const [planColor, setPlanColor] = useState('#6366f1');
  const [planPhases, setPlanPhases] = useState([]);
  const [planTasks, setPlanTasks] = useState([]);
  const [selectedPhase, setSelectedPhase] = useState('All');
  const [savingProgress, setSavingProgress] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep('prompt');
      setPromptText('');
      setTimeframeWeeks(4);
      setError('');
      setLoading(false);
      setPlanTasks([]);
      setSavingProgress('');
    }
  }, [isOpen]);

  const handleGenerate = async (customPrompt, customWeeks) => {
    const activePrompt = (customPrompt || promptText).trim();
    const activeWeeks = customWeeks || timeframeWeeks;

    if (!activePrompt) {
      setError('Please describe your project idea or select a template');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/ai/plan-project`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
        body: JSON.stringify({
          prompt: activePrompt,
          timeframeWeeks: activeWeeks,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (data.errors && data.errors[0]?.message) || 'Failed to generate project plan');
      }

      const plan = data.plan;
      setPlanName(plan.name || 'New Project');
      setPlanDescription(plan.description || '');
      setPlanIcon(plan.icon || '🚀');
      setPlanColor(plan.color || '#6366f1');
      setPlanPhases(plan.phases || ['Planning', 'UI/UX', 'Development', 'Testing', 'Deployment']);

      // Annotate tasks with UI selection and unique client-side IDs
      const mappedTasks = (plan.tasks || []).map((t, idx) => ({
        id: `task-gen-${idx}`,
        title: t.title,
        description: t.description || '',
        phase: t.phase || 'Development',
        priority: t.priority || 'medium',
        suggestedDeadlineOffsetDays: t.suggestedDeadlineOffsetDays || 7,
        labels: Array.isArray(t.labels) ? t.labels : [],
        selected: true,
        subtasks: Array.isArray(t.subtasks)
          ? t.subtasks.map((st, sidx) => ({
              id: `st-gen-${idx}-${sidx}`,
              title: st.title,
              estimatedMinutes: st.estimatedMinutes || 30,
              order: (sidx + 1) * 1000,
              selected: true,
            }))
          : [],
      }));

      setPlanTasks(mappedTasks);
      setSelectedPhase('All');
      setStep('review');
    } catch (err) {
      setError(err.message || 'An error occurred during AI project planning');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPlan = async () => {
    const selectedTasks = planTasks.filter((t) => t.selected);
    if (selectedTasks.length === 0) {
      setError('Please select at least one task to create the project');
      return;
    }

    if (!planName.trim()) {
      setError('Project name is required');
      return;
    }

    setStep('saving');
    setLoading(true);
    setError('');
    setSavingProgress('Establishing project roadmap and hierarchy...');

    try {
      const now = new Date();
      const targetDate = new Date(now.getTime() + timeframeWeeks * 7 * 24 * 60 * 60 * 1000);

      const payload = {
        name: planName.trim(),
        description: planDescription.trim() || null,
        icon: planIcon,
        color: planColor,
        startDate: now.toISOString(),
        targetDate: targetDate.toISOString(),
        tasks: selectedTasks.map((t) => {
          let taskDueDate = null;
          if (t.suggestedDeadlineOffsetDays) {
            const due = new Date(now.getTime() + t.suggestedDeadlineOffsetDays * 24 * 60 * 60 * 1000);
            taskDueDate = due.toISOString();
          }

          const activeSubtasks = (t.subtasks || []).filter((st) => st.selected);

          return {
            title: t.title.trim(),
            description: t.description ? t.description.trim() : null,
            priority: t.priority || 'medium',
            status: 'todo',
            dueDate: taskDueDate,
            labels: t.labels || [],
            subtasks: activeSubtasks.map((st, sidx) => ({
              title: st.title.trim(),
              estimatedMinutes: st.estimatedMinutes || 30,
              order: (sidx + 1) * 1000,
            })),
          };
        }),
      };

      setSavingProgress('Persisting project, tasks, and checklists...');

      const res = await fetch(`${API_BASE}/ai/apply-project-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (data.errors && data.errors[0]?.message) || 'Failed to create project from plan');
      }

      if (onProjectCreated) {
        onProjectCreated(data.project);
      }

      onClose();
    } catch (err) {
      setError(err.message || 'Failed to apply project plan');
      setStep('review');
    } finally {
      setLoading(false);
    }
  };

  const toggleTaskSelection = (taskId) => {
    setPlanTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, selected: !t.selected } : t))
    );
  };

  const toggleSubtaskSelection = (taskId, subtaskId) => {
    setPlanTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          subtasks: t.subtasks.map((st) =>
            st.id === subtaskId ? { ...st, selected: !st.selected } : st
          ),
        };
      })
    );
  };

  const updateTaskTitle = (taskId, newTitle) => {
    setPlanTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, title: newTitle } : t))
    );
  };

  const updateTaskPriority = (taskId, newPriority) => {
    setPlanTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, priority: newPriority } : t))
    );
  };

  const filteredTasks = useMemo(() => {
    if (selectedPhase === 'All') return planTasks;
    return planTasks.filter((t) => t.phase === selectedPhase);
  }, [planTasks, selectedPhase]);

  const totalSelectedTasks = planTasks.filter((t) => t.selected).length;
  const totalSelectedSubtasks = planTasks
    .filter((t) => t.selected)
    .reduce((sum, t) => sum + (t.subtasks || []).filter((st) => st.selected).length, 0);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-planner-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: step === 'review' ? '860px' : '640px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--color-canvas-card, #1c1d20)',
          borderRadius: '16px',
          border: '1px solid var(--color-canvas-hairline, #2c2f35)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1)',
          overflow: 'hidden',
          transition: 'max-width 0.25s ease',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-canvas-hairline, #2c2f35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, transparent 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)',
              }}
            >
              ✨
            </span>
            <div>
              <h2
                id="ai-planner-title"
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  margin: 0,
                  color: 'var(--color-canvas-ink, #ffffff)',
                  letterSpacing: '-0.02em',
                }}
              >
                AI Project Planner
              </h2>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--color-canvas-muted, #8a8f98)',
                  margin: '2px 0 0 0',
                }}
              >
                {step === 'prompt'
                  ? 'Generate comprehensive project roadmaps & task hierarchies from natural language'
                  : 'Review, customize, and approve your generated project blueprint'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-canvas-muted, #8a8f98)',
              fontSize: '20px',
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '13px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {step === 'prompt' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Natural Language Input */}
              <div>
                <label
                  htmlFor="ai-project-prompt"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-canvas-ink, #ffffff)',
                    marginBottom: '8px',
                  }}
                >
                  What do you want to build or achieve?
                </label>
                <textarea
                  id="ai-project-prompt"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="e.g. Build an e-commerce website with Stripe payments, product catalog, cart drawer, and order tracking..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--color-canvas-subtle, #141517)',
                    border: '1px solid var(--color-canvas-hairline, #2c2f35)',
                    color: 'var(--color-canvas-ink, #ffffff)',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Timeframe Presets */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-canvas-ink, #ffffff)',
                    marginBottom: '8px',
                  }}
                >
                  Target Project Duration
                </label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {TIMEFRAME_OPTIONS.map((opt) => (
                    <button
                      key={opt.weeks}
                      type="button"
                      onClick={() => setTimeframeWeeks(opt.weeks)}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        border:
                          timeframeWeeks === opt.weeks
                            ? '1px solid #6366f1'
                            : '1px solid var(--color-canvas-hairline, #2c2f35)',
                        backgroundColor:
                          timeframeWeeks === opt.weeks
                            ? 'rgba(99, 102, 241, 0.18)'
                            : 'var(--color-canvas-subtle, #141517)',
                        color:
                          timeframeWeeks === opt.weeks
                            ? '#a5b4fc'
                            : 'var(--color-canvas-muted, #8a8f98)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Blueprint Templates */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--color-canvas-ink, #ffffff)',
                    marginBottom: '8px',
                  }}
                >
                  Or start with a proven template
                </label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '10px',
                  }}
                >
                  {PROMPT_TEMPLATES.map((tmpl) => (
                    <div
                      key={tmpl.title}
                      onClick={() => {
                        setPromptText(tmpl.prompt);
                        setTimeframeWeeks(tmpl.weeks);
                        handleGenerate(tmpl.prompt, tmpl.weeks);
                      }}
                      style={{
                        padding: '12px',
                        borderRadius: '10px',
                        backgroundColor: 'var(--color-canvas-subtle, #141517)',
                        border: '1px solid var(--color-canvas-hairline, #2c2f35)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#6366f1';
                        e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.08)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-canvas-hairline, #2c2f35)';
                        e.currentTarget.style.backgroundColor = 'var(--color-canvas-subtle, #141517)';
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '13px', color: '#f0f1f3', marginBottom: '4px' }}>
                        {tmpl.title}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-canvas-muted, #8a8f98)',
                          lineHeight: 1.4,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {tmpl.prompt}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Project Meta Card */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  backgroundColor: 'var(--color-canvas-subtle, #141517)',
                  border: '1px solid var(--color-canvas-hairline, #2c2f35)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Icon & Color */}
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '10px',
                        backgroundColor: planColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '22px',
                        flexShrink: 0,
                      }}
                    >
                      {planIcon}
                    </span>
                  </div>

                  {/* Project Name & Description Input */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      type="text"
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      placeholder="Project Name"
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--color-canvas-hairline, #2c2f35)',
                        padding: '4px 0',
                        fontSize: '16px',
                        fontWeight: 700,
                        color: 'var(--color-canvas-ink, #ffffff)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <input
                      type="text"
                      value={planDescription}
                      onChange={(e) => setPlanDescription(e.target.value)}
                      placeholder="Brief Project Objective"
                      style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        padding: '4px 0',
                        fontSize: '12px',
                        color: 'var(--color-canvas-muted, #8a8f98)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {/* Customizers: Colors & Icons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--color-canvas-hairline, #2c2f35)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-canvas-muted, #8a8f98)', marginRight: '4px' }}>Icon:</span>
                    {ICON_PRESETS.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setPlanIcon(ic)}
                        style={{
                          background: planIcon === ic ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                          border: planIcon === ic ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid transparent',
                          borderRadius: '4px',
                          padding: '2px 4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-canvas-muted, #8a8f98)', marginRight: '4px' }}>Color:</span>
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setPlanColor(c)}
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          backgroundColor: c,
                          border: planColor === c ? '2px solid #ffffff' : 'none',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Phase Navigation Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedPhase('All')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: selectedPhase === 'All' ? '#6366f1' : 'var(--color-canvas-subtle, #141517)',
                    color: selectedPhase === 'All' ? '#ffffff' : 'var(--color-canvas-muted, #8a8f98)',
                  }}
                >
                  All ({planTasks.length})
                </button>
                {planPhases.map((phase) => {
                  const count = planTasks.filter((t) => t.phase === phase).length;
                  return (
                    <button
                      key={phase}
                      type="button"
                      onClick={() => setSelectedPhase(phase)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: 'none',
                        backgroundColor: selectedPhase === phase ? '#6366f1' : 'var(--color-canvas-subtle, #141517)',
                        color: selectedPhase === phase ? '#ffffff' : 'var(--color-canvas-muted, #8a8f98)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {phase} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Task Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '10px',
                      backgroundColor: task.selected
                        ? 'var(--color-canvas-subtle, #141517)'
                        : 'rgba(255, 255, 255, 0.02)',
                      border: task.selected
                        ? '1px solid var(--color-canvas-hairline, #2c2f35)'
                        : '1px dashed rgba(255, 255, 255, 0.1)',
                      opacity: task.selected ? 1 : 0.6,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <input
                        type="checkbox"
                        checked={task.selected}
                        onChange={() => toggleTaskSelection(task.id)}
                        style={{ marginTop: '4px', cursor: 'pointer', accentColor: '#6366f1' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            value={task.title}
                            onChange={(e) => updateTaskTitle(task.id, e.target.value)}
                            disabled={!task.selected}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--color-canvas-ink, #ffffff)',
                              fontSize: '14px',
                              fontWeight: 600,
                              outline: 'none',
                              flex: 1,
                            }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                textTransform: 'uppercase',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(99, 102, 241, 0.15)',
                                color: '#a5b4fc',
                                fontWeight: 700,
                              }}
                            >
                              {task.phase}
                            </span>
                            <select
                              value={task.priority}
                              onChange={(e) => updateTaskPriority(task.id, e.target.value)}
                              disabled={!task.selected}
                              style={{
                                background: 'var(--color-canvas-card, #1c1d20)',
                                border: '1px solid var(--color-canvas-hairline, #2c2f35)',
                                color: 'var(--color-canvas-ink, #ffffff)',
                                fontSize: '11px',
                                borderRadius: '4px',
                                padding: '2px 4px',
                                outline: 'none',
                              }}
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                              <option value="urgent">Urgent</option>
                            </select>
                          </div>
                        </div>

                        {task.description && (
                          <p
                            style={{
                              fontSize: '12px',
                              color: 'var(--color-canvas-muted, #8a8f98)',
                              margin: '4px 0 8px 0',
                              lineHeight: 1.4,
                            }}
                          >
                            {task.description}
                          </p>
                        )}

                        {/* Nested Subtasks */}
                        {Array.isArray(task.subtasks) && task.subtasks.length > 0 && (
                          <div
                            style={{
                              marginTop: '8px',
                              paddingLeft: '12px',
                              borderLeft: '2px solid var(--color-canvas-hairline, #2c2f35)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                          >
                            {task.subtasks.map((st) => (
                              <label
                                key={st.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  fontSize: '12px',
                                  color: st.selected ? 'var(--color-canvas-ink, #c8ccd2)' : '#6b7280',
                                  cursor: task.selected ? 'pointer' : 'default',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={st.selected && task.selected}
                                  disabled={!task.selected}
                                  onChange={() => toggleSubtaskSelection(task.id, st.id)}
                                  style={{ cursor: 'pointer', accentColor: '#6366f1' }}
                                />
                                <span>{st.title}</span>
                                <span style={{ fontSize: '10px', color: '#6b7280' }}>
                                  ({st.estimatedMinutes}m)
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'saving' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 24px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  border: '3px solid rgba(99, 102, 241, 0.2)',
                  borderTopColor: '#6366f1',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  marginBottom: '20px',
                }}
              />
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                {savingProgress || 'Building project structure...'}
              </h3>
              <p style={{ fontSize: '13px', color: '#8a8f98', marginTop: '6px' }}>
                Executing atomic database transaction with RBAC & team permissions
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--color-canvas-hairline, #2c2f35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-canvas-subtle, #141517)',
          }}
        >
          {step === 'prompt' && (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-canvas-hairline, #2c2f35)',
                  color: 'var(--color-canvas-ink, #ffffff)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={loading || !promptText.trim()}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  border: 'none',
                  color: '#ffffff',
                  cursor: loading || !promptText.trim() ? 'not-allowed' : 'pointer',
                  opacity: loading || !promptText.trim() ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                }}
              >
                {loading ? (
                  <>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        border: '2px solid #ffffff',
                        borderTopColor: 'transparent',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'spin 0.8s linear infinite',
                      }}
                    />
                    Generating Roadmap...
                  </>
                ) : (
                  <>✨ Generate Project Plan</>
                )}
              </button>
            </>
          )}

          {step === 'review' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setStep('prompt')}
                  disabled={loading}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 500,
                    backgroundColor: 'transparent',
                    border: '1px solid var(--color-canvas-hairline, #2c2f35)',
                    color: 'var(--color-canvas-ink, #ffffff)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  ← Modify Prompt
                </button>
                <span style={{ fontSize: '12px', color: 'var(--color-canvas-muted, #8a8f98)' }}>
                  {totalSelectedTasks} tasks · {totalSelectedSubtasks} subtasks
                </span>
              </div>

              <button
                type="button"
                onClick={handleApplyPlan}
                disabled={loading || totalSelectedTasks === 0}
                style={{
                  padding: '9px 22px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  color: '#ffffff',
                  cursor: loading || totalSelectedTasks === 0 ? 'not-allowed' : 'pointer',
                  opacity: loading || totalSelectedTasks === 0 ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                }}
              >
                ✓ Create Project with {totalSelectedTasks} Tasks
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
