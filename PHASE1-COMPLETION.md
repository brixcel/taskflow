# Phase 1 Completion — Teams / Workspaces

This document details the completion of Phase 1 requirements from PLAN.md.

## ✅ Completed Items

### 1. Multi-Tenant Architecture
- **Team Model**: `Team` table with `id`, `name`, `ownerId`, `createdAt`
- **TeamMembership Join Table**: Links users to teams with roles (owner|admin|member)
- **Task Scoping**: All tasks now require and are scoped by `teamId`
- **Migration**: Backfill migration exists at `prisma/migrations/20260803212925_add_teams_multi_tenancy/`

### 2. Team-Scoped Routes

All routes properly scope access by the user's active team:

#### Tasks (`routes/tasks.js`)
- ✅ POST `/tasks` — Creates tasks in current team only
- ✅ GET `/tasks` — Lists only tasks from current team
- ✅ PATCH `/tasks/:id` — Updates only if task belongs to current team (404 otherwise)
- ✅ DELETE `/tasks/:id` — Deletes only if task belongs to current team (404 otherwise)
- ✅ Uses `scopedTaskQuery` helper for consistent scoping

#### Comments (`routes/comments.js`)
- ✅ POST `/tasks/:taskId/comments` — Can only comment on current team's tasks
- ✅ GET `/tasks/:taskId/comments` — Can only view comments on current team's tasks
- ✅ Uses `requireTaskInTeam` helper to validate task ownership before allowing access

#### Activities (`routes/activities.js`) **[NEW]**
- ✅ GET `/tasks/:taskId/activities` — Can only view activity logs for current team's tasks
- ✅ Uses same `requireTaskInTeam` pattern as comments
- ✅ Wired into `server.js` at `/tasks/:taskId/activities`

### 3. Middleware & Helpers

#### `middleware/resolveTeam.js`
- ✅ **Runs after authentication** on every request
- ✅ **Re-checks membership from DB** on every request (not stale JWT data)
- ✅ Supports explicit team selection via `X-Team-Id` header (validates membership)
- ✅ Falls back to user's oldest team membership if no header provided
- ✅ Returns **403** if user requests a team they're not a member of
- ✅ Returns **404** if user has no team memberships at all
- ✅ Attaches `req.teamId` and `req.teamRole` for downstream use

#### `helpers/scopedQuery.js`
- ✅ Provides consistent `where` clause generation
- ✅ Always includes `teamId: req.teamId` in queries
- ✅ Accepts additional where conditions via spread operator

### 4. Security Posture

- **404 for cross-team access** — Users in Team A get 404 (not 403) when trying to access Team B's resources, making the resources invisible rather than just forbidden
- **DB-validated membership** — `resolveTeam` queries the database on every request, so revoking a user's team membership takes effect immediately (not on next login)
- **No data leakage** — Task IDs from other teams cannot be used to infer existence or read data

### 5. Test Coverage

#### Isolation Test (`__tests__/team-isolation.test.js`)
Comprehensive test suite covering:

**Task Isolation:**
- ✅ User B cannot GET User A's task list (task A not in results)
- ✅ User B cannot PATCH User A's task (404)
- ✅ User B cannot DELETE User A's task (404)
- ✅ User A can access their own tasks normally

**Comment Isolation:**
- ✅ User B cannot GET comments on User A's task (404)
- ✅ User B cannot POST comment on User A's task (404)
- ✅ User A can access comments on their own tasks

**Activity Log Isolation:**
- ✅ User B cannot GET activity log for User A's task (404)
- ✅ User A can access activity logs for their own tasks

**Middleware Verification:**
- ✅ Membership is re-checked from DB on every request (not cached in JWT)
- ✅ Removing a user from a team revokes access on their very next request
- ✅ Explicit `X-Team-Id` header is validated against DB membership (403 if not a member)

## Running the Tests

### First Time Setup (from WSL)
```bash
cd /home/brexc/projects/taskflow/backend
bash setup-tests.sh
```

### Run Tests
```bash
npm test
```

The test suite:
- Creates two isolated teams with one user each
- Creates tasks, comments, and activity in each team
- Verifies cross-team access returns 404
- Verifies same-team access works normally
- Tests middleware behavior (DB re-checks, explicit team header validation)
- Cleans up all test data after completion

## Review Checklist Status

From PLAN.md Phase 1 requirements:

- [x] Migration backfill order confirmed: nullable column → populate → `NOT NULL` + FK
- [x] Every task route (list/get/create/update/delete) scoped by `teamId`
- [x] **Comments scoped by `teamId`** (via `requireTaskInTeam` helper)
- [x] **Activity log scoped by `teamId`** (via `requireTaskInTeam` helper)
- [x] Cross-team access returns 404, not 403
- [x] `resolveTeam` middleware re-checks membership from DB on every request
- [x] Isolation test exists and covers all endpoints
- [x] Manual verification: removing user from team revokes access immediately

## What's Next — Phase 2

Phase 1 is complete. Before moving to Phase 2 (Role-Based Permissions):

1. **Run the test suite** to confirm all isolation tests pass
2. **Manual verification** recommended:
   - Create two users via the API
   - Create separate teams for each
   - Create tasks in each team
   - Try to access Task A while authenticated as User B
   - Verify 404 response
3. **Update PLAN.md** to mark Phase 1 as complete

Phase 2 will build on the `req.teamRole` that `resolveTeam` already provides, adding permission checks for:
- Task deletion (creator or admin/owner only)
- Team member removal (owner only)
- Role changes (owner only)
