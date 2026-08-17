import { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  AlertTriangle,
  X,
  Check,
  CheckSquare,
  Plus,
  Trash2,
  Edit2,
  ShoppingCart,
  Smartphone,
  Cloud,
  Rocket,
  Layers,
  Calendar,
} from 'lucide-react';
import { API_BASE } from '../api/config';
import ProjectIcon, { PROJECT_ICON_KEYS } from './ProjectIcon';

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

const PROMPT_TEMPLATES = [
  {
    title: 'E-Commerce Platform',
    icon: ShoppingCart,
    prompt: 'Build a modern e-commerce platform with product catalog, cart, Stripe payment checkout, and order fulfillment',
    weeks: 4,
  },
  {
    title: 'Mobile App MVP',
    icon: Smartphone,
    prompt: 'Design and launch an iOS & Android cross-platform mobile app MVP with offline sync and push notifications',
    weeks: 6,
  },
  {
    title: 'Cloud & CI/CD Migration',
    icon: Cloud,
    prompt: 'Migrate database and backend services to AWS with Docker, Kubernetes, and automated GitHub Actions CI/CD',
    weeks: 4,
  },
  {
    title: 'AI Assistant Integration',
    icon: Sparkles,
    prompt: 'Build an AI assistant integration with natural language processing, automated prompt routing, and vector search',
    weeks: 3,
  },
  {
    title: 'SaaS Product Launch',
    icon: Rocket,
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
  const [planIcon, setPlanIcon] = useState('rocket');
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
      setPlanPhases([]);
      setPlanTasks([]);
      setSelectedPhase('All');
    }
  }, [isOpen]);

  // Generate Plan Handler
  const handleGenerate = async (customPrompt = null, customWeeks = null) => {
    const text = (customPrompt || promptText).trim();
    const weeks = customWeeks || timeframeWeeks;

    if (!text) {
      setError('Please provide a project description or select a template');
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
          prompt: text,
          timeframeWeeks: weeks,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate project plan');
      }

      const { plan } = data;
      setPlanName(plan.name || 'New Project');
      setPlanDescription(plan.description || text);
      setPlanIcon(plan.icon || 'rocket');
      setPlanColor(plan.color || '#6366f1');
      setPlanPhases(plan.phases || []);

      // Flatten and prepare tasks with selection state
      const tasks = [];
      (plan.phases || []).forEach((phase, phaseIdx) => {
        (phase.tasks || []).forEach((t, taskIdx) => {
          tasks.push({
            id: `gen-${phaseIdx}-${taskIdx}-${Date.now()}`,
            phaseName: phase.name,
            phaseOrder: phase.order || phaseIdx + 1,
            title: t.title,
            description: t.description || '',
            priority: t.priority || 'medium',
            estimatedDays: t.estimatedDays || 2,
            subtasks: (t.subtasks || []).map((st, stIdx) => ({
              id: `sub-${phaseIdx}-${taskIdx}-${stIdx}`,
              title: st.title,
              selected: true,
            })),
            selected: true,
          });
        });
      });

      setPlanTasks(tasks);
      setStep('review');
    } catch (err) {
      setError(err.message || 'AI Roadmap Generation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Task & Subtask Toggle Handlers
  const handleToggleTask = (taskId) => {
    setPlanTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, selected: !t.selected } : t))
    );
  };

  const handleToggleSubtask = (taskId, subtaskId) => {
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

  const handleTaskTitleChange = (taskId, newTitle) => {
    setPlanTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, title: newTitle } : t))
    );
  };

  const handleTaskPriorityChange = (taskId, newPriority) => {
    setPlanTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, priority: newPriority } : t))
    );
  };

  const handleRemoveTask = (taskId) => {
    setPlanTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const handleAddSubtask = (taskId) => {
    setPlanTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          subtasks: [
            ...t.subtasks,
            { id: `sub-manual-${Date.now()}`, title: 'New action item', selected: true },
          ],
        };
      })
    );
  };

  const handleRemoveSubtask = (taskId, subtaskId) => {
    setPlanTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          subtasks: t.subtasks.filter((st) => st.id !== subtaskId),
        };
      })
    );
  };

  // Create Project in Database
  const handleApplyPlan = async () => {
    const selectedTasks = planTasks.filter((t) => t.selected && t.title.trim());
    if (selectedTasks.length === 0) {
      setError('Please select at least one task to create the project');
      return;
    }

    setStep('saving');
    setLoading(true);
    setError('');
    setSavingProgress('Creating project workspace...');

    try {
      // 1. Calculate Target Date based on timeframe
      const startDate = new Date();
      const targetDate = new Date();
      targetDate.setDate(startDate.getDate() + timeframeWeeks * 7);

      // 2. Create Project
      const projectRes = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Team-Id': teamId,
        },
        body: JSON.stringify({
          name: planName.trim() || 'AI Generated Project',
          description: planDescription.trim() || null,
          icon: planIcon,
          color: planColor,
          status: 'planning',
          startDate: startDate.toISOString(),
          targetDate: targetDate.toISOString(),
        }),
      });

      const projectData = await projectRes.json();
      if (!projectRes.ok || !projectData.project) {
        throw new Error(projectData.error || 'Failed to initialize project record');
      }

      const createdProject = projectData.project;

      // 3. Batch Create Tasks with Phase Labels & Subtasks
      setSavingProgress(`Populating ${selectedTasks.length} roadmap tasks & checklist items...`);

      let daysOffset = 1;
      for (let i = 0; i < selectedTasks.length; i++) {
        const task = selectedTasks[i];
        const taskDueDate = new Date();
        taskDueDate.setDate(startDate.getDate() + daysOffset);
        daysOffset += task.estimatedDays || 1;

        const subtaskPayload = task.subtasks
          .filter((st) => st.selected && st.title.trim())
          .map((st, idx) => ({
            title: st.title.trim(),
            order: (idx + 1) * 1000,
          }));

        await fetch(`${API_BASE}/tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Team-Id': teamId,
          },
          body: JSON.stringify({
            title: task.title.trim(),
            description: task.description ? `${task.description}\n\n[Phase: ${task.phaseName}]` : `[Phase: ${task.phaseName}]`,
            status: 'todo',
            priority: task.priority,
            projectId: createdProject.id,
            dueDate: taskDueDate.toISOString().split('T')[0],
            labels: [task.phaseName.toLowerCase().replace(/\s+/g, '-'), 'ai-plan'],
            subtasks: subtaskPayload.length > 0 ? subtaskPayload : undefined,
          }),
        });
      }

      // Done
      if (onProjectCreated) {
        onProjectCreated(createdProject);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save generated project');
      setStep('review');
    } finally {
      setLoading(false);
    }
  };

  const filteredTasks = useMemo(() => {
    if (selectedPhase === 'All') return planTasks;
    return planTasks.filter((t) => t.phaseName === selectedPhase);
  }, [planTasks, selectedPhase]);

  const totalSelectedTasks = planTasks.filter((t) => t.selected).length;
  const totalSelectedSubtasks = planTasks
    .filter((t) => t.selected)
    .reduce((acc, t) => acc + t.subtasks.filter((st) => st.selected).length, 0);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-modal-backdrop, rgba(0, 0, 0, 0.6))',
        backdropFilter: 'blur(5px)',
        padding: '16px',
      }}
      onClick={loading ? undefined : onClose}
    >
      <div
        className="modal-dialog-shell"
        style={{
          width: '100%',
          maxWidth: step === 'review' ? '920px' : '680px',
          backgroundColor: 'var(--color-modal-bg, #1a1b1e)',
          border: '1px solid var(--color-modal-border, #2c2f35)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.45)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
          transition: 'max-width 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-planner-title"
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--color-canvas-hairline, #2c2f35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-canvas-subtle, #141517)',
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
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)',
              }}
            >
              <Sparkles size={18} color="#ffffff" />
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
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
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
              <AlertTriangle size={15} />
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
                  Describe what you want to build or launch:
                </label>
                <textarea
                  id="ai-project-prompt"
                  rows={4}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="e.g. Build an AI-powered SaaS customer feedback analytics platform with dashboard, sentiment analysis, and email alerts..."
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-canvas-hairline, #2c2f35)',
                    backgroundColor: 'var(--color-canvas-subtle, #141517)',
                    color: 'var(--color-canvas-ink, #ffffff)',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                  autoFocus
                />
              </div>

              {/* Timeframe Selector */}
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
                  {PROMPT_TEMPLATES.map((tmpl) => {
                    const TmplIcon = tmpl.icon;
                    return (
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '13px', color: '#f0f1f3', marginBottom: '4px' }}>
                          <TmplIcon size={14} className="text-indigo-400 shrink-0" />
                          <span>{tmpl.title}</span>
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
                        <div style={{ marginTop: '8px', fontSize: '10px', color: '#6366f1', fontWeight: 600 }}>
                          {tmpl.weeks} Weeks Plan
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Project Meta Editor Banner */}
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
                        flexShrink: 0,
                      }}
                    >
                      <ProjectIcon icon={planIcon} size={22} color="#ffffff" />
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
                    {PROJECT_ICON_KEYS.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setPlanIcon(ic)}
                        style={{
                          background: planIcon === ic ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                          border: planIcon === ic ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid transparent',
                          borderRadius: '4px',
                          padding: '3px 5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ProjectIcon icon={ic} size={13} color={planIcon === ic ? planColor : 'var(--color-canvas-muted, #8a8f98)'} />
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
                  All Phases ({planTasks.length})
                </button>
                {planPhases.map((phase) => {
                  const phaseTaskCount = planTasks.filter((t) => t.phaseName === phase.name).length;
                  return (
                    <button
                      key={phase.name}
                      type="button"
                      onClick={() => setSelectedPhase(phase.name)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        border: 'none',
                        backgroundColor: selectedPhase === phase.name ? '#6366f1' : 'var(--color-canvas-subtle, #141517)',
                        color: selectedPhase === phase.name ? '#ffffff' : 'var(--color-canvas-muted, #8a8f98)',
                      }}
                    >
                      {phase.name} ({phaseTaskCount})
                    </button>
                  );
                })}
              </div>

              {/* Tasks Review Checklist List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredTasks.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      padding: '14px',
                      borderRadius: '10px',
                      backgroundColor: 'var(--color-canvas-subtle, #141517)',
                      border: t.selected
                        ? '1px solid var(--color-canvas-hairline, #2c2f35)'
                        : '1px dashed rgba(255,255,255,0.1)',
                      opacity: t.selected ? 1 : 0.5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input
                        type="checkbox"
                        checked={t.selected}
                        onChange={() => handleToggleTask(t.id)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />

                      <input
                        type="text"
                        value={t.title}
                        onChange={(e) => handleTaskTitleChange(t.id, e.target.value)}
                        style={{
                          flex: 1,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-canvas-ink, #ffffff)',
                          fontSize: '14px',
                          fontWeight: 600,
                          outline: 'none',
                        }}
                      />

                      <select
                        value={t.priority}
                        onChange={(e) => handleTaskPriorityChange(t.id, e.target.value)}
                        style={{
                          fontSize: '11px',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--color-canvas-card, #1a1b1e)',
                          color: '#a5b4fc',
                          border: '1px solid #2c2f35',
                        }}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleRemoveTask(t.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-canvas-muted, #8a8f98)',
                          cursor: 'pointer',
                          padding: 4,
                          display: 'flex',
                        }}
                        title="Remove Task"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Subtasks Checklist */}
                    {t.subtasks && t.subtasks.length > 0 && (
                      <div
                        style={{
                          marginLeft: '26px',
                          paddingLeft: '10px',
                          borderLeft: '2px solid var(--color-canvas-hairline, #2c2f35)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          marginTop: '4px',
                        }}
                      >
                        {t.subtasks.map((st) => (
                          <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="checkbox"
                              checked={st.selected}
                              onChange={() => handleToggleSubtask(t.id, st.id)}
                              style={{ width: 14, height: 14, cursor: 'pointer' }}
                            />
                            <span
                              style={{
                                fontSize: '12px',
                                color: st.selected ? 'var(--color-canvas-ink, #ffffff)' : 'var(--color-canvas-muted, #8a8f98)',
                                textDecoration: st.selected ? 'none' : 'line-through',
                                flex: 1,
                              }}
                            >
                              {st.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSubtask(t.id, st.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#64748b',
                                cursor: 'pointer',
                                padding: 2,
                                display: 'flex',
                              }}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => handleAddSubtask(t.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#6366f1',
                            fontSize: '11px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            padding: '2px 0',
                            marginTop: '2px',
                          }}
                        >
                          + Add subtask
                        </button>
                      </div>
                    )}
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
                padding: '60px 20px',
                textAlign: 'center',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  border: '3px solid #6366f1',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <h3 style={{ margin: 0, fontSize: '16px', color: '#ffffff' }}>Building Your Workspace</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-canvas-muted, #8a8f98)' }}>
                {savingProgress}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--color-canvas-hairline, #2c2f35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-canvas-subtle, #141517)',
          }}
        >
          {step === 'prompt' && (
            <>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-canvas-hairline, #2c2f35)',
                  color: 'var(--color-canvas-muted, #8a8f98)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={loading || !promptText.trim()}
                style={{
                  padding: '9px 22px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
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
                  <>
                    <Sparkles size={14} />
                    Generate Project Plan
                  </>
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
                <Check size={14} />
                Create Project with {totalSelectedTasks} Tasks
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
