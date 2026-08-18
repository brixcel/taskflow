# TaskFlow 2.0 — Gemini Antigravity Master Engineering Plan

> **Purpose:** This document is the single source of truth for Gemini Antigravity when extending TaskFlow beyond the existing production-ready foundation.
>
> **Agent:** Gemini Antigravity
>
> **Project:** TaskFlow — production-grade, multi-tenant SaaS task/project management platform
>
> **Primary objective:** Transform TaskFlow from a strong production CRUD/task-management application into a portfolio-grade SaaS platform demonstrating modern frontend engineering, backend architecture, real-time systems, AI engineering, integrations, cloud engineering, DevOps, observability, reliability, and product design.

---

## 📊 Master Plan Phase Progress Matrix

| Milestone | Phase | Title | Status | Automated Test Suite |
| :--- | :--- | :--- | :--- | :--- |
| **Foundation** | **Phase 0–15** | Production Foundation, Teams, RBAC, Validation, Auth, Sentry, Backups, GDPR, Due Dates, CI/CD | ✅ **COMPLETE** | `rbac.test.js`, `validation.test.js`, `team-isolation.test.js`, etc. |
| **Milestone H** | **Phase 17** | Dashboard & Productivity Analytics | ✅ **COMPLETE** | `phase17-analytics.test.js` |
| **Milestone H** | **Phase 18** | Kanban Workspace | ✅ **COMPLETE** | `phase18-kanban.test.js` |
| **Milestone H** | **Phase 19** | Task Detail Workspace | ✅ **COMPLETE** | `phase19-task-detail.test.js` |
| **Milestone H** | **Phase 20** | Subtasks & Checklists | ✅ **COMPLETE** | `phase20-subtasks.test.js` |
| **Milestone H** | **Phase 21** | Notifications Center | ✅ **COMPLETE** | `phase21-notifications.test.js` |
| **Milestone H** | **Phase 22** | Real-Time Collaboration | ✅ **COMPLETE** | `phase22-realtime.test.js` |
| **Milestone H2** | **Phase 23** | Projects / Workspaces | ✅ **COMPLETE** | `phase23-projects.test.js` (22/22 passed) |
| **Milestone H2** | **Phase 24** | Calendar View | ✅ **COMPLETE** | `phase24-calendar.test.js` (13/13 passed) |
| **Milestone H2** | **Phase 25** | Advanced Search | ✅ **COMPLETE** | `phase25-search.test.js` (28/28 passed) |
| **Milestone I** | **Phase 26** | AI Task Assistant | ✅ **COMPLETE** | `phase26-ai-assistant.test.js` (15/15 passed) |
| **Milestone I** | **Phase 27** | AI Task Breakdown | ✅ **COMPLETE** | `phase27-ai-breakdown.test.js` (15/15 passed) |
| **Milestone I** | **Phase 28** | AI Project Planner | ✅ **COMPLETE** | `phase28-ai-planner.test.js` (13/13 passed) |
| **Milestone I** | **Phase 29** | AI Productivity Insights | ✅ **COMPLETE** | `phase29-ai-insights.test.js` (14/14 passed) |
| **Milestone I** | **Phase 30** | Natural-Language Search | ✅ **COMPLETE** | `phase30-ai-search.test.js` (23/23 passed) |
| **Milestone J** | **Phase 31** | Webhooks & API Keys | ✅ **COMPLETE** | `phase31-webhooks.test.js` (18/18 passed) |
| **Milestone J** | **Phase 32** | GitHub Integration | ✅ **COMPLETE** | `phase32-github.test.js` (22/22 passed) |
| **Milestone J** | **Phase 33** | Slack / Discord Integration | ✅ **COMPLETE** | `phase33-integrations.test.js` (14/14 passed) |
| **Milestone K** | **Phase 34** | Infrastructure as Code (IaC) | ✅ **COMPLETE** | `phase34-iac.test.js` (34/34 passed) |
| **Charter C12-C19** | **Hardening** | Error Masking, Tracing, Anti-Spam & Turnstile CAPTCHA | ✅ **COMPLETE** | `anti-spam.test.js` (10/10 passed) |

### 🚀 Prioritized Next Phases (Execution Sequence)

| **Tier 1: AI Efficiency** | **Phase 35** | **AI Token Optimization & BYOK Key Integration**<br>• Trim prompt templates in "Create with AI" & Project Planner<br>• Strict `maxOutputTokens` & max 3 subtasks to eliminate token waste<br>• Universal Freelancer Workspace Persona (Design, Marketing, Dev)<br>• Team Settings: "Bring Your Own Gemini Key" (BYOK) with AES-256 encryption | ✅ **COMPLETE** | `phase35-ai-byok.test.js` (11/11 passed) |
| **Tier 1: Media Engine** | **Phase 36** | **Optimized File & Image Attachments with Pre-Upload Compression**<br>• Task & comment file attachments (`POST /tasks/:id/attachments`)<br>• Browser HTML5 canvas pre-upload compression (WebP/JPEG 1920px, quality 0.8, 12MB → 250KB)<br>• Size caps (5MB max) & image preview drawer | ✅ **COMPLETE** | `phase36-attachments.test.js` (9/9 passed) |
| **Tier 1: Enterprise Core** | **Phase 37** | **Postgres Row-Level Security (RLS)**<br>• Engine-level PostgreSQL multi-tenant isolation policies | ✅ **COMPLETE** | `phase37-rls.test.js` (8/8 passed) |
| **Tier 1: Enterprise Core** | **Phase 38** | **Server-Side Redis Sessions & Instant Token Revocation**<br>• Redis session store & instant logout/eviction token revocation | ✅ **COMPLETE** | `phase38-redis-sessions.test.js` (5/5 passed) |
| **Tier 1: Enterprise Core** | **Phase 39** | **Backend Redis Caching & Cache-Aside Layer**<br>• Sub-5ms caching for team memberships, project trees & dashboard metrics | ✅ **COMPLETE** | `phase39-redis-cache.test.js` (3/3 passed) |
| **Tier 1: Enterprise Core** | **Phase 40** | **Performance Engineering & DB Query Optimization**<br>• Compound indexes, cursor pagination, slow query logging | ⏳ **NEXT** | `phase40-performance.test.js` |
| **Tier 1: Observability** | **Phase 41** | **Production Observability & Prometheus Metrics**<br>• Prometheus `/metrics`, `/health/live`, `/health/ready`, AI token metrics | ⏳ Pending | `phase41-observability.test.js` |
| **Tier 2: Power UX** | **Phase 42** | **Universal Command Palette (`Cmd+K` / `Ctrl+K`)**<br>• Fast keyboard navigation, quick actions, global search | ⏳ Pending | `phase42-command-palette.test.js` |
| **Tier 2: Power UX** | **Phase 43** | **Task Templates & Workflow Automation**<br>• Reusable project templates & automated triggers (auto-assign, auto-tag) | ⏳ Pending | `phase43-templates.test.js` |
| **Tier 2: Power UX** | **Phase 44** | **Custom Views & Saved Filters**<br>• Save custom search/sort filter combinations with 1-click access | ⏳ Pending | `phase44-custom-views.test.js` |
| **Tier 2: Power UX** | **Phase 45** | **Time Tracking & Work Estimates**<br>• Log hours, stopwatch timers, estimated vs actual hours, team capacity | ⏳ Pending | `phase45-time-tracking.test.js` |
| **Tier 3: Growth & Polish** | **Phase 46** | **Export & Reporting Engine (CSV / PDF / JSON)**<br>• Export task boards & team velocity summaries for executive reporting | ⏳ Pending | `phase46-exports.test.js` |
| **Tier 3: Growth & Polish** | **Phase 47** | **Interactive Demo Mode & Instant Sandbox Workspaces**<br>• 1-click test drive environment pre-populated with realistic workspaces | ⏳ Pending | `phase47-demo.test.js` |
| **Tier 3: Growth & Polish** | **Phase 48** | **UI Modernization & TypeScript Migration**<br>• Incremental UI component refinement (shadcn/ui / Tailwind tokens) followed by full TypeScript migration | ⏳ Pending | `phase48-modernization.test.js` |

