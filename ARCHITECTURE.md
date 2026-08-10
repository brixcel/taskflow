# TaskFlow Architecture

> **Status:** Target architecture for TaskFlow 2.0.
>
> **Important:** This document is a design/source-of-truth proposal for the architecture described in `TASKFLOW_2_0_ANTIGRAVITY_PLAN.md`. Antigravity must inspect the repository and reconcile this document with the actual implementation before making architectural changes.

---

# 1. System Overview

TaskFlow is a multi-tenant SaaS task and project management platform.

The target system consists of:

```text
┌─────────────────────────────────────────────────────────────┐
│                        TaskFlow UI                          │
│                  React + Vite Frontend                      │
│                                                             │
│ Dashboard │ Tasks │ Kanban │ Projects │ Calendar │ AI       │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Application API                        │
│                    Node.js + Express                        │
│                                                             │
│ Auth │ Tasks │ Projects │ Teams │ Notifications │ AI        │
│ Search │ Analytics │ Webhooks │ Integrations │ Users        │
└──────────────┬──────────────┬──────────────┬────────────────┘
               │              │              │
               ▼              ▼              ▼
        ┌────────────┐  ┌────────────┐  ┌──────────────┐
        │ PostgreSQL │  │   Redis    │  │ Object Store │
        │ Primary DB │  │ Cache/Jobs │  │ Attachments  │
        └────────────┘  └────────────┘  └──────────────┘
               │
               ▼
        ┌─────────────────────┐
        │ Background Workers  │
        │ notifications       │
        │ webhooks            │
        │ AI jobs             │
        │ scheduled work      │
        └─────────────────────┘

External systems:

GitHub ───────┐
Slack/Discord ├── Webhook/Integration Services
Gemini/LLM ───┘
```

Do not introduce every component immediately.

Start with the simplest architecture that supports the current phase.

---

# 2. Architectural Principles

## Multi-tenancy

Team membership defines access.

Conceptually:

```text
User
 ├── TeamMembership ── Team
 │                       └── Projects
 │                            └── Tasks
 │
 └── Personal settings
```

Tenant-scoped data must be filtered server-side.

Never trust a client-supplied `teamId` to determine authorization.

---

# 3. Recommended Layers

## Frontend

```text
frontend/
├── src/
│   ├── components/
│   ├── pages/
│   ├── layouts/
│   ├── hooks/
│   ├── services/
│   ├── state/
│   ├── utils/
│   └── styles/
```

Use feature-oriented organization if the existing codebase already follows it.

Do not restructure the frontend solely to match this document.

---

## Backend

Recommended conceptual structure:

```text
backend/
├── src/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── middleware/
│   ├── validators/
│   ├── repositories/
│   ├── jobs/
│   ├── integrations/
│   ├── ai/
│   ├── utils/
│   └── config/
```

Responsibilities:

### Routes
HTTP endpoint definitions.

### Controllers
Translate HTTP requests into application operations.

### Services
Business logic.

### Repositories
Database access where the architecture benefits from a clear data-access layer.

### Validators
Zod schemas and request validation.

### Middleware
Authentication, authorization, rate limiting, tenant context, error handling.

### Jobs
Background work.

### Integrations
GitHub, Slack, Discord, webhooks.

### AI
LLM orchestration and structured-output validation.

---

# 4. Authentication Flow

```text
Browser
  │
  │ credentials
  ▼
POST /auth/login
  │
  ▼
Authentication service
  │
  ▼
JWT
  │
  ▼
Authenticated API requests
```

Every protected request must establish the authenticated user before accessing tenant resources.

---

# 5. Authorization Flow

```text
Request
  ↓
Authenticate user
  ↓
Resolve resource
  ↓
Resolve user's team membership
  ↓
Check role/permission
  ↓
Check tenant ownership
  ↓
Business operation
```

Never perform:

```text
findTask(taskId)
→ return task
```

without ensuring the authenticated user can access that task.

---

# 6. Target Domain Model

Conceptual model:

