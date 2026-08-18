---
name: taskflow-ui
description: >-
  Comprehensive UI engineering guide and design system reference for TaskFlow.
  Use when building, refactoring, styling, or verifying UI components, pages,
  modals, drawers, and AI interaction surfaces in the TaskFlow frontend.
---

# TaskFlow UI Engineering Skill

This skill provides practical guidelines, design system tokens, component patterns, responsive rules, and verification procedures for engineering UI in TaskFlow.

> **Source of Truth**: Refer to [`TaskFlow_UI_UX_Design_Specification.md`](file:///home/brexc/projects/taskflow/TaskFlow_UI_UX_Design_Specification.md) and [`DESIGN.md`](file:///home/brexc/projects/taskflow/DESIGN.md) for full design rationale and specification details.

---

## 1. Product & Design Philosophy

TaskFlow is a **clean, approachable productivity workspace with intelligent assistance built directly into the workflow**.

### Core Tenets
1. **Clean & Functional Over Decorative**: Stark ink-on-canvas surfaces, balanced spacing, and subtle borders. Avoid excessive gradients, heavy glassmorphism, or gratuitous animations.
2. **Contextual AI, Not a Generic Chatbot**: TaskFlow AI operates within authorized workspace contexts. AI suggests, proposes, and formats; the user reviews, confirms, and executes.
3. **Approachable for Freelancers, Robust for Small Teams**: Plain, intuitive terminology (Tasks, Projects, Workspaces, Deadlines) without complex enterprise clutter.
4. **Token-Driven Consistency**: All components must consume predefined CSS variables and Tailwind theme tokens rather than ad-hoc inline styles.

---

## 2. Design Tokens & CSS Variable System

TaskFlow uses a dual-mode (Light & Dark) CSS variable system defined in [`frontend/src/index.css`](file:///home/brexc/projects/taskflow/frontend/src/index.css).

### Color Tokens

| Semantic Role | Light Mode Variable | Dark Mode Variable | Usage |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `var(--color-canvas-bg, #f6f7f8)` | `var(--color-canvas-bg, #090a0b)` | Page root background |
| **Main Surface** | `var(--color-canvas-main, #ffffff)` | `var(--color-canvas-main, #0d0e11)` | Content area background |
| **Card Surface** | `var(--color-canvas-card, #ffffff)` | `var(--color-canvas-card, #141518)` | Panels, cards, containers |
| **Card Border** | `var(--color-canvas-card-border, #ebebeb)` | `var(--color-canvas-card-border, #23252a)` | Container outlines |
| **Hover Surface** | `var(--color-canvas-hover, #f5f5f5)` | `var(--color-canvas-hover, #1b1c20)` | Interactive row/button hover |
| **Primary Ink (Text)** | `var(--color-canvas-ink, #0f1011)` | `var(--color-canvas-ink, #f0f1f3)` | Headings, primary text |
| **Body Text** | `var(--color-canvas-body, #4d4d4d)` | `var(--color-canvas-body, #a1a5ad)` | Descriptions, regular text |
| **Muted Text** | `var(--color-canvas-mute, #8a8f98)` | `var(--color-canvas-mute, #7c8088)` | Timestamps, secondary labels |
| **Hairline Borders** | `var(--color-canvas-hairline, #ebebeb)` | `var(--color-canvas-hairline, #222428)` | Subtle dividers and lines |
| **Primary Button BG** | `var(--color-btn-primary-bg, #171717)` | `var(--color-btn-primary-bg, #f0f1f3)` | Main CTAs |
| **Primary Button FG** | `var(--color-btn-primary-fg, #ffffff)` | `var(--color-btn-primary-fg, #0f1011)` | Main CTA text/icon |
| **Input Background** | `var(--color-input-bg, #ffffff)` | `var(--color-input-bg, #141518)` | Text inputs, selects |
| **Input Border** | `var(--color-input-border, #ebebeb)` | `var(--color-input-border, #26282d)` | Form field borders |
| **Focus Ring** | `var(--focus-outline-color, #0f1011)` | `var(--focus-outline-color, #58a6ff)` | Keyboard focus outline |

### Typography Scale
- **Font Sans**: `'Inter', system-ui, -apple-system, sans-serif`
- **Font Mono**: `'JetBrains Mono', ui-monospace, monospace` (used for IDs, avatars, shortcuts)

| Role | Font Size | Weight | Line Height | Letter Spacing |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | 32px – 40px | 600 | 40px – 48px | -1.2px |
| **Page Heading (H1)** | 24px – 28px | 600 | 32px | -0.8px |
| **Section Heading (H2)**| 18px – 20px | 600 | 28px | -0.4px |
| **Subheading (H3)** | 15px – 16px | 600 | 24px | -0.2px |
| **Body (Default)** | 14px – 15px | 400 / 500 | 20px – 22px | normal |
| **Small / Metadata** | 12px – 13px | 400 / 500 | 18px | normal |
| **Badge / Caption** | 10px – 11px | 600 | 14px | +0.02em (uppercase) |

### Spacing & Radius Tokens
- **Spacing Scale**: 4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px
- **Border Radii**:
  - `var(--radius-xs)`: 4px (micro badges, color tags)
  - `var(--radius-sm)`: 6px (buttons, small chips)
  - `var(--radius-md)`: 8px (form inputs, tooltips)
  - `var(--radius-lg)`: 12px (cards, dropdown menus)
  - `var(--radius-xl)`: 16px (drawers, modals, hero panels)
  - `var(--radius-pill)`: 9999px (avatars, status pills)

---

## 3. Component Construction Standards

### 1. Buttons
- **Primary Action**: Solid dark background (light in dark mode), high contrast, single primary CTA per view section.
- **Secondary / Outline**: Bordered with `var(--color-btn-secondary-border)`, subtle hover background.
- **Danger Action**: Soft red background (`var(--color-btn-danger-bg)`), red text (`var(--color-btn-danger-fg)`).
- **Ghost / Icon Button**: Transparent background, `width: 32px; height: 32px; border-radius: var(--radius-sm);` with hover highlight.

### 2. Status & Priority Badges
Never rely on color alone. Always pair semantic colors with clear text labels and icons/indicators.

```jsx
// Example Priority Badge Pattern
function PriorityBadge({ priority }) {
  const p = priority?.toLowerCase() || 'medium';
  const config = {
    urgent: { label: 'Urgent', color: '#e5484d', bg: 'rgba(229, 72, 77, 0.12)', border: 'rgba(229, 72, 77, 0.3)' },
    high:   { label: 'High',   color: '#f76808', bg: 'rgba(247, 104, 8, 0.12)', border: 'rgba(247, 104, 8, 0.3)' },
    medium: { label: 'Med',    color: '#0070f3', bg: 'rgba(0, 112, 243, 0.10)', border: 'rgba(0, 112, 243, 0.25)' },
    low:    { label: 'Low',    color: '#8a8f98', bg: 'rgba(138, 143, 152, 0.10)', border: 'rgba(138, 143, 152, 0.2)' },
  }[p] || { label: 'Med', color: '#0070f3', bg: 'rgba(0, 112, 243, 0.10)', border: 'rgba(0, 112, 243, 0.25)' };

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase shrink-0"
      style={{ color: config.color, background: config.bg, border: `1px solid ${config.border}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: config.color }} />
      {config.label}
    </span>
  );
}
```

### 3. Modals & Slide-Over Drawers
- **Backdrop**: Semi-transparent dark overlay (`rgba(0, 0, 0, 0.5)` with `backdrop-filter: blur(2px)`).
- **Drawer Behavior**: Slide in from right edge (`transform: translateX(0)`), fixed header with title & close button (`Esc` key bound), scrollable content body, fixed action footer.
- **Focus Management**: Trap focus within the dialog, restore focus on close.

---

## 4. Reusable Existing Components Registry

Always reuse existing core components before authoring new ones:

| Component | File Path | Purpose |
| :--- | :--- | :--- |
| `TaskDetailDrawer` | [`frontend/src/components/TaskDetailDrawer.jsx`](file:///home/brexc/projects/taskflow/frontend/src/components/TaskDetailDrawer.jsx) | Slide-over drawer for task inspection, editing, comments, subtasks, watchers, and activity logs. |
| `KanbanBoard` & `KanbanCard` | [`frontend/src/components/KanbanBoard.jsx`](file:///home/brexc/projects/taskflow/frontend/src/components/KanbanBoard.jsx) | Drag-and-drop task board with fractional ordering and undo support. |
| `GlobalSearchModal` | [`frontend/src/components/GlobalSearchModal.jsx`](file:///home/brexc/projects/taskflow/frontend/src/components/GlobalSearchModal.jsx) | Search popup with operator syntax (`status:`, `assignee:`, `due:`, `project:`), suggestions, and AI search. |
| `NotificationBell` & `Center` | [`frontend/src/components/NotificationBell.jsx`](file:///home/brexc/projects/taskflow/frontend/src/components/NotificationBell.jsx) | Live unread counter, notification dropdown, and preference controls. |
| `AnalyticsOverview` & `ProjectAnalytics` | [`frontend/src/components/AnalyticsOverview.jsx`](file:///home/brexc/projects/taskflow/frontend/src/components/AnalyticsOverview.jsx) | Metric summaries, velocity charts, and workload distribution breakdown. |
| `CalendarView` | [`frontend/src/components/CalendarView.jsx`](file:///home/brexc/projects/taskflow/frontend/src/components/CalendarView.jsx) | Month/week/day calendar with due date drag-and-drop and overdue sections. |
| `ProjectModal` & `ProjectHeader` | [`frontend/src/components/ProjectModal.jsx`](file:///home/brexc/projects/taskflow/frontend/src/components/ProjectModal.jsx) | Project creation/settings modal with color/icon selectors and progress headers. |
| `AIProductivityInsights` | [`frontend/src/components/AIProductivityInsights.jsx`](file:///home/brexc/projects/taskflow/frontend/src/components/AIProductivityInsights.jsx) | Executive summaries, workload alerts, and velocity trends powered by Gemini. |
| `AIProjectPlannerModal` | [`frontend/src/components/AIProjectPlannerModal.jsx`](file:///home/brexc/projects/taskflow/frontend/src/components/AIProjectPlannerModal.jsx) | Interactive project structure generation, phase breakdown, and transactional import. |
| `TaskSkeleton` | [`frontend/src/components/TaskSkeleton.jsx`](file:///home/brexc/projects/taskflow/frontend/src/components/TaskSkeleton.jsx) | Pulse skeleton placeholders matching task cards and list items. |
| `UndoToast` | [`frontend/src/components/UndoToast.jsx`](file:///home/brexc/projects/taskflow/frontend/src/components/UndoToast.jsx) | Fixed toast notification for optimistic mutations with action rollback. |
| `ThemeToggle` | [`frontend/src/components/ThemeToggle.jsx`](file:///home/brexc/projects/taskflow/frontend/src/components/ThemeToggle.jsx) | Dark/Light mode theme switch with persistent `localStorage` and system sync. |

---

## 5. Application Layout & Responsive Rules

### Desktop Architecture
```text
┌────────────────────────────────────────────────────────────────────────┐
│ Sidebar (220px fixed) │ Top Header (64px fixed)                       │
│ - Workspace Switcher  ├────────────────────────────────────────────────┤
│ - Primary Navigation  │ Main Content Area                              │
│ - Project List        │ - max-width: 1440px                            │
│ - User Profile        │ - padding: 24px 32px                           │
└───────────────────────┴────────────────────────────────────────────────┘
```

### Breakpoint Matrix & Mobile Rules
1. **Desktop ($\ge 1024\text{px}$)**:
   - Sidebar visible, expanded viewports for Kanban multi-column and Calendar grid.
2. **Tablet ($768\text{px} - 1023\text{px}$)**:
   - Sidebar collapses into overlay drawer.
   - Kanban board enables horizontal scroll.
3. **Mobile ($< 768\text{px}$)**:
   - Top bar provides hamburger toggle button for drawer navigation.
   - Task lists and summary metrics stack into a single column.
   - Minimum touch target size: $44 \times 44\text{px}$.
   - Modals and drawers switch to full-screen or bottom-sheet presentations.

---

## 6. The 4 Essential Component States

Every interactive view or component **must** handle all four states gracefully:

### 1. Loading State
- Use contextual skeleton loaders (`TaskSkeleton`) reflecting the true layout.
- Avoid global full-page blocking spinners for localized data fetching.
- Maintain button loading spinners with disabled state during form submissions.

### 2. Empty State
An empty state must never be a dead end:
- Include an illustrative icon (e.g. `📋`, `📁`, `🔍`).
- Friendly, informative headline (e.g., "No tasks in this project yet").
- Short explanatory sentence.
- **Primary CTA button** (e.g., `+ Create First Task` or `✨ Plan Project with AI`).

### 3. Error State
- Provide human-readable, non-technical error explanations.
- Offer an immediate **Retry** button or action.
- Log error telemetry to Sentry (`Sentry.captureException(err)`).

### 4. Success & Optimistic Feedback State
- Implement optimistic UI updates where appropriate (e.g., task status change, reordering).
- Show an `UndoToast` offering an immediate 5-second reversal window if the user made a mistake.
- Automatically revert local state with an error banner if the server request fails.

---

## 7. TaskFlow AI UI Design Patterns

When building or styling AI interactions:

```text
User Request / Trigger (✨)
       │
       ▼