---

# 1. How You Must Work

You are the dedicated senior software engineer for TaskFlow.

You are not a generic code generator.

You must understand the existing repository before making changes and preserve working functionality.

## Core rules

1. **Inspect before modifying.**
2. **Do not rewrite working architecture without a strong reason.**
3. **Do not modify unrelated features.**
4. **Preserve existing API contracts unless a migration is intentionally planned.**
5. **Never weaken authentication or authorization.**
6. **Never trust tenant/team identifiers supplied by the client.**
7. **Every protected resource must remain properly team-scoped.**
8. **Respect existing RBAC.**
9. **Prefer incremental changes over large rewrites.**
10. **Reuse existing components, utilities, patterns, and design tokens whenever appropriate.**
11. **Do not add a dependency when the existing stack can solve the problem cleanly.**
12. **Every backend feature must include automated tests.**
13. **Run the relevant tests after implementation.**
14. **For UI changes, verify responsive behavior and accessibility.**
15. **Do not claim a feature is complete until it has actually been implemented and verified.**
16. **Document important architectural decisions.**
17. **Keep the application visually consistent with `DESIGN.md`.**
18. **Keep security, tenant isolation, and data integrity higher priority than convenience.**

---

# 2. Existing TaskFlow Foundation

Before beginning TaskFlow 2.0, inspect the repository and confirm the actual implementation.

The existing project has already established a production foundation including:

- User registration
- JWT authentication
- Task CRUD
- Task assignment
- Task statuses
- Comments
- Activity/audit logs
- Multi-tenant teams
- Team memberships
- RBAC
- Zod validation
- XSS sanitization
- Search
- My Tasks
- Password reset
- Email verification
- Security headers
- CORS restrictions
- Rate limiting
- Health endpoint
- Pagination
- Docker
- Sentry
- Automated backups
- Restore tooling
- GDPR-lite export/deletion
- Terms and Privacy pages
- Task due dates
- Overdue indicators
- Frontend error boundaries
- Loading skeletons
- Mobile responsiveness
- WCAG-oriented accessibility
- CI/CD
- Design system
- Production deployment preparation

**Do not assume these descriptions are still accurate. Inspect the repository.**

Important project documents to read before feature work:

```text
PLAN.md
DESIGN.md
README.md
ARCHITECTURE.md        # if present
API.md                 # if present
package.json
backend/package.json
frontend/package.json
```

---

# 3. TaskFlow 2.0 Product Vision

TaskFlow should evolve into a product that feels like a modern combination of:

- lightweight project management
- team collaboration
- developer productivity
- analytics
- automation
- AI assistance

The product should feel polished enough that a recruiter can open the live demo and immediately understand what was built.

The goal is not to clone another product.

TaskFlow should have its own coherent identity and design language.

---

# 4. Engineering Priorities

When deciding between features, prioritize in this order:

1. Security
2. Data integrity
3. Tenant isolation
4. Correct authorization
5. Reliability
6. Maintainability
7. Performance
8. Accessibility
9. UX
10. Visual polish
11. New functionality

A visually impressive feature that introduces a security vulnerability is a failure.

---

# 5. Standard Feature Workflow

Every phase must follow this workflow.

## Step 1 — Inspect

Identify:

- relevant frontend files
- relevant backend files
- database models
- routes/controllers
- services
- middleware
- tests
- reusable UI components
- existing design tokens

## Step 2 — Plan

Before coding, determine:

- database changes
- API changes
- frontend changes
- authorization requirements
- edge cases
- tests
- migration requirements
- performance considerations

For complex features, create or update a short implementation plan in:

```text
docs/implementation/
```

## Step 3 — Implement

Implement the smallest complete version that satisfies the phase.

Do not partially implement multiple phases.

## Step 4 — Test

Write automated tests for:

- happy path
- authentication
- authorization
- tenant isolation
- validation
- failure cases
- important edge cases

## Step 5 — Run

Actually run the tests.

Do not merely inspect the code and claim it works.

## Step 6 — Review

Check:

- security
- accessibility
- responsive behavior
- performance
- UI consistency
- error handling
- loading states
- empty states

## Step 7 — Document

Update relevant documentation.

## Step 8 — Report

At the end of every phase, report:

```text
Implemented:
Tests:
Files changed:
Database changes:
API changes:
Manual verification:
Known limitations:
Next phase:
```

---

# 6. Phase Execution Rules

Only work on the phase explicitly requested.

If the user says:

> Implement Phase 18

do not automatically implement Phases 19–40.

You may identify dependencies, but do not silently expand scope.

Before starting a phase:

```text
1. Read this PLAN.
2. Inspect the current repository.
3. Check whether prerequisite phases are complete.
4. Identify conflicts with existing architecture.
5. Implement only the requested phase.
```

---

# Milestone H — Core Product Experience

# Phase 17 — Dashboard & Productivity Analytics [✅ COMPLETE]

> **Status:** ✅ **Complete** — Server-side analytics aggregation, metric cards, drill-down filters, weekly productivity breakdown, charts, team isolation tested in `phase17-analytics.test.js`.

## Goal

