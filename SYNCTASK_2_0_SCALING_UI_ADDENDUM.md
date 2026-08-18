# SyncTask 2.0 — Scaling & UI Modernization Addendum for Gemini Antigravity

> **Purpose:** This document extends `TASKFLOW_2_0_ANTIGRAVITY_PLAN_UPDATED.md`. It does not replace it.
> Antigravity must treat the master plan (rules, priorities, phase workflow, gap-audit process) as still authoritative. This addendum only adds new phases.
>
> **New phases in this document:** 43, 44, 45, 46
> **Do not renumber or touch Phases 0–42 in the master plan.**
> **Only implement the phase(s) the user explicitly asks for. Do not silently expand scope.**

---

## 0. Why this addendum exists

The current foundation (Phases 0–34, per the progress matrix) has app-level tenant isolation, JWT auth, and a working design system. As the user base grows, three backend gaps and one frontend gap become priorities:

1. Tenant isolation currently lives **only in application code** (Prisma `WHERE teamId = ...` clauses). One missed `WHERE` clause in a new route is a full cross-tenant data leak. **Row-Level Security (RLS)** adds a database-enforced second layer that fails closed even if application code has a bug.
2. Auth is currently **stateless JWT only**. There is no way to revoke a token, force logout, see active sessions, or kill a compromised session. **Server-side sessions** solve this.
3. There is no caching layer yet (Redis caching is listed as pending under Phase 36). As traffic grows, repeated expensive queries (dashboard analytics, search, notification counts) will become the main latency and DB-load problem. This addendum makes caching concrete instead of a bullet list.
4. The UI currently uses a hand-rolled design system. The user wants to adopt **shadcn/ui** for velocity, accessibility, and consistency going forward, without a disruptive full rewrite.

---

## 1. Ground rules specific to this addendum

1. **Inspect before assuming.** Do not assume RLS, sessions, or caching are absent — verify against the actual repository first, per the master plan's Phase Execution Rules.
2. **RLS is defense-in-depth, not a replacement.** Existing application-level tenant checks (RBAC, `WHERE teamId = ...`) must remain. RLS must never become the *only* isolation mechanism, and application logic must never assume RLS will silently save it — errors from missing session context should fail loudly in tests.
3. **Sessions and caching share infrastructure.** Plan the Redis (or equivalent) deployment once — it will back both the session store (Phase 44) and the cache layer (Phase 45). Don't stand up two separate Redis instances.
4. **shadcn/ui migration is incremental.** No big-bang rewrite of the frontend. Primitives first, screens second, old design system removed last, only after nothing references it.
5. **Every phase below still follows the master plan's Standard Feature Workflow** (Inspect → Plan → Implement → Test → Run → Review → Document → Report) and the Phase Completion Standard / Do Not Fake Completion rules.

---

# Phase 43 — Row-Level Security (Defense-in-Depth Tenant Isolation)

## Goal

Add database-enforced Row-Level Security on every tenant-scoped table, so a query missing a `teamId`/`projectId` filter is blocked by Postgres itself, not just by application code.

## Why

Prisma does not use Supabase's `auth.uid()` session automatically — the app authenticates via its own JWT, not Supabase Auth. RLS policies must therefore key off a **session variable set per request**, not off Supabase's built-in auth helpers.

## Step 1 — Inspect

- Enumerate every table that contains a `teamId`, `projectId`, or otherwise tenant-scoped column (tasks, projects, comments, notifications, activity logs, labels, attachments, webhooks, API keys, etc.).
- Identify the current Prisma client setup (connection pooling method, whether Prisma uses a single shared pool or per-request client).
- Confirm whether the app currently connects to Postgres directly or through Supabase's pooler (PgBouncer) — this affects whether `SET LOCAL` inside a transaction is reliable.

## Step 2 — Plan

- Enable `ROW LEVEL SECURITY` on each tenant-scoped table.
- Create a Postgres session variable convention, e.g. `app.current_team_id`, set via `SET LOCAL app.current_team_id = '<uuid>'` at the start of every request-scoped transaction.
- Write RLS policies of the form:

```sql
CREATE POLICY tenant_isolation_select ON tasks
  FOR SELECT
  USING (team_id = current_setting('app.current_team_id', true)::uuid);
```

  (mirror for `INSERT`/`UPDATE`/`DELETE`, and repeat per table).