[ Context Indicator ] ──► "Analyzing 12 active tasks in Website Redesign..."
       │
       ▼
[ Structured Proposal ] ──► Interactive preview with editable task cards/subtasks
       │
       ▼
[ User Review & Confirm ] ──► [ Accept All ]  [ Select Items ]  [ Cancel ]
       │
       ▼
[ TaskFlow Backend Mutation ] ──► Transactional creation + Activity Log
```

### Key AI UI Rules:
1. **Visual Distinction**: Use subtle violet/indigo badges and border accents (`#7928ca` / `#0070f3`) with the sparkle icon (`✨`) for AI-generated suggestions.
2. **Never Execute Invisibly**: AI must **never** mutate the database silently. Always display a structured review modal or preview drawer before writing data.
3. **Editable Proposals**: Allow users to toggle checkboxes, edit titles, or remove individual suggested tasks before confirming.
4. **Context Transparency**: Show a banner or tag indicating which project, timeframe, or dataset the AI analyzed.
5. **No Cluttering Chat Bubbles**: Keep AI tools contextualized within their workflows (e.g., "✨ Break down task" in the task drawer, "✨ Plan Project" in project creation).

---

## 8. Accessibility (WCAG AA) & Keyboard Standards

1. **Color Contrast**:
   - Text on backgrounds must meet at least $4.5:1$ contrast ratio ($3:1$ for large headings).
   - Badges and colored pills must use dark text on pastel backgrounds (Light Mode) or light text on tinted deep backgrounds (Dark Mode).