Create a useful team dashboard rather than a simple task list.

## Features

Add:

- Team overview
- Tasks completed this week
- Tasks completed this month
- Tasks by status
- Tasks by assignee
- Overdue tasks
- Completion rate
- Workload distribution
- Recent activity
- My productivity
- Weekly productivity summary
- Interactive charts
- Date-range filtering
- Team/member filtering
- Drill-down from dashboard metrics

## UX requirements

Dashboard cards should be:

- visually distinct
- compact
- readable
- responsive
- accessible
- clickable where appropriate

Avoid unnecessary dashboard clutter.

## Engineering requirements

Prefer server-side aggregation for large datasets.

Do not fetch thousands of tasks into the browser just to calculate statistics.

Add appropriate database indexes if analytics queries require them.

## Tests

Test:

- team isolation
- date ranges
- status aggregation
- assignee aggregation
- empty datasets
- unauthorized access

---

# Phase 18 — Kanban Workspace [✅ COMPLETE]

> **Status:** ✅ **Complete** — Interactive Kanban board (`KanbanBoard.jsx`, `KanbanCard.jsx`), persistent fractional ordering (`order` field), drag & drop with optimistic UI and rollback/undo toast, test suite in `phase18-kanban.test.js`.

## Goal

Provide a modern drag-and-drop task board.

## Features

Columns:

```text
Todo
In Progress
Done
```

Support:

- drag task between columns
- reorder tasks
- persistent ordering
- optimistic UI
- rollback on failed request
- undo after accidental move
- task priority
- labels
- avatars
- due dates
- overdue indicators
- task counts
- empty columns

## Database

Add a stable ordering field if required.

Never rely on array position in the frontend as the permanent order.

## Important

Dragging a task must update the backend.

Refresh the page and verify the order remains correct.

## Tests

Test:

- valid moves
- invalid moves
- authorization
- ordering persistence
- rollback
- tenant isolation

---

# Phase 19 — Task Detail Workspace [✅ COMPLETE]

> **Status:** ✅ **Complete** — Rich slide-over task detail drawer (`TaskDetailDrawer.jsx`), real-time field editing, activity audit trail, comments stream, keyboard shortcuts (`C`, `/`, `Esc`, `E`), test suite in `phase19-task-detail.test.js`.

## Goal

Turn the task detail screen into a complete collaboration workspace.

Include:

- title
- description
- status
- priority
- assignee
- creator
- due date
- labels
- comments
- activity history
- timestamps
- edit history
- attachments
- related tasks
- subtasks
- checklist
- watch/follow task
- permission-aware actions

## UX

Prefer a polished drawer or dedicated detail route.

Use:

- skeleton loading
- optimistic updates where safe
- autosave only where reliable
- clear save/error states

Keyboard shortcuts:

```text
C     Create task
/     Search
Esc   Close task
E     Edit task
```

Do not make shortcuts interfere with text inputs.

---

# Phase 20 — Subtasks & Checklists [✅ COMPLETE]

> **Status:** ✅ **Complete** — Subtasks backend model with nested hierarchy support (`subtasks` table), progress % rollups on parent tasks, reordering, inline checklist UI, test suite in `phase20-subtasks.test.js`.

## Goal

Allow complex work to be broken into smaller pieces.

Example:

```text
Build landing page
├── Design hero section
├── Create responsive layout
├── Add animations
└── Test mobile layout
```

Features:

- subtasks
- nested subtasks if architecture supports them safely
- checklist items
- completion percentage
- parent task progress
- collapse/expand
- subtask assignee
- subtask due date

Display:

```text
75% complete
```

Do not create recursive data structures unless they are genuinely necessary.

---

# Phase 21 — Notifications Center [✅ COMPLETE]

> **Status:** ✅ **Complete** — In-app notification system with bell dropdown and full notification center, unread counters, notification preferences, event triggers (assignments, mentions, due dates, team events), test suite in `phase21-notifications.test.js`.

## Goal

Create a centralized notification experience.

Events:

- task assigned
- task reassigned
- status changed
- mention
- comment
- due date approaching
- overdue
- team invitation
- role changed
- task completed

UI:

```text
Bell
↓
Unread count
↓
Notification dropdown
↓
Notification center
```

Support:

- mark read
- mark all read
- unread filtering
- deletion
- notification preferences

Notifications must respect team permissions and privacy.

---

# Phase 22 — Real-Time Collaboration [✅ COMPLETE]

> **Status:** ✅ **Complete** — Socket.io WebSocket server (`services/realtime.js`) with JWT auth and team-room isolation, client-side `RealtimeContext`, auto-reconnect, live task / comment / notification event broadcasts, test suite in `phase22-realtime.test.js`.

## Goal

Make TaskFlow update without manual refresh.

Potential technologies:

- WebSockets
- Server-Sent Events

Choose based on the existing architecture.

Events:

```text
task.created
task.updated
task.deleted
task.assigned
task.completed
comment.created
project.updated
```

Users should see updates from teammates without refreshing.

Optional collaboration indicators:

```text
Alex is viewing this task
Sarah is typing...
```

## Important

Do not introduce real-time infrastructure merely for visual effect.

Implement proper:

- connection handling
- reconnect logic
- authentication
- authorization
- event validation
- cleanup
- failure behavior

---

# Milestone H2 — Project Management

# Phase 23 — Projects / Workspaces [✅ COMPLETE]

> **Status:** ✅ **Complete** — Successfully implemented Project & ProjectMember schema, full CRUD routes, role-based project authorizations, real-time broadcasts, project-level stats and workload computation, Sidebar project navigation, Create/Edit ProjectModal with color/icon pickers, ProjectDashboardHeader, ProjectAnalytics dashboard, TaskDetailDrawer project picker, and 22/22 passing automated tests in `phase23-projects.test.js`.

## Goal

Introduce projects beneath teams.

Conceptual hierarchy:

```text
Organization
└── Team
    ├── Project A
    │   ├── Tasks
    │   └── Members
    └── Project B
```

Project fields may include:

- name
- description
- icon
- color
- status
- members
- start date
- target date
- progress

Add project dashboards.

Every project resource must remain team-scoped.

---

# Phase 24 — Calendar View

## Features

Add:

- month view
- week view
- day view
- tasks by due date
- drag task to another date
- today indicator
- overdue section
- project filtering
- assignee filtering

Date handling must respect the application's timezone strategy.

Avoid off-by-one errors caused by UTC/local conversions.

---

# Phase 25 — Advanced Search

## Goal

Create powerful global search.

Support queries such as:

```text
status:todo
assignee:me
priority:high
due:today
due:overdue
label:frontend
project:website
```