```text
User
 │
 ├── TeamMembership ─── Team
 │                        │
 │                        ├── Project
 │                        │    └── Task
 │                        │         ├── Subtask
 │                        │         ├── Comment
 │                        │         ├── Activity
 │                        │         ├── Notification
 │                        │         └── Attachment
 │                        │
 │                        └── TeamMember
 │
 └── Notification
```

Potential models:

```text
User
Team
TeamMembership
Project
ProjectMember
Task
TaskLabel
Label
Subtask
Comment
Activity
Notification
SavedView
TaskTemplate
Webhook
WebhookDelivery
ApiKey
Integration
Attachment
```

Do not add a model until the feature actually requires it.

---

# 7. Task Ownership

A task should conceptually belong to:

```text
Team
└── Project
    └── Task
```

If projects are optional, the task may temporarily have a nullable project relationship.

The authorization model must still guarantee that the task belongs to a team accessible by the current user.

---

# 8. AI Architecture

AI must not have unrestricted database access.

Target flow:

```text
User
 ↓
Frontend
 ↓
Authenticated API
 ↓
AI Service
 ↓
Authorized Context Builder
 ↓
LLM
 ↓
Structured Output Schema
 ↓
Business Validation
 ↓
User Confirmation
 ↓
Application Service
 ↓
Database
```

Example:

```text
"Break down this task"
        ↓
Gemini
        ↓
JSON schema
        ↓
validate
        ↓
display suggestions
        ↓
user approves
        ↓
create subtasks
```

The LLM must never directly execute SQL.

---

# 9. Real-Time Architecture

If WebSockets are selected:

```text
Client A ─────┐
              │
Client B ─────┼── WebSocket Gateway
              │
Client C ─────┘
                     │
                     ▼
              Application Events
                     │
                     ▼
               Authorization
                     │
                     ▼
               Broadcast Event
```

Events should be scoped to the correct team/project.

Never broadcast a private task event to every connected user.

---

# 10. Background Jobs

Use background processing for work that should not block normal API requests.

Potential jobs:

```text
sendNotification
sendEmail
deliverWebhook
retryWebhook
generateWeeklyInsights
processAttachment
syncGitHub
```

Do not introduce a queue system until background work actually requires it.

---

# 11. Caching

Redis may eventually support:

- frequently accessed dashboard data
- rate limiting
- session/temporary state where appropriate
- job queues
- short-lived search/cache results

Do not cache authorization decisions in a way that can create stale security permissions.

Always invalidate or expire cached data correctly.

---

# 12. Observability

Track:

```text
Request
 ↓
Logs
 ↓
Metrics
 ↓
Errors
 ↓
Traces
```

Important metrics:

- API latency
- error rate
- request count
- database latency
- queue depth
- webhook failures
- AI latency
- AI failure rate
- external integration failures

Sensitive data must not be logged.

---

# 13. Deployment

Target environments:

```text
Development
    ↓
CI
    ↓
Staging
    ↓
Production
```

Production should have:

- separate secrets
- separate database/environment
- HTTPS
- monitoring
- backups
- rollback strategy
- health checks
- CI/CD

Never use production credentials in development.

---

# 14. Infrastructure as Code

When Terraform is introduced:

```text
infra/
├── modules/
│   ├── networking/
│   ├── database/
│   ├── compute/
│   └── monitoring/
└── environments/
    ├── staging/
    └── production/
```

Keep environment-specific configuration separate.

---

# 15. Security Boundaries

Primary boundaries:

```text
Browser
  │
  │ untrusted input
  ▼
API
  │
  ├── authentication
  ├── validation
  ├── authorization
  └── tenant isolation
  │
  ▼
Application services
  │
  ▼
Database
```

External integrations are also untrusted boundaries.

Validate all incoming webhooks.

Verify webhook signatures where supported.

---

# 16. Architecture Decision Rule

Before introducing a new technology, answer:

```text
Why is it needed?
What problem does it solve?
Can the existing stack solve it?
What operational cost does it add?
How will it be tested?
How will it be monitored?
How will it be removed if necessary?
```

Prefer boring, maintainable architecture over technology for its own sake.
