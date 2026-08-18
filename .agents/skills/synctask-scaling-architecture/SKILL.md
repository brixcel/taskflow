---
name: synctask-scaling-architecture
description: >-
  SyncTask 2.0 Scaling & Architecture skill. Covers Postgres Row-Level Security (RLS, Phase 43),
  Server-Side Redis Sessions & token revocation (Phase 44), Backend Redis Caching & Cache-Aside (Phase 45),
  and scale-readiness patterns (connection pooling, read replicas, cursor pagination, BullMQ jobs, rate limiting).
---

# SyncTask 2.0 Scaling & Architecture Skill

> **Source of Truth**: [`SYNCTASK_2_0_SCALING_UI_ADDENDUM.md`](file:///home/brexc/projects/taskflow/SYNCTASK_2_0_SCALING_UI_ADDENDUM.md)  
> This skill provides engineering guidance for backend scalability, database-enforced multi-tenancy, session lifecycle management, and high-performance caching.

---

## 1. Ground Rules for Scaling

1. **Defense-in-Depth, Not Replacement**: Database Row-Level Security (RLS) is an extra safety layer. Application-level authorization (`WHERE teamId = ...` and RBAC) must always remain.
2. **Shared Infrastructure**: Plan single Redis infrastructure to back both server-side sessions (Phase 44) and the cache layer (Phase 45).
3. **Inspect Before Assuming**: Verify whether connection poolers, Redis, or session schemas are already provisioned before designing additions.
4. **Failsafe Operations**: When caching or secondary services fail, degrade gracefully to Postgres rather than breaking user requests.

---

## 2. Phase 43 — Row-Level Security (RLS)

Postgres-enforced tenant isolation ensures that a query missing a `teamId` filter is blocked by the database itself.

### Technical Mechanism
Because Prisma connects with custom JWTs rather than built-in Supabase Auth, RLS policies key off a **Postgres session variable** (`app.current_team_id`):

```sql
-- 1. Enable RLS on tenant-scoped tables
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- 2. Create tenant policy
CREATE POLICY tenant_isolation_select ON tasks
  FOR SELECT
  USING (team_id = current_setting('app.current_team_id', true)::uuid);

CREATE POLICY tenant_isolation_modify ON tasks
  FOR ALL
  USING (team_id = current_setting('app.current_team_id', true)::uuid)
  WITH CHECK (team_id = current_setting('app.current_team_id', true)::uuid);
```

### Request Lifecycle & Connection Pooling
- **Session Variable Middleware**: Express middleware or Prisma `$extends` client extension sets `SET LOCAL app.current_team_id = '<uuid>'` inside a transaction for each request.
- **PgBouncer Compatibility**: `SET LOCAL` is transaction-scoped. Connection poolers **must be in transaction mode** (not session mode) so tenant context never leaks across requests.
- **Bypass Role**: Trusted internal scripts, migrations, and system background jobs run under a dedicated Postgres role with `BYPASSRLS`. User-facing routes never use this role.

### Verification Checklist:
- [ ] Query with no session variable returns 0 rows (fails closed).
- [ ] Query with Team A's variable cannot read Team B's rows even without app-level filters.
- [ ] Concurrent requests from different tenants do not cross-contaminate under pooler load.

---

## 3. Phase 44 — Server-Side Session Management

Moves TaskFlow from stateless JWTs to a hybrid session architecture enabling instant token revocation, active device visibility, and token theft detection.

### Session Architecture
- **Access Token**: Short-lived JWT (10–15 minutes), containing user ID, active team ID, and role.
- **Session Record in Redis**:
  - Key: `session:{sessionId}` or hash of refresh token
  - Value: `{ userId, teamId, userAgent, ipAddress, createdAt, lastActiveAt, expiresAt }`
- **Refresh Token**: Opaque, long-lived token stored in `httpOnly`, `Secure`, `SameSite=Strict` cookie.
- **Theft Detection & Rotation**:
  - Every refresh rotates the refresh token.
  - If an already-rotated refresh token is reused, revoke the entire session family for that user immediately.

### Required Endpoints & Auth Contracts:
- `GET /auth/sessions` — List active sessions for `req.user.id` (browser, OS, last active, current flag).
- `DELETE /auth/sessions/:id` — Revoke a specific session (deletes key from Redis).
- `POST /auth/logout-all` — Revoke all sessions for `req.user.id`.

---

## 4. Phase 45 — Backend Caching & Read Scalability

Implements the **Cache-Aside** pattern on Redis for hot read paths.

### Cache Strategy
1. **Target Endpoints**:
   - Dashboard Analytics (`/api/analytics/dashboard`)
   - Unread Notification Counts (`/api/notifications/unread-count`)
   - Natural-Language / Workspace Search Aggregates
   - Team Member & Project Lists
2. **Key Naming Convention**:
   - Must be strictly tenant-scoped: `cache:{teamId}:{resource}:{paramsHash}`
   - Example: `cache:team_123:dashboard:2026-08`
3. **Invalidation Strategy**:
   - On write operations (task created/updated/deleted), explicitly invalidate corresponding team cache keys.
   - Pair with sensible TTLs (e.g., 60s to 300s).
4. **What NOT to Cache**:
   - Real-time WebSocket event payloads (Phase 22). Live socket updates must not fight stale cache.
5. **Fallback Safety**:
   - If Redis connection drops, catch the error, log a warning with request ID, and fetch directly from Postgres.

---

## 5. Scale-Readiness Architectural Patterns

When evaluating architectural growth beyond Phases 43–45:

| Problem | Scaling Pattern | Implementation Notes |
| :--- | :--- | :--- |
| **Offset Pagination Degradation** | Cursor-based pagination | Use `take: limit, skip: 1, cursor: { id: lastId }` for task feeds & activity logs |
| **Contention on Primary DB** | Read Replicas | Route heavy read-only reporting queries to replica connections |
| **Blocking Sync Operations** | BullMQ Job Queue | Offload email sending, AI completions, webhooks, and digest rollups |
| **Noisy Neighbor Abuse** | Per-Tenant Rate Limiting | Rate limit based on `{teamId}` in addition to client IP |
| **Stateless Scaling** | Horizontal API Instances | Keep no local in-memory session/cache state; rely on Redis |
| **File Storage Growth** | Object Storage (S3 / R2) | Use signed upload and download URLs; do not store files on API server disk |
| **Query Bottlenecks** | `EXPLAIN ANALYZE` Audits | Audit Prisma queries for missing indexes and N+1 loads before adding hardware |