Combinations:

```text
status:todo assignee:me priority:high
```

Features:

- search suggestions
- recent searches
- saved searches
- keyboard shortcut `/`
- global search modal

## Engineering

Parse search expressions into validated structured filters.

Never convert user search directly into raw SQL.

Respect authorization while searching.

---

# Milestone I — AI TaskFlow

# Phase 26 — AI Task Assistant

## Goal

Provide safe AI-assisted task creation.

User:

```text
Create a task for redesigning the login page.
```

AI suggests:

```text
Title
Description
Priority
Suggested subtasks
Suggested deadline
```

AI should produce structured output.

Do not allow arbitrary AI-generated text to become executable database operations without validation.

User confirmation should be required before important mutations.

---

# Phase 27 — AI Task Breakdown

Add:

```text
✨ Break down task
```

Example:

```text
Deploy TaskFlow to AWS
```

AI suggests:

```text
1. Create AWS account
2. Configure IAM
3. Create networking
4. Configure database
5. Deploy backend
6. Deploy frontend
7. Configure domain
8. Configure monitoring
9. Run smoke tests
```

User can:

- accept all
- edit suggestions
- accept individual subtasks
- cancel

---

# Phase 28 — AI Project Planner

Input:

```text
Build an e-commerce website.
```

AI creates a proposed project hierarchy:

```text
Planning
UI/UX
Development
Testing
Deployment
```

The AI must return structured JSON matching a strict schema.

Validate the schema before displaying or persisting it.

Never directly execute arbitrary tool calls generated by the model.

Require user approval before creating the project structure.

---

# Phase 29 — AI Productivity Insights [✅ COMPLETE]

> **Status:** ✅ **Complete** — Server-side aggregation of authorized metrics (velocity comparisons, overdue detection, peak day detection, workload balance, project slowdowns), Gemini LLM structured insights with deterministic offline fallback, `GET /ai/productivity-insights` REST endpoint, interactive `AIProductivityInsights.jsx` frontend component, and 14/14 tests passing in `phase29-ai-insights.test.js`.

Generate weekly summaries from authorized TaskFlow data.

Example:

```text
Your team completed 32 tasks this week.

18% improvement compared with last week.

3 tasks are overdue.

Alex has the highest active workload.

Website Redesign has slowed over the past 5 days.
```

AI must only receive data the requesting user is authorized to access.

Avoid exposing private information between teams.

Show that insights are generated from a specific time range.

---

# Phase 30 — Natural-Language Search

User:

```text
Show me all high-priority tasks assigned to me that are due this week.
```

AI converts the request into structured filters.

Architecture:

```text
Natural language
↓
LLM
↓
Structured query
↓
Schema validation
↓
Authorization
↓
Database query
↓
Results
```

The LLM must never directly generate SQL.

---

# Milestone J — Integrations

# Phase 31 — Webhooks & API Keys

Create:

```text
Settings
└── Developer
    ├── API Keys
    └── Webhooks
```

Events:

```text
task.created
task.updated
task.completed
task.assigned
comment.created
project.created
```

Features:

- API key creation
- key rotation
- revocation
- webhook signing
- delivery logs
- retry handling
- failure tracking

Never display full API secrets after initial creation.

Store only secure representations where appropriate.

---

# Phase 32 — GitHub Integration

Allow projects to connect to GitHub repositories.

Potential data:

- pull requests
- issues
- commits

Example automation:

```text
PR #42 merged
↓
TaskFlow task completed
```

This must be configurable and permission-aware.

Do not assume GitHub permissions are equivalent to TaskFlow permissions.

---

# Phase 33 — Slack / Discord Integration

Notifications:

```text
Task assigned
Task completed
Task overdue
Project update
```

Provide team-level configuration.

Do not expose private task content to external integrations unless explicitly configured.

---

# Milestone K — Cloud Engineering

# Phase 34 — Infrastructure as Code

Introduce Terraform only when the deployed architecture is stable enough to codify.

Structure:

```text
infra/
├── environments/
│   ├── staging/
│   └── production/
├── modules/
│   ├── database/
│   ├── networking/
│   ├── compute/
│   └── monitoring/
└── README.md
```

Document:

- networking
- IAM
- database
- compute
- secrets
- storage
- DNS
- monitoring

Never commit real credentials.

---

# Phase 35 — Production Observability

Create observability around:

```text
Logs
Metrics
Traces
Errors
```

Track:

- API latency
- request rate
- error rate
- database connections
- CPU/memory
- 5xx responses
- slow endpoints

Use existing Sentry capabilities where appropriate instead of duplicating tooling.

---

# Phase 36 — Performance Engineering

Investigate before optimizing.

Potential improvements:

- indexes
- query optimization
- Redis caching
- background jobs
- API caching
- lazy loading
- code splitting
- bundle analysis
- rate limits
- pagination

Record measurable results.

Example:

```text
Before: 420ms average response
After: 120ms average response
```

Never invent benchmark numbers.

---

# Milestone L — Portfolio / Product Polish

# Phase 37 — Command Palette

Shortcut:

```text
Ctrl + K
```

Actions:

```text
Search tasks
Create task
Create project
Open dashboard
Open calendar
Switch team
Invite member
Toggle theme
Open settings
```

Make commands permission-aware.

---

# Phase 38 — Custom Views

Allow users to save filters such as:

```text
My High Priority Tasks
Frontend Tasks
Overdue Tasks
This Week
Unassigned Tasks
```

Views should store structured filters, not arbitrary executable queries.

---

# Phase 39 — Task Templates

Examples:

## Software Bug

```text
Reproduce bug
Investigate
Implement fix
Write test
Review
Deploy
```

## Feature Development

```text
Requirements
Design
Implementation
Testing
Review
Deployment
```

Users should be able to create and reuse templates.

---

# Phase 40 — Demo Mode

## Goal

A recruiter should be able to try TaskFlow without registration.

Add:

```text
Try Demo
```

Populate a safe demo environment with:

- realistic team
- users
- projects
- tasks
- comments
- activity
- notifications
- analytics

The demo must never expose production data.

Prefer a clearly isolated demo tenant or read-only demo environment.

---

# 7. Portfolio Mode

For every major feature, identify the engineering concept it demonstrates.

Examples:

| Feature | Engineering Signal |
|---|---|
| Multi-tenancy | SaaS architecture |
| RBAC | Authorization |
| PostgreSQL | Database engineering |
| Kanban | Frontend state management |
| WebSockets | Real-time systems |
| Redis | Caching |
| Background jobs | Distributed processing |
| AI task generation | AI engineering |
| Natural-language search | LLM structured output |
| Webhooks | API integration |
| GitHub integration | Third-party APIs |
| Terraform | Infrastructure as Code |
| CI/CD | DevOps |
| Sentry | Observability |
| Backups | Reliability |
| GDPR | Data governance |
| Accessibility | Frontend quality |