- Decide how the app's Prisma middleware or a request-scoped Express middleware wraps each request in a transaction that sets this variable before any query runs. `prisma.$transaction` with an interactive transaction, or a `$extends` client extension, are the two realistic options — pick the one that fits the existing Prisma version with the least disruption.
- Plan a **migration-safe rollout**: RLS should be added table-by-table, verified in a staging environment, with a fast rollback path (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`) if something breaks.
- Decide how background jobs / admin scripts / migrations that intentionally need cross-tenant access will bypass RLS safely (a dedicated Postgres role with `BYPASSRLS`, used only for trusted internal jobs — never exposed to request handlers).

## Step 3 — Implement

- Enable RLS + policies per table, starting with the highest-risk table (tasks) as a pilot before rolling out to the rest.
- Add the session-variable-setting middleware.
- Ensure connection pooling behavior is compatible with `SET LOCAL` (transaction-scoped, not connection-scoped, to avoid leaking tenant context across pooled connections).

## Step 4 — Test

- A query with no session variable set must return zero rows (or error), never another tenant's data.
- A query with team A's session variable must never return team B's rows, even if application code forgets a `WHERE` clause.
- Verify pooled-connection safety: run concurrent requests for two different teams and confirm no cross-contamination under load.
- Verify background jobs using the `BYPASSRLS` role still work and are not reachable from any user-facing route.

## Risks to call out explicitly in the phase report

- Performance impact of RLS policy evaluation on large tables (check `EXPLAIN ANALYZE` before/after).
- Connection pooler compatibility (PgBouncer in transaction mode is required for `SET LOCAL` to be safe; session mode can leak variables across requests).

---

# Phase 44 — Server-Side Session Management

## Goal

Move from pure stateless JWT to a hybrid model: short-lived JWT access tokens + server-tracked sessions, enabling revocation, "log out of all devices," active session visibility, and safer refresh handling.

## Step 1 — Inspect

- Confirm current auth flow: token lifetime, refresh mechanism (if any), where JWTs are stored client-side (localStorage vs httpOnly cookie).
- Identify whether a Redis instance already exists in the deployment (from Phase 34 IaC work) or needs to be provisioned.

## Step 2 — Plan

- **Access token:** short-lived JWT (e.g. 10–15 min), unchanged in shape/claims unless there's a strong reason.
- **Session record:** stored server-side (Redis, keyed by session ID or refresh-token hash) containing: user ID, team ID, device/user-agent info, created-at, last-active-at, expiry.
- **Refresh token:** long-lived, opaque (not a JWT), httpOnly + Secure + SameSite cookie, rotated on every use (rotate-and-invalidate-previous to detect token theft).
- **Revocation:** deleting a session record from Redis immediately invalidates that refresh token; access tokens still expire naturally within their short window (acceptable staleness, document this tradeoff).
- **New endpoints:**
  - `GET /auth/sessions` — list the current user's active sessions (device, location if available, last active).
  - `DELETE /auth/sessions/:id` — revoke one session.
  - `POST /auth/logout-all` — revoke all sessions for the user.
- **New UI:** a "Active Sessions" panel in Settings, using the shadcn `Table`/`Card` components from Phase 46 if that phase is done first — otherwise use existing design system and revisit later.

## Step 3 — Implement

- Redis-backed session store.
- Refresh-token rotation with theft detection (if an already-rotated refresh token is reused, revoke the entire session family and force re-login).
- Session listing/revocation endpoints, properly scoped to `req.user.id` only — never allow revoking another user's session.

## Step 4 — Test

- Refresh rotation works and old refresh tokens are rejected after rotation.
- Revoking a session immediately blocks further refreshes for that session.
- Reused/stolen refresh token triggers full session-family revocation.
- Session listing never leaks another user's sessions.
- Logout-all actually invalidates every session, including the one making the request.

---

# Phase 45 — Backend Caching & Read Scalability

## Goal

Make the Redis instance provisioned in Phase 44 do double duty as a cache layer, and give Antigravity a concrete, measurable caching strategy instead of the generic "Redis caching" bullet in Phase 36.

## Step 1 — Inspect

- Identify the most expensive/most frequent read endpoints — almost certainly: dashboard analytics (Phase 17), notification unread counts (Phase 21), search (Phase 25), AI insights (Phase 29).
- Check for existing N+1 query patterns in Prisma calls feeding these endpoints before caching papers over a query problem.

## Step 2 — Plan

- **Cache-aside pattern**: read from Redis first; on miss, query Postgres, populate Redis with a TTL, return.
- **Per-key tenant scoping**: every cache key must include `teamId` (and `projectId`/`userId` where relevant) to prevent cross-tenant cache pollution — this is a second, independent isolation boundary alongside RLS.
- **Invalidation**: on writes that affect a cached aggregate (e.g. a task status change affecting dashboard counts), explicitly invalidate or update the relevant cache keys rather than relying on TTL alone for anything user-visible within the same session.
- **What NOT to cache**: anything requiring real-time accuracy per the existing WebSocket real-time system (Phase 22) — don't let stale cache fight live socket updates.
- **Background jobs**: for expensive recomputation (e.g. nightly productivity rollups), consider a job queue (BullMQ on the same Redis) rather than computing on every request.
- **API-level caching**: HTTP caching headers (`ETag`/`Cache-Control`) for endpoints that are safe to cache at the client/CDN level, separate from the Redis server-side cache.

## Step 3 — Implement

- Redis caching for the top 2–3 identified hot endpoints first (measure before expanding).
- Explicit invalidation hooks on the relevant write paths.
- A small internal cache-key naming convention documented in `docs/implementation/` (e.g. `dashboard:{teamId}:{dateRange}`).

## Step 4 — Test

- Cache hit/miss behavior is correct.
- Tenant isolation of cache keys (team A can never read team B's cached data, including via key collisions).
- Invalidation actually clears stale data after a relevant write.
- Fallback behavior when Redis is unreachable: the app must degrade to direct DB queries, not error out.

## Measure and record (per master plan Phase 36 rules — never invent numbers)

```text
Before: <measured average response time>
After:  <measured average response time>
```

---

# Phase 46 — Design System Migration to shadcn/ui

## Goal

Adopt shadcn/ui as the component foundation going forward, without a disruptive rewrite and without breaking `DESIGN.md` visual consistency or existing accessibility work.

## Step 1 — Inspect

- Read `DESIGN.md` and the current component library (tokens: colors, spacing, radii, typography, existing Tailwind config if any).
- Inventory every existing shared UI primitive currently in use (buttons, inputs, dialogs/modals, dropdowns, cards, tabs, toasts, tables) and where each is used across the app.
- Confirm Tailwind CSS is already in place (shadcn/ui requires it) — if not, that setup step comes first and is its own risk to flag.

## Step 2 — Plan

- Install shadcn/ui and map its theme configuration (`tailwind.config`, CSS variables) to the **existing** `DESIGN.md` tokens rather than shadcn's defaults — the goal is shadcn primitives wearing SyncTask's existing visual identity, not a generic shadcn look.
- Migration order (primitives with the highest reuse and lowest risk first):
  1. Button, Input, Label, Textarea
  2. Dialog/Modal, Dropdown Menu, Popover
  3. Card, Badge, Tabs
  4. Table (used by Phase 44's session list, search results, etc.)
  5. Toast/notifications
  6. Anything more bespoke (Kanban card, task detail drawer) stays custom — shadcn is for primitives, not a replacement for SyncTask-specific components.
- One shared primitive replaced at a time, verified across every screen that uses it, before moving to the next.
- Only delete the old design-system component **after** every usage has been migrated and verified — no dead code left half-migrated.

## Step 3 — Implement

- Replace primitives incrementally per the order above.
- Keep prop APIs of the new components as close as possible to the old ones where feasible, to minimize churn in call sites.

## Step 4 — Test / Review

- Visual regression check against `DESIGN.md` after each primitive migration.
- Re-verify responsive behavior and WCAG-oriented accessibility (existing requirement in the master plan) for every migrated component — shadcn's Radix-based accessibility should be equal or better, but confirm rather than assume.
- Confirm dark/light mode (if implemented) still works with the new theme mapping.

## Risks to call out explicitly

- Bundle size impact of adding Radix primitives underneath shadcn.
- Any custom component that visually depends on the old design system's exact CSS (rather than tokens) may need manual rework, not just a swap.

---

## 2. Additional Scale-Readiness Considerations (for Antigravity to flag, not necessarily implement immediately)

When the user asks "what else should I consider as this grows," these are the standard next items beyond RLS/sessions/caching/UI — list them for the user rather than implementing silently:

- **Database connection pooling** (PgBouncer/Supabase pooler) sized correctly once RLS's `SET LOCAL` requirement (transaction-mode pooling) is accounted for.
- **Read replicas** for analytics/reporting queries once the primary DB shows contention.
- **Cursor-based pagination** instead of offset pagination on large lists (tasks, activity logs) — offset pagination degrades badly at scale.
- **Background job queue** (BullMQ or similar) for anything not required synchronously — email sending, AI calls, analytics rollups, webhook delivery.
- **Rate limiting per-tenant**, not just global, so one noisy team can't degrade service for others.
- **Horizontal backend scaling**: since sessions/cache now live in Redis (not in-process memory), confirm the Express app is fully stateless and safe to run as multiple instances behind a load balancer.
- **File/attachment storage**: confirm attachments (Phase 19) use object storage (S3/Supabase Storage) with signed URLs, not local disk, so it scales past a single server.
- **Database index audit** as query patterns mature — don't guess, use `EXPLAIN ANALYZE` on real slow queries.
- **N+1 query audit** in Prisma calls feeding dashboard/analytics/search before assuming caching alone fixes latency.

---

## 3. Reporting format for this addendum

Use the master plan's existing Phase 8 report format for each phase implemented:

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

Additionally, for Phase 43 and 45, include a short **isolation verification note** confirming cross-tenant leakage was actively tested and not just assumed absent.
