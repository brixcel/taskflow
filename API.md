# TaskFlow API Specification

> **Status:** Target API contract for TaskFlow 2.0.
>
> This document is a planning contract, not proof that every endpoint already exists. Antigravity must inspect the current backend before implementing or changing routes.
>
> Preserve existing endpoint contracts where possible. When an endpoint already exists with a different shape, document the actual implementation and migrate deliberately rather than silently breaking clients.

---

# 1. API Conventions

Base URL:

```text
/api
```

Authentication:

```text
Authorization: Bearer <token>
```

JSON request/response bodies unless otherwise specified.

---

# 2. Standard Response Patterns

Successful resource:

```json
{
  "data": {}
}
```

Collection:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request.",
    "details": {}
  }
}
```

Do not expose stack traces or internal implementation details.

---

# 3. Authentication

## POST /auth/register

Create an account.

Request:

```json
{
  "email": "user@example.com",
  "password": "secure-password"
}
```

Response:

```json
{
  "data": {
    "user": {}
  }
}
```

Validation must be performed server-side.

---

## POST /auth/login

Authenticate a user.

Request:

```json
{
  "email": "user@example.com",
  "password": "secure-password"
}
```

Response:

```json
{
  "data": {
    "token": "...",
    "user": {}
  }
}
```

---

## POST /auth/forgot-password

Request password reset.

---

## POST /auth/reset-password

Reset password using a valid reset token.

---

## GET /auth/verify-email

Verify email using a verification token.

---

# 4. Users

## GET /users/me

Return the authenticated user.

---

## GET /users/me/export

Export user data according to the application's GDPR-lite behavior.

---

## DELETE /users/me

Soft-delete/anonymize the account according to the existing policy.

---

# 5. Teams

## GET /teams

List teams accessible to the authenticated user.

---

## POST /teams

Create a team.

Request:

```json
{
  "name": "Engineering"
}
```

---

## GET /teams/:teamId

Return team information.

Authorization is mandatory.

---

## PATCH /teams/:teamId

Update team information.

Requires appropriate team role.

---

## DELETE /teams/:teamId

Delete/archive team according to the application's policy.

---

# 6. Team Members

## GET /teams/:teamId/members

List members.

---

## POST /teams/:teamId/members/invite

Invite a member.

---

## PATCH /teams/:teamId/members/:userId

Change membership role.

Example:

```json
{
  "role": "admin"
}
```

---

## DELETE /teams/:teamId/members/:userId

Remove a member.

All operations must enforce RBAC.

---

# 7. Projects

## GET /teams/:teamId/projects

List projects.

---

## POST /teams/:teamId/projects

Create project.

Request:

```json
{
  "name": "Website Redesign",
  "description": "Redesign the company website."
}
```

---

## GET /projects/:projectId

Get project.

---

## PATCH /projects/:projectId

Update project.

---

## DELETE /projects/:projectId

Delete/archive project.

---

## GET /projects/:projectId/tasks

List project tasks.

---

# 8. Tasks

## GET /tasks

List authorized tasks.

Supported filters:

```text
status
assigneeId
priority
projectId
label
due
search
page
limit
```

Example:

```text
GET /tasks?status=todo&assigneeId=me&priority=high
```

---

## POST /tasks

Create a task.

Example:

```json
{
  "title": "Redesign login page",
  "description": "Improve the login experience.",
  "status": "todo",
  "priority": "high",
  "assigneeId": "user-id",
  "projectId": "project-id",
  "dueDate": "2026-08-20"
}
```

Do not trust client-supplied ownership fields.

---

## GET /tasks/:taskId

Get a task.

---

## PATCH /tasks/:taskId

Update a task.

---

## DELETE /tasks/:taskId

Delete/archive a task.

---

# 9. Kanban

## PATCH /tasks/:taskId/status

Change task status.

Request:

```json
{
  "status": "in_progress"
}
```

---

## PATCH /tasks/:taskId/order

Change task ordering.

Request:

```json
{
  "position": 1200
}
```

The exact ordering algorithm is implementation-dependent.

---

# 10. Subtasks

## GET /tasks/:taskId/subtasks

List subtasks.

---

## POST /tasks/:taskId/subtasks

Create subtask.

---

## PATCH /subtasks/:subtaskId

Update subtask.

---

## DELETE /subtasks/:subtaskId

Delete subtask.

---

# 11. Comments

## GET /tasks/:taskId/comments

List comments.

---

## POST /tasks/:taskId/comments

Create comment.

Request:

```json
{
  "body": "I finished the first draft."
}
```

---

## PATCH /comments/:commentId

Edit comment.

---

## DELETE /comments/:commentId

Delete comment.

---

# 12. Activity

## GET /tasks/:taskId/activity

Return authorized activity history.

Potential events:

```text
task.created
task.updated
task.assigned
task.completed
comment.created
subtask.created
```

---

# 13. Notifications

## GET /notifications

Query parameters:

```text
unread
page
limit
```

---

## PATCH /notifications/:notificationId/read

Mark notification read.

---

## POST /notifications/read-all

Mark all authorized notifications read.

---

## DELETE /notifications/:notificationId

Delete notification.

---

# 14. Dashboard Analytics

## GET /dashboard/summary

Return high-level metrics.

Potential response:

```json
{
  "data": {
    "totalTasks": 100,
    "completedTasks": 62,
    "overdueTasks": 8,
    "completionRate": 0.62
  }
}
```

---

## GET /dashboard/task-status

Return status distribution.

---

## GET /dashboard/workload

Return authorized workload distribution.

---

## GET /dashboard/activity

Return recent activity.

---

# 15. Calendar

## GET /calendar/tasks

Query:

```text
from
to
projectId
assigneeId
```

Return authorized tasks in the requested date range.

---

## PATCH /tasks/:taskId/due-date

Update task due date.

---

# 16. Search

## GET /search

Potential query:

```text
GET /search?q=status%3Atodo+assignee%3Ame
```

The server should parse structured filters safely.

The search engine must enforce authorization after parsing filters.

---

# 17. Saved Views

## GET /views

List user/team views.

---

## POST /views

Create saved view.

Example:

```json
{
  "name": "My High Priority Tasks",
  "filters": {
    "assignee": "me",
    "priority": ["high"]
  }
}
```

---

## PATCH /views/:viewId

Update view.

---

## DELETE /views/:viewId

Delete view.

---

# 18. Task Templates

## GET /task-templates

List templates.

---

## POST /task-templates

Create template.

---

## POST /task-templates/:templateId/apply

Create tasks/subtasks from a template.

Validate the resulting objects through normal business rules.

---

# 19. AI

## POST /ai/task-assist

Generate structured task suggestions.

Request:

```json
{
  "prompt": "Create a task for redesigning the login page."
}
```

Response should use strict structured output:

```json
{
  "data": {
    "title": "Redesign login page",
    "description": "...",
    "priority": "high",
    "subtasks": []
  }
}
```

---

## POST /ai/task-breakdown

Generate proposed subtasks.

---

## POST /ai/project-plan

Generate a proposed project hierarchy.

The user must approve mutations.

---

## GET /ai/productivity-insights

Generate insights from an authorized date range.

---

## POST /ai/search

Convert natural language into structured search filters.

The resulting filters must be validated before executing the search.

The model must never generate raw SQL.

---

# 20. Webhooks

## GET /webhooks

List authorized webhook endpoints.

---

## POST /webhooks

Create webhook.

Request:

```json
{
  "url": "https://example.com/taskflow-webhook",
  "events": [
    "task.created",
    "task.completed"
  ]
}
```

---

## PATCH /webhooks/:webhookId

Update webhook.

---

## DELETE /webhooks/:webhookId

Delete webhook.

---

## GET /webhooks/:webhookId/deliveries

View delivery history.

---

# 21. API Keys

## GET /api-keys

List API key metadata.

Never return full secrets.

---

## POST /api-keys

Create API key.

The secret should be shown only when created if the security design requires one-time display.

---

## DELETE /api-keys/:keyId

Revoke key.

---

# 22. GitHub Integration

## GET /integrations/github

Get GitHub integration status.

---

## POST /integrations/github/connect

Begin connection flow.

---

## DELETE /integrations/github

Disconnect integration.

---

## POST /integrations/github/sync

Trigger authorized synchronization.

---

# 23. Slack / Discord Integrations

Use provider-specific integration routes or a unified integration service.

Potential operations:

```text
connect
disconnect
configure
test
```

Do not expose integration secrets.

---

# 24. Real-Time Events

WebSocket/SSE event names:

```text
task.created
task.updated
task.deleted
task.assigned
task.completed
comment.created
comment.updated
notification.created
project.updated
```

Each event should contain only data necessary for the authorized recipients.

Example:

```json
{
  "type": "task.updated",
  "teamId": "...",
  "projectId": "...",
  "taskId": "...",
  "changes": {
    "status": "done"
  }
}
```

---

# 25. API Security Rules

Every protected endpoint must answer:

```text
Who is the user?
Which team does the resource belong to?
Is the user a member?
What role do they have?
Are they allowed to perform this action?
```

Never rely solely on frontend route protection.

---

# 26. API Testing Requirements

For every new endpoint test:

```text
[ ] Valid authenticated request
[ ] Unauthenticated request
[ ] Invalid input
[ ] Unauthorized role
[ ] Wrong-team resource
[ ] Resource not found
[ ] Success response
[ ] Error response
```

For tenant-scoped endpoints, cross-team access must be explicitly tested.

---

# 27. API Versioning

Do not introduce `/v2` merely because TaskFlow is now version 2.0.

Version only when an incompatible public API change genuinely requires it.

Prefer backwards-compatible additions.

---

# 28. API Documentation Rule

When an endpoint changes, update this file.

For each production endpoint document:

```text
Method
Path
Authentication
Required role
Request body
Query parameters
Response
Errors
Tenant scope
Example
```

The API documentation must describe the actual implementation after each completed phase.