When implementing a major feature, document why it matters technically.

---

# 8. Design System Rules

`DESIGN.md` is the visual source of truth.

Before adding UI:

1. Read `DESIGN.md`.
2. Reuse existing tokens.
3. Reuse existing components.
4. Maintain spacing consistency.
5. Maintain typography hierarchy.
6. Maintain button/input behavior.
7. Maintain focus states.
8. Maintain responsive behavior.
9. Maintain WCAG-oriented contrast.

Do not create a completely different visual language for each feature.

## UI quality requirements

Every new screen should include appropriate:

- loading state
- empty state
- error state
- success feedback
- disabled state
- hover state
- focus state
- mobile layout

Avoid:

- excessive gradients
- unnecessary glassmorphism
- random animations
- oversized cards
- inconsistent border radii
- excessive shadows
- generic AI-generated dashboard layouts

The design should feel intentional and product-like.

---

# 9. AI Safety Rules

AI features must follow this architecture:

```text
User
↓
AI request
↓
Authorized server-side context
↓
LLM
↓
Strict schema validation
↓
Business-rule validation
↓
Authorization
↓
User confirmation if mutation
↓
Database
```

Never:

```text
User
↓
LLM
↓
Raw SQL
```

Never allow the model to bypass:

- RBAC
- team isolation
- validation
- audit logging

AI-generated mutations should be auditable.

---

# 10. Database Rules

Before adding a model:

1. Determine ownership.
2. Determine tenant scope.
3. Determine relationships.
4. Determine deletion behavior.
5. Determine indexes.
6. Determine unique constraints.
7. Determine authorization.
8. Determine migration strategy.

For every tenant-scoped resource, ask:

> Can User A access this resource belonging to Team B?

The answer must always be no unless explicit cross-team functionality has been designed and authorized.

---

# 11. API Rules

All APIs should:

- authenticate when required
- authorize
- validate input
- validate resource ownership
- scope by tenant/team
- return consistent errors
- avoid leaking internal stack traces
- avoid exposing secrets
- use pagination where collections can grow

Do not trust:

```text
teamId
userId
createdBy
role
```

when they are supplied by an untrusted client.

Derive sensitive ownership information from authenticated server-side context whenever possible.

---

# 12. Testing Strategy

Each implementation should add appropriate tests.

## Backend

Test:

- authentication
- authorization
- tenant isolation
- validation
- CRUD
- edge cases
- database behavior

## Frontend

Test:

- rendering
- interactions
- loading states
- error states
- permissions
- keyboard behavior
- responsive behavior where practical

## Integration

Test important flows end-to-end.

Examples:

```text
Register
→ Login
→ Create team
→ Create project
→ Create task
→ Assign task
→ Comment
→ Complete task
```

For new features, include at least one cross-tenant isolation test where relevant.

---

# 13. Manual QA Checklist

After major UI work verify:

- desktop
- 768px tablet
- 375px mobile
- keyboard navigation
- focus states
- invalid forms
- loading states
- empty states
- error states
- slow network behavior
- backend unavailable
- long task titles
- many tasks
- many team members
- multiple projects
- dark/light mode if supported

---

# 14. Performance Rules

Do not optimize based on assumptions.

First identify:

- slow queries
- unnecessary renders
- excessive network calls
- large bundles
- inefficient data fetching

Then optimize.

For large lists:

- paginate
- virtualize where necessary
- debounce search
- avoid fetching unused fields
- use appropriate indexes

---

# 15. Security Checklist

Before declaring a phase complete:

```text
[ ] Authentication checked
[ ] Authorization checked
[ ] Team isolation checked
[ ] Input validation checked
[ ] XSS considerations checked
[ ] CSRF considerations checked where applicable
[ ] Rate limiting considered
[ ] Sensitive data not logged
[ ] Secrets not exposed
[ ] API errors do not leak internals
[ ] Audit logging added where appropriate
```

---

# 16. Documentation Requirements

Maintain:

```text
README.md
PLAN.md
DESIGN.md
ARCHITECTURE.md
API.md
CHANGELOG.md
```

When major architecture changes occur, update:

- architecture diagrams
- database documentation
- API documentation
- environment documentation
- deployment documentation

The final README should explain:

1. What TaskFlow is
2. Features
3. Architecture
4. Technology stack
5. Database architecture
6. Authentication
7. Multi-tenancy
8. RBAC
9. AI architecture
10. Real-time architecture
11. Integrations
12. CI/CD
13. Cloud infrastructure
14. Observability
15. Security
16. Testing
17. Deployment
18. Demo
19. Engineering decisions
20. Lessons learned

---

# 17. Git Discipline

Use focused commits.

Examples:

```text
feat: add dashboard productivity analytics
feat: add kanban task ordering
feat: add task subtasks
feat: add notification center
feat: add real-time task updates
feat: add project management
feat: add AI task breakdown
feat: add webhook infrastructure
feat: add GitHub integration
feat: add Terraform production infrastructure
```

Do not mix unrelated features in one commit.

---

# 18. Phase Completion Standard

A phase is COMPLETE only when:

```text
[ ] Feature implemented
[ ] Existing functionality still works
[ ] Database migration completed if needed
[ ] API implemented
[ ] Authorization verified
[ ] Tenant isolation verified
[ ] Automated tests written
[ ] Tests pass
[ ] Frontend verified
[ ] Responsive behavior verified
[ ] Accessibility checked
[ ] Loading/empty/error states implemented
[ ] Documentation updated
[ ] No unrelated regressions
```

---

# 19. Do Not Fake Completion

Never say:

> "This should work."

Instead verify it.

Never say:

> "Tests should pass."

Run them.

Never say:

> "The migration should be safe."

Inspect the migration and test it.

Never invent:

- benchmark numbers
- test results
- API responses
- deployment status
- cloud resources
- integration success
- screenshots
- monitoring results

If something cannot be verified, explicitly say:

```text
Not verified — requires manual verification.
```

---

# 20. Recommended Build Order

Implement the TaskFlow 2.0 roadmap in this order:

## Tier 1 — Product UX

```text
17 Dashboard Analytics
18 Kanban
19 Task Detail Workspace
20 Subtasks
21 Notifications
24 Calendar
37 Command Palette
38 Custom Views
39 Templates
40 Demo Mode
```

## Tier 2 — Advanced Engineering