2. **Keyboard Navigation & Global Shortcuts**:
   - `C`: Open task creation modal.
   - `/` or `Ctrl+K`: Open global search modal.
   - `Esc`: Close open modal or detail drawer.
   - `E`: Edit selected task.
   - **Critical**: Global shortcut listeners must check `['INPUT', 'TEXTAREA'].includes(e.target.tagName)` or `e.target.isContentEditable` and return early to avoid hijacking user typing.
3. **ARIA Semantics**:
   - Modals: `role="dialog"` and `aria-modal="true"`.
   - Toggle buttons: `aria-expanded={isOpen}`.
   - Icon-only buttons: Mandatory `aria-label="Descriptive Action"`.
   - Focus rings: Preserve visible `:focus-visible` styling (`var(--focus-outline-color)`).

---

## 9. UI Verification & Browser QA Checklist

Before committing any frontend UI change, verify:

- [ ] **Cross-Breakpoint Layout**: Tested on Desktop ($1440\text{px}$), Tablet ($768\text{px}$), and Mobile ($375\text{px}$).
- [ ] **Theme Integrity**: Toggled between Light Mode and Dark Mode to verify contrast, borders, and input readability.
- [ ] **All 4 States Tested**: Verified Loading skeleton, Empty state, Error state, and Success toast.
- [ ] **Keyboard Usability**: Tested `Tab` navigation order, `Esc` drawer closure, and form submission with `Enter`.
- [ ] **No Inline Style Sprawl**: Verified CSS variables and tokens are used instead of ad-hoc hex values.
- [ ] **Production Build**: Verified clean bundle compilation via `cd frontend && npm run build`.

---

## 10. Phase 46 — Design System Migration to shadcn/ui

> **Reference**: [`SYNCTASK_2_0_SCALING_UI_ADDENDUM.md`](file:///home/brexc/projects/taskflow/SYNCTASK_2_0_SCALING_UI_ADDENDUM.md) (Phase 46)

Adopt `shadcn/ui` for primitives without disrupting `DESIGN.md` aesthetics or breaking existing component styling.

### Migration Principles
1. **Incremental Replacement**: Migrate one shared primitive at a time across all screens; never do a big-bang rewrite.
2. **Preserve Design Tokens**: Map shadcn/ui themes and Tailwind variables to the existing `DESIGN.md` CSS tokens in `index.css` rather than accepting generic defaults.
3. **Bespoke Components Stay Custom**: Kanban boards, task detail drawers, timeline views, and AI review panels stay custom — shadcn is for primitives.
4. **Clean Retirement**: Only delete old design system components once all call sites have migrated and verified.

### Migration Sequence:
1. `Button`, `Input`, `Label`, `Textarea`
2. `Dialog` / `Modal`, `DropdownMenu`, `Popover`
3. `Card`, `Badge`, `Tabs`
4. `Table` (for sessions, member tables, search tables)
5. `Toast` / Notifications

