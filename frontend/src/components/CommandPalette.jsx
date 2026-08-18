import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  Search,
  Sparkles,
  Plus,
  FolderPlus,
  Kanban,
  ListTodo,
  Calendar,
  BarChart3,
  Settings,
  Moon,
  Sun,
  UserPlus,
  Layers,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  Command,
  X,
  Building2,
  Folder,
  Tag,
  Bookmark,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { API_URL } from '../api/config';
import ProjectIcon from './ProjectIcon';

function useDebounce(value, delay = 150) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}

export default function CommandPalette({
  isOpen,
  onClose,
  projects = [],
  teams = [],
  activeTeam = null,
  userRole = 'member',
  onSelectTask,
  onSelectProject,
  onTeamSwitch,
  onCreateTask,
  onCreateWithAI,
  onCreateProject,
  onOpenAIPlanner,
  onOpenTemplates,
  onNavigateView,
  onOpenSettings,
  onOpenGlobalSearch,
  views = [],
  onSelectView,
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchedTasks, setSearchedTasks] = useState([]);
  const [isSearchingTasks, setIsSearchingTasks] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const debouncedQuery = useDebounce(query, 150);

  // Autofocus input on open & reset state
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setSearchedTasks([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Fetch matching tasks when query changes
  useEffect(() => {
    if (!isOpen) return;

    const trimmed = debouncedQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      setSearchedTasks([]);
      setIsSearchingTasks(false);
      return;
    }

    let isMounted = true;
    setIsSearchingTasks(true);

    const token = localStorage.getItem('token');
    const teamId = activeTeam?.id || localStorage.getItem('teamId');
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(teamId ? { 'X-Team-Id': teamId } : {}),
    };

    axios
      .get(`${API_URL}/search`, {
        params: { q: trimmed, limit: 6 },
        headers,
      })
      .then((res) => {
        if (isMounted) {
          const results = Array.isArray(res.data)
            ? res.data
            : res.data?.tasks || res.data?.results || [];
          setSearchedTasks(results.slice(0, 6));
        }
      })
      .catch(() => {
        if (isMounted) setSearchedTasks([]);
      })
      .finally(() => {
        if (isMounted) setIsSearchingTasks(false);
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery, isOpen, activeTeam]);

  // Helper to toggle theme
  const handleToggleTheme = useCallback(() => {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
    onClose();
  }, [onClose]);

  // Define static command registry with role constraints
  const staticActions = useMemo(() => {
    const isElevated = userRole === 'owner' || userRole === 'admin';

    const actions = [
      {
        id: 'action-create-task',
        title: 'Create New Task',
        description: 'Add a new task to the current workspace',
        category: 'Actions',
        icon: Plus,
        shortcut: 'C',
        action: () => {
          onClose();
          onCreateTask?.('todo');
        },
      },
      {
        id: 'action-create-ai',
        title: 'Create with TaskFlow AI',
        description: 'Generate structured tasks and subtasks from natural prompt',
        category: 'Actions',
        icon: Sparkles,
        iconColor: '#8b5cf6',
        shortcut: 'A',
        action: () => {
          onClose();
          onCreateWithAI?.();
        },
      },
      {
        id: 'action-create-project',
        title: 'Create New Project',
        description: 'Set up a new workspace board or sprint project',
        category: 'Actions',
        icon: FolderPlus,
        shortcut: 'P',
        action: () => {
          onClose();
          onCreateProject?.();
        },
      },
      {
        id: 'action-ai-planner',
        title: 'AI Project Planner',
        description: 'Generate full multi-phase project blueprint with Gemini',
        category: 'Actions',
        icon: Sparkles,
        iconColor: '#ec4899',
        action: () => {
          onClose();
          onOpenAIPlanner?.();
        },
      },
      {
        id: 'action-templates',
        title: 'Task Templates & Workflows',
        description: 'Browse preset engineering, design, and product task workflows',
        category: 'Actions',
        icon: Zap,
        iconColor: '#6366f1',
        action: () => {
          onClose();
          onOpenTemplates?.();
        },
      },
      {
        id: 'action-toggle-theme',
        title: 'Toggle Dark / Light Theme',
        description: 'Switch between light canvas and sleek dark mode',
        category: 'Actions',
        icon: Moon,
        shortcut: 'T',
        action: handleToggleTheme,
      },
    ];

    if (isElevated) {
      actions.push({
        id: 'action-invite-member',
        title: 'Invite Team Member',
        description: 'Invite a collaborator to your team workspace',
        category: 'Actions',
        icon: UserPlus,
        action: () => {
          onClose();
          onOpenSettings?.('members');
        },
      });
    }

    actions.push({
      id: 'action-settings',
      title: 'Workspace Settings',
      description: 'Manage team profile, integrations, and preferences',
      category: 'Actions',
      icon: Settings,
      shortcut: 'S',
      action: () => {
        onClose();
        onOpenSettings?.('general');
      },
    });

    return actions;
  }, [
    userRole,
    onCreateTask,
    onCreateWithAI,
    onCreateProject,
    onOpenAIPlanner,
    handleToggleTheme,
    onOpenSettings,
    onClose,
  ]);

  const staticNavigation = useMemo(() => {
    return [
      {
        id: 'nav-kanban',
        title: 'Kanban Board',
        description: 'Drag-and-drop task boards categorized by status',
        category: 'Navigation',
        icon: Kanban,
        shortcut: '1',
        action: () => {
          onClose();
          onNavigateView?.('kanban');
        },
      },
      {
        id: 'nav-list',
        title: 'List View',
        description: 'Compact tabular view with search, filter, and sorting',
        category: 'Navigation',
        icon: ListTodo,
        shortcut: '2',
        action: () => {
          onClose();
          onNavigateView?.('list');
        },
      },
      {
        id: 'nav-calendar',
        title: 'Calendar View',
        description: 'Schedule and manage deadlines across calendar grid',
        category: 'Navigation',
        icon: Calendar,
        shortcut: '3',
        action: () => {
          onClose();
          onNavigateView?.('calendar');
        },
      },
      {
        id: 'nav-analytics',
        title: 'Productivity Analytics',
        description: 'Velocity trends, completion rates, and workload distribution',
        category: 'Navigation',
        icon: BarChart3,
        shortcut: '4',
        action: () => {
          onClose();
          onNavigateView?.('analytics');
        },
      },
    ];
  }, [onClose, onNavigateView]);

  // Combine and filter items based on query
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();

    // 1. Filter actions
    const matchedActions = staticActions.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );

    // 2. Filter navigation
    const matchedNav = staticNavigation.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );

    // 3. Filter projects
    const matchedProjects = (projects || [])
      .filter((p) => p.name && p.name.toLowerCase().includes(q))
      .map((p) => ({
        id: `project-${p.id}`,
        title: p.name,
        description: p.description || `${p._count?.tasks || 0} active tasks`,
        category: 'Projects',
        icon: Folder,
        color: p.color || '#6366f1',
        projectIcon: p.icon,
        rawProject: p,
        action: () => {
          onClose();
          onSelectProject?.(p.id);
        },
      }));

    // 4. Tasks from backend search or query
    const matchedTasks = searchedTasks.map((t) => ({
      id: `task-${t.id}`,
      title: t.title,
      description: t.project?.name ? `In project: ${t.project.name}` : `Status: ${t.status || 'todo'}`,
      category: 'Tasks',
      icon: CheckCircle2,
      status: t.status,
      priority: t.priority,
      rawTask: t,
      action: () => {
        onClose();
        onSelectTask?.(t.id);
      },
    }));

    // 5. Saved Views (Phase 44)
    const matchedViews = (views || [])
      .filter((v) => v.name && v.name.toLowerCase().includes(q))
      .map((v) => ({
        id: `view-${v.id}`,
        title: v.name,
        description: v.description || 'Saved custom filter view',
        category: 'Saved Views',
        icon: Bookmark,
        customIcon: v.icon,
        color: v.color || '#6366f1',
        action: () => {
          onClose();
          onSelectView?.(v);
        },
      }));

    // 6. Workspaces / Teams
    const matchedTeams = (teams || [])
      .filter((tm) => tm.name && tm.name.toLowerCase().includes(q))
      .map((tm) => ({
        id: `team-${tm.id}`,
        title: tm.name,
        description: tm.id === activeTeam?.id ? 'Current active workspace' : 'Switch to this team workspace',
        category: 'Workspaces',
        icon: Building2,
        isActive: tm.id === activeTeam?.id,
        action: () => {
          onClose();
          if (tm.id !== activeTeam?.id) {
            onTeamSwitch?.(tm);
          }
        },
      }));

    const groups = [];

    if (matchedActions.length > 0) {
      groups.push({ category: 'Actions', items: matchedActions });
    }
    if (matchedNav.length > 0) {
      groups.push({ category: 'Navigation', items: matchedNav });
    }
    if (matchedProjects.length > 0) {
      groups.push({ category: 'Projects', items: matchedProjects });
    }
    if (matchedViews.length > 0) {
      groups.push({ category: 'Saved Views', items: matchedViews });
    }
    if (matchedTasks.length > 0) {
      groups.push({ category: 'Tasks', items: matchedTasks });
    }
    if (matchedTeams.length > 0 && (!q || teams.length > 1)) {
      groups.push({ category: 'Workspaces', items: matchedTeams });
    }

    return groups;
  }, [
    query,
    staticActions,
    staticNavigation,
    projects,
    searchedTasks,
    teams,
    activeTeam,
    onClose,
    onSelectProject,
    onSelectTask,
    onTeamSwitch,
  ]);

  // Flatten items for linear index navigation
  const flatItems = useMemo(() => {
    return filteredGroups.flatMap((g) => g.items);
  }, [filteredGroups]);

  // Keep selected index within bounds
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, selectedIndex]);

  // Keyboard navigation inside the palette
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (flatItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % flatItems.length);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const currentItem = flatItems[selectedIndex];
      if (currentItem && typeof currentItem.action === 'function') {
        currentItem.action();
      }
      return;
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector('[data-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  let globalItemIndex = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Universal Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 120ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl shadow-2xl border flex flex-col"
        style={{
          background: 'var(--color-canvas-card, #141518)',
          borderColor: 'var(--color-canvas-card-border, #2a2d34)',
          color: 'var(--color-canvas-ink, #f0f1f3)',
          maxHeight: 'min(580px, 80vh)',
        }}
      >
        {/* Search Header */}
        <div
          className="flex items-center gap-3 px-4 py-3.5 border-b shrink-0"
          style={{ borderColor: 'var(--color-canvas-hairline, #23252a)' }}
        >
          <Search size={18} className="shrink-0 text-[var(--color-canvas-mute,#8a8f98)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, task, project, or search query..."
            className="w-full bg-transparent text-[14px] sm:text-[15px] outline-none placeholder:text-[var(--color-canvas-mute,#7c8088)]"
            style={{ color: 'var(--color-canvas-ink, #f0f1f3)' }}
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-[var(--color-canvas-mute,#8a8f98)] hover:text-[var(--color-canvas-ink,#f0f1f3)] rounded"
              title="Clear input"
            >
              <X size={15} />
            </button>
          ) : (
            <span
              className="px-1.5 py-0.5 text-[11px] font-mono rounded border uppercase shrink-0"
              style={{
                background: 'var(--color-canvas-hover, #1b1c20)',
                borderColor: 'var(--color-canvas-hairline, #2a2d34)',
                color: 'var(--color-canvas-mute, #8a8f98)',
              }}
            >
              ESC
            </span>
          )}
        </div>

        {/* Command & Results List */}
        <div
          ref={listRef}
          className="overflow-y-auto p-2 flex-1 scrollbar-thin"
          style={{ overscrollBehavior: 'contain' }}
        >
          {flatItems.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full flex items-center justify-center bg-[var(--color-canvas-hover,#1b1c20)] text-[var(--color-canvas-mute,#8a8f98)]">
                <Search size={20} />
              </div>
              <p className="text-[14px] font-medium text-[var(--color-canvas-ink,#f0f1f3)]">
                No matching commands or tasks found
              </p>
              <p className="text-[12px] text-[var(--color-canvas-mute,#8a8f98)] mt-1">
                Try searching for a project name, task title, or standard action like "Create Task".
              </p>
              {onOpenGlobalSearch && query.trim() && (
                <button
                  onClick={() => {
                    onClose();
                    onOpenGlobalSearch?.(query.trim());
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-md bg-[var(--color-btn-primary-bg,#f0f1f3)] text-[var(--color-btn-primary-fg,#0f1011)] hover:opacity-90"
                >
                  <Sparkles size={13} />
                  Open Deep Search for "{query.trim()}"
                </button>
              )}
            </div>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.category} className="mb-2 last:mb-0">
                <div
                  className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-canvas-mute,#7c8088)]"
                >
                  {group.category}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    globalItemIndex++;
                    const isSelected = globalItemIndex === selectedIndex;
                    const ItemIcon = item.icon;

                    return (
                      <div
                        key={item.id}
                        data-selected={isSelected}
                        onClick={item.action}
                        onMouseEnter={() => setSelectedIndex(globalItemIndex)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-[13px] ${
                          isSelected
                            ? 'bg-[var(--color-canvas-hover,#1b1c20)] text-[var(--color-canvas-ink,#f0f1f3)] font-medium shadow-sm'
                            : 'text-[var(--color-canvas-body,#a1a5ad)] hover:bg-[var(--color-canvas-hover,#1b1c20)] hover:text-[var(--color-canvas-ink,#f0f1f3)]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <span
                            className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                            style={{
                              background: isSelected
                                ? 'var(--color-canvas-card, #141518)'
                                : 'var(--color-canvas-hover, #1b1c20)',
                              color: item.iconColor || item.color || 'inherit',
                            }}
                          >
                            {item.projectIcon ? (
                              <ProjectIcon icon={item.projectIcon} color={item.color} size={14} />
                            ) : (
                              <ItemIcon size={14} />
                            )}
                          </span>

                          <div className="truncate">
                            <span className="truncate block font-medium">
                              {item.title}
                            </span>
                            {item.description && (
                              <span className="text-[11px] text-[var(--color-canvas-mute,#7c8088)] truncate block font-normal">
                                {item.description}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.shortcut && (
                            <span
                              className="px-1.5 py-0.5 text-[10px] font-mono rounded border uppercase"
                              style={{
                                background: 'var(--color-canvas-card, #141518)',
                                borderColor: 'var(--color-canvas-hairline, #2a2d34)',
                                color: 'var(--color-canvas-mute, #8a8f98)',
                              }}
                            >
                              {item.shortcut}
                            </span>
                          )}

                          {isSelected && (
                            <span className="text-[11px] font-mono text-[var(--color-canvas-mute,#8a8f98)] flex items-center gap-0.5">
                              ↵
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Navigation Hints */}
        <div
          className="px-4 py-2.5 border-t flex items-center justify-between text-[11px] text-[var(--color-canvas-mute,#7c8088)] shrink-0 bg-[var(--color-canvas-hover,#111215)]"
          style={{ borderColor: 'var(--color-canvas-hairline, #23252a)' }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border text-[10px] font-mono bg-[var(--color-canvas-card,#141518)] border-[var(--color-canvas-hairline,#2a2d34)]">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 rounded border text-[10px] font-mono bg-[var(--color-canvas-card,#141518)] border-[var(--color-canvas-hairline,#2a2d34)]">
                ↓
              </kbd>
              Navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border text-[10px] font-mono bg-[var(--color-canvas-card,#141518)] border-[var(--color-canvas-hairline,#2a2d34)]">
                ↵
              </kbd>
              Select
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border text-[10px] font-mono bg-[var(--color-canvas-card,#141518)] border-[var(--color-canvas-hairline,#2a2d34)]">
                Esc
              </kbd>
              Close
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Command size={11} />
            <span>TaskFlow Universal Palette</span>
          </div>
        </div>
      </div>
    </div>
  );
}