```text
23 Projects
25 Advanced Search
22 Real-Time Collaboration
31 Webhooks/API Keys
32 GitHub Integration
33 Slack/Discord
```

## Tier 3 — AI

```text
26 AI Task Assistant
27 AI Task Breakdown
28 AI Project Planner
29 AI Productivity Insights
30 Natural-Language Search
```

## Tier 4 — Cloud/DevOps

```text
34 Terraform
35 Observability
36 Performance Engineering
```

If dependencies require a different order, explain the dependency before changing the order.

---

# 21. Definition of the Final TaskFlow Product

The desired final experience is:

```text
                     TASKFLOW
                        │
        ┌───────────────┼────────────────┐
        │               │                │
     Projects        Tasks           Analytics
        │               │                │
     Calendar        Kanban          Productivity
        │               │                │
        └───────────────┼────────────────┘
                        │
                 Collaboration
                        │
          ┌─────────────┼─────────────┐
          │             │             │
       Comments     Notifications   Real-time
          │             │             │
          └─────────────┼─────────────┘
                        │
                       AI
                        │
        ┌───────────────┼────────────────┐
        │               │                │
   Task Assistant   Project Planner   AI Search
        │               │                │
        └───────────────┼────────────────┘
                        │
                  Integrations
                        │
        ┌───────────────┼────────────────┐
        │               │                │
      GitHub         Webhooks       Slack/Discord
                        │
                     Cloud
                        │
          ┌─────────────┼─────────────┐
          │             │             │
       Terraform      CI/CD      Observability
```

The final product should demonstrate that its developer understands much more than CRUD.

It should demonstrate:

- full-stack development
- SaaS architecture
- multi-tenancy
- authorization
- relational databases
- real-time systems
- AI integration
- third-party APIs
- DevOps
- cloud infrastructure
- observability
- reliability
- accessibility
- product UX

---

# 22. Final Instruction to Gemini Antigravity

You are the long-term engineering agent for TaskFlow.

Treat this repository as a real production codebase.

Do not rush.

Do not rewrite unnecessarily.

Do not blindly follow user requests that would violate the architecture or security model.

When the user requests a phase:

```text
Inspect → Plan → Implement → Test → Verify → Document
```

Keep the implementation focused.

Protect existing functionality.

Make every feature production-quality.

Make the UI feel cohesive.

Make the architecture explainable in an interview.

Make the implementation something the developer can confidently put on a portfolio and discuss technically.

**Build TaskFlow as if real users will depend on it.**


---

# 23. Current Live Application Review — `taskflow-proj.vercel.app`

## Review source

Live application:

`https://taskflow-proj.vercel.app/`

The public deployment was checked as part of this roadmap update.

### Important verification note

The live URL responded successfully to the web fetch, but the returned page did not expose readable application content to the inspection tool. Therefore, **do not treat this section as a pixel-perfect audit of every current screen**.

The existing repository/plan remains the authoritative source for implemented functionality. The following items are therefore a combination of:

1. verified information from the existing TaskFlow plan,
2. the intended TaskFlow 2.0 product direction,
3. gaps that should be manually verified against the live application before implementation.

Do not claim that an item is missing until it has been checked in the actual repository and UI.

## Antigravity live-site audit procedure

Before implementing TaskFlow 2.0, manually inspect:

```text
/
 /login
 /register
 /dashboard
 /tasks
 /settings
 /team
```

and any routes currently present.

For every screen, record:

```text
Present
Missing
Partially implemented
Broken
Needs redesign
```

Take special note of:

- navigation structure
- dashboard density
- task list experience
- task creation/editing
- task detail experience
- team switching
- member management
- responsive behavior
- mobile navigation
- loading states
- empty states
- error states
- notifications
- search
- filters
- due dates
- activity
- comments
- accessibility
- dark/light mode
- visual consistency

---

# 24. Likely Product Gaps to Verify Against the Live App

These are the highest-value areas to investigate because they are either explicitly part of the TaskFlow 2.0 roadmap or are natural extensions of the existing production foundation.

## A. Dashboard depth

Verify whether the current dashboard has:

- productivity analytics
- completion-rate visualization
- workload distribution
- overdue summary
- date-range filtering
- team/member filtering
- recent activity
- useful drill-down interactions

If the dashboard currently functions mainly as a task overview, Phase 17 should significantly improve it.

---

## B. Task management depth

Verify whether tasks currently support:

- priority
- labels
- persistent Kanban ordering
- drag-and-drop
- subtasks
- checklists
- watchers/followers
- related tasks
- attachments
- rich task detail workspace
- task history
- keyboard shortcuts

If several are absent, prioritize Phases 18–20.

---

## C. Project-level organization

Verify whether the application currently has a project concept separate from teams.

If not, Phase 23 should introduce:

```text
Team
└── Project
    └── Tasks
```

Do not implement projects if an equivalent existing model already exists without first reconciling the architecture.

---

## D. Collaboration

Verify whether the application currently has:

- notification center
- unread counts
- mentions
- real-time updates
- typing indicators
- presence
- live comments
- activity stream

If updates currently require a refresh, Phase 22 becomes a high-value upgrade.

---

## E. Search

The existing foundation includes task search/filtering.

Verify whether search supports:

```text
status:todo
assignee:me
priority:high
due:today
due:overdue
label:frontend
project:website
```

If it only performs basic text search, implement Phase 25.

---

## F. Calendar

Verify whether due dates are currently represented only in lists.

If so, Phase 24 should add:

- month
- week
- day
- drag-to-reschedule
- filtering
- overdue visualization

---

## G. AI

Verify whether any AI functionality currently exists.

If there is no AI layer, the recommended order is:

```text
26 AI Task Assistant
27 AI Task Breakdown
28 AI Project Planner
29 AI Productivity Insights
30 Natural-Language Search
```

Do not add a generic chatbot just to claim AI support.

The AI must solve actual TaskFlow workflows.

---

## H. Integrations

Verify whether the current app exposes:

- API keys
- webhooks
- GitHub integration
- Slack/Discord integration

If absent, implement these in the order:

```text
31 Webhooks/API Keys
32 GitHub
33 Slack/Discord
```

---

## I. Cloud engineering

The current production foundation already includes deployment, CI/CD, Docker, health checks, Sentry, backups, and security hardening.

The next cloud-focused gaps to investigate are:

```text
Terraform / IaC
Production observability
Performance measurement
Caching
Background jobs
```

These correspond to Phases 34–36.

---

## J. Portfolio experience

Verify whether a first-time visitor can understand the application within approximately 30 seconds.

The application should eventually make these capabilities obvious:

```text
Task management
Projects
Team collaboration
Analytics
AI assistance
Integrations
```

Also verify whether a recruiter can safely try the application without creating an account.

If not, Phase 40 Demo Mode should be prioritized.

---

# 25. Mandatory Gap Audit Before Each Phase

Before Antigravity begins a phase, it must answer:

```text
1. Does this feature already exist?
2. If yes, what is missing from it?
3. Which files currently implement it?
4. Which database models support it?
5. Which APIs support it?
6. Which permissions apply?
7. What does the live UI currently do?
8. What exactly will change?
```

Then produce a short:

```text
Current State
Gap
Implementation Plan
Risks
Tests
```

Only after that should implementation begin.

---

# 26. Live Application Is Not the Source of Truth for Backend Architecture

The deployed frontend is useful for UX inspection, but it cannot reliably reveal:

- database relationships
- authorization logic
- hidden API behavior
- migration history
- server-side validation
- secrets handling
- tenant isolation
- internal services

Therefore:

```text
Live UI
    ↓
UX verification

Repository
    ↓
Implementation truth

Database schema
    ↓
Data model truth

Tests
    ↓
Behavioral verification
```

Never infer backend security from frontend behavior alone.

---

# 16.5 — Production Deployment Independence

> **Mandatory before Milestone I / AI implementation.** TaskFlow production must work independently of the developer's laptop.

## Target architecture

```text
                         INTERNET
                            │
               ┌────────────┴────────────┐
               ▼                         ▼
            Vercel                    Render
           Frontend                  Backend API
               │                         │
               └──────── HTTPS API ──────┘
                                         │
                           ┌─────────────┴─────────────┐
                           ▼                           ▼
                       PostgreSQL                  Gemini API
```

The laptop is development-only:

```text
Developer Laptop → GitHub → Vercel
                         └→ Render
```

Turning off the laptop must **not** require manually redeploying Render.

## Mandatory Vercel audit

Verify:

```text
[ ] VITE_API_URL exists
[ ] VITE_API_URL has a real production value
[ ] It points to the Render backend
[ ] It does not point to localhost/private IPs
[ ] Production environment is enabled
[ ] Preview environment is intentionally configured
[ ] A new Vercel deployment is made after changing VITE_API_URL
```

Expected shape:

```env
VITE_API_URL=https://<your-render-backend>.onrender.com
```

Do **not** blindly append `/api`. Inspect the frontend API client and backend route prefixes first.

## Mandatory Render audit

Verify:

```text
[ ] Render Web Service exists
[ ] Stable public URL exists
[ ] Correct GitHub repository is connected
[ ] Correct production branch is selected
[ ] Auto Deploy is configured
[ ] Build/start commands are correct
[ ] Production environment variables exist
[ ] Production database is remote
[ ] CORS allows the Vercel production domain
[ ] Health endpoint is reachable
[ ] Backend does not depend on the laptop
```

## Laptop-shutdown test

```text
1. Push current code.
2. Wait for Vercel and Render deployments.
3. Confirm production works.
4. Shut down the laptop.
5. Wait at least 30 minutes.
6. Open the Vercel site from another device if possible.
7. Test login, task loading, and task mutation.
8. Test the Render health endpoint.
```

If it fails, diagnose the actual dependency/configuration problem instead of manually redeploying.

---

# 16.6 — Render Sleep / Cold-Start Handling

If the Render plan sleeps after inactivity, distinguish:

```text
Expected cold start ≠ deployment failure
```

The frontend should provide:

```text
[ ] API loading state
[ ] Reasonable timeout
[ ] Friendly backend-starting/unavailable message
[ ] Safe retry for GET requests
[ ] No automatic duplicate retries for POST/PATCH/DELETE
```

If always-on availability becomes a requirement, evaluate an appropriate paid hosting plan rather than relying on manual redeployment.

---

# 16.7 — CI/CD Verification

Target workflow:

```text
Code → Git commit → Git push → GitHub
                              ├→ Vercel
                              └→ Render
```

Verify:

```text
[ ] Correct production branch
[ ] Frontend auto-deploy
[ ] Backend auto-deploy
[ ] Failed builds are visible
[ ] Deployment logs are available
[ ] Rollback process is documented
[ ] Secrets are never committed
[ ] Production and development configuration are separate
```

---

# 16.8 — Gemini API Architecture

TaskFlow AI must use the **Gemini API** and must not depend on the developer having an active Google AI Pro subscription.

Important:

```text
Google AI Pro subscription ≠ Gemini API configuration
```

Use a backend-managed API credential:

```text
Vercel Frontend
      ↓
Render Backend
      ↓
TaskFlow AI Service
      ↓
Gemini API
```

Store the credential only on Render:

```env
GEMINI_API_KEY=...
```

Never expose it through Vite/client code.

The exact model, quota, and billing availability must be verified against the current Gemini API account when implementing the feature.

---

# 16.9 — AI Provider Abstraction

Do not scatter Gemini calls across controllers.

Use an AI service boundary:

```text
backend/
└── ai/
    ├── ai.service
    ├── gemini.provider
    ├── prompts/
    ├── schemas/
    └── context/
```

Conceptually:

```text
TaskFlow Feature
      ↓
AI Service
      ↓
AI Provider
      ↓
Gemini
```

This keeps the application maintainable if the model/provider changes later.

---

# 26 — AI Task Assistant

Build a useful TaskFlow-native assistant, not merely a generic chatbot.

Example:

```text
User: "I need to redesign our login page."
```

Gemini can return:

```json
{
  "title": "Redesign Login Page",
  "description": "Improve the login experience.",
  "priority": "high",
  "labels": ["frontend", "ui"],
  "suggestedDueDays": 7
}
```

Flow:

```text
User input
   ↓
Gemini
   ↓
Structured suggestions
   ↓
Zod validation
   ↓
User reviews/edits
   ↓
User approves
   ↓
Normal TaskFlow API
   ↓
Database
```

AI must not silently create records.

If Gemini is unavailable, normal manual task creation must continue working.

---

# 27 — AI Task Breakdown

Add an **✨ Break Down Task** action to large tasks.

Example:

```text
Deploy TaskFlow to AWS
├── Prepare production environment
├── Configure database
├── Deploy backend
├── Deploy frontend
└── Perform production verification
```

Show generated subtasks before mutation:

```text
☑ Prepare production environment
☑ Configure database
☑ Deploy backend
☐ Deploy frontend
☑ Production verification

[Create Selected Subtasks]
```

Suggested fields:

```text
title
description
priority
estimated effort (optional)
order
dependencies (optional)
```

Architecture:

```text
Gemini proposal
   ↓
Schema validation
   ↓
User selection/approval
   ↓
TaskFlow service
   ↓
Create subtasks
```

---

# 28 — AI Project Planner

Allow a user to describe an entire project in natural language.

Example:

```text
"Build an e-commerce website with authentication,
products, payments, and an admin dashboard."
```

Generate a reviewable hierarchy:

```text
E-Commerce Website
├── Authentication
│   ├── Registration
│   ├── Login
│   └── Password reset
├── Product Management
├── Payments
└── Admin Dashboard
```

Never immediately create dozens of records.

Use:

```text
Description
   ↓
Gemini
   ↓
Project plan preview
   ↓
Edit/select
   ↓
User confirmation
   ↓
TaskFlow creates project/tasks
```

Validate structured output before it reaches business logic.

---

# 29 — AI Productivity Insights

Generate insights from **authorized, aggregated TaskFlow analytics**.

Example:

```text
"You completed most tasks on Tuesdays."
"Overdue tasks increased this month."
"Frontend tasks have the highest average completion time."
```

Preferred flow:

```text
TaskFlow analytics
   ↓
Authorized aggregation
   ↓
Minimal structured context
   ↓
Gemini
   ↓
Insight
```

Never give the model unrestricted database access.

---

# 30 — Natural-Language Search

Allow:

```text
"Show me my high-priority tasks due this week."
```

Gemini should return structured filters:

```json
{
  "assignee": "me",
  "priority": ["high"],
  "due": "this_week"
}
```

Then TaskFlow's normal authorized search executes them.

Never allow:

```text
Natural language → Gemini → raw SQL
```

Use:

```text
Natural language
   ↓
Gemini
   ↓
Structured filters
   ↓
Validation
   ↓
Authorized TaskFlow search
```

---

# 30.1 — AI Cost, Quota, and Failure Management

The AI layer must expect quotas and provider failures.

Implement:

```text
[ ] Request size limits
[ ] Rate limiting
[ ] Per-user/team usage tracking where appropriate
[ ] Timeouts
[ ] Structured provider errors
[ ] Graceful fallback
[ ] Logging without sensitive prompts/secrets
[ ] Optional AI usage metrics
```

Do not assume unlimited Gemini API usage.

AI failure must not break core task management.

---

# 30.2 — AI Privacy and Tenant Isolation

AI context follows the same RBAC and multi-tenant boundaries as the rest of TaskFlow.

Flow:

```text
Authenticated user
      ↓
Team membership
      ↓
Permission check
      ↓
Authorized records only
      ↓
Context minimization
      ↓
Gemini
```

Never send passwords, API keys, tokens, database credentials, or unauthorized cross-team data to the model.

---

# 30.3 — Human-in-the-Loop Rule

Any AI operation that changes persistent data must require explicit user approval by default.

```text
AI suggests
   ↓
User reviews
   ↓
User approves
   ↓
TaskFlow executes
```

Applies to task creation, subtask creation, project generation, bulk updates, and integration actions.

---

# 30.4 — AI Testing Requirements

Test every AI feature for:

```text
[ ] Valid prompt
[ ] Empty prompt
[ ] Very long prompt
[ ] Malformed model output
[ ] Missing fields
[ ] Invalid enum values
[ ] Gemini timeout
[ ] Gemini quota error
[ ] Unauthorized team context
[ ] Cross-team isolation
[ ] User cancellation
[ ] Approval flow
[ ] Database mutation after approval
[ ] Normal TaskFlow behavior when AI fails
```

Use mocked provider responses for deterministic automated tests and a limited number of real-provider integration tests.

---

# 30.5 — AI UX Rules

AI should feel native to TaskFlow.

Use focused actions such as:

```text
✨ AI Assist
✨ Break Down
✨ Plan with AI
✨ AI Insights
```

Each AI interaction should have:

```text
loading state
cancel/retry behavior
error state
edit-before-apply
clear AI-generated indication
```

Do not add AI UI everywhere just for visual effect.

---

# 40 — Portfolio / Demo Mode Enhancement

The public deployment should let a recruiter understand TaskFlow quickly.

Recommended flow:

```text
Landing Page
   ↓
Try Demo
   ↓
Demo Workspace
   ├── Tasks
   ├── Projects
   ├── Kanban
   ├── Analytics
   └── AI Features
```

Demo data must be isolated from real users/teams.

Make these capabilities obvious:

```text
✓ Multi-tenancy
✓ RBAC
✓ Task management
✓ Projects
✓ Kanban
✓ Analytics
✓ AI Task Assistant
✓ AI Task Breakdown
✓ AI Project Planner
✓ Integrations
✓ Production deployment
```

---

# 41 — Final Production Readiness Gate

## Frontend

```text
[ ] Vercel production URL works
[ ] No localhost API references
[ ] VITE_API_URL is configured correctly
[ ] Responsive UI works
[ ] Loading/empty/error states exist
```

## Backend

```text
[ ] Render works independently of laptop
[ ] Health endpoint works
[ ] Auto deployment works
[ ] CORS is correct
[ ] Authentication works
[ ] RBAC works
[ ] Tenant isolation is tested
```

## Database

```text
[ ] Production database is remote
[ ] Migrations documented
[ ] Backups configured
[ ] Tenant relationships enforced
```

## AI

```text
[ ] Gemini API is backend-only
[ ] API key is never exposed to frontend
[ ] Structured output is validated
[ ] AI cannot directly execute database mutations
[ ] Human approval exists
[ ] AI respects RBAC
[ ] AI failure does not break core TaskFlow
[ ] Quota/rate-limit behavior is handled
```

## CI/CD

```text
[ ] GitHub → Vercel works
[ ] GitHub → Render works
[ ] Production branch documented
[ ] Deployment logs available
[ ] Rollback procedure exists
```

## Laptop independence

```text
[ ] Laptop can be powered off
[ ] Production site remains reachable
[ ] Backend remains remotely hosted
[ ] Production never requires a local development process
```

---

# 42 — Antigravity Execution Rule

For every phase:

```text
INSPECT
  ↓
UNDERSTAND CURRENT IMPLEMENTATION
  ↓
IDENTIFY GAP
  ↓
PROPOSE MINIMAL CHANGE
  ↓
IMPLEMENT
  ↓
RUN TESTS
  ↓
VERIFY UI
  ↓
VERIFY SECURITY
  ↓
VERIFY DEPLOYMENT
  ↓
DOCUMENT
```

Before implementing anything, answer:

```text
Does this already exist?
Is it partially implemented?
Which files implement it?
Which API/database models support it?
Will this duplicate existing functionality?
Will this break an existing API?
Will this break tenant isolation?
```

Prefer extending existing systems over creating duplicate systems.
