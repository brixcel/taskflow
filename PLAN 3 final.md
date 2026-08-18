# TaskFlow — Full Production Plan

> ## 🎯 Current Focus (read this first)
> **Active phase: Phase 45 — Time Tracking & Work Estimates**
>
> **Prior Progress: Phases 0–44 & Engineering Charter Hardening: ✅ ALL COMPLETE & VERIFIED**
> - 458+ automated tests passing with 100% success rate across 29 test suites.
> - Built-in: Multi-tenancy, RBAC, Validation, Sentry, GDPR, Due Dates, CI/CD, Analytics, Kanban, Subtasks, Notifications, Real-Time WebSockets, Projects, Calendar, AI Suite (Assistant, Breakdown, Planner, Insights, Natural Search, Universal Freelancer Agent & BYOK), Webhooks, GitHub/Slack/Discord integrations, Terraform IaC, Turnstile CAPTCHA, Optimized Attachments, Postgres Row-Level Security (RLS), Global Input Sanitization, Server-Side Redis Sessions, Backend Redis Cache-Aside Layer, Compound Indexes, Cursor Pagination, Slow Query Performance Monitoring, Production Observability & Prometheus Metrics (`/metrics`, `/health/live`, `/health/ready`), Universal Command Palette (`Cmd+K` / `Ctrl+K`), Task Templates & Workflow Automation, and Custom Views & Saved Filters.
>
> **Prioritized Next Steps (Tier 2 Execution):**
> 1. **Phase 45: Time Tracking & Work Estimates**.
> 2. **Phase 46: Export & Reporting Engine (CSV / PDF / JSON)**.
> 3. **Phase 47: Interactive Demo Mode & Instant Sandbox Workspaces**.
> 4. **Phase 48: UI Modernization & TypeScript Migration**.
>
> **This file is used across tools (Kiro and Antigravity).** See "Agent Reference" below for conventions.
>
> **When tagging this file, say which phase you mean** — e.g. "using PLAN.md, implement Phase 16" — so the agent doesn't try to reason about all 18 phases at once.
>
> _Update this block yourself as you finish phases — it's the only part of this file you need to keep current._

---

**Goal:** Take TaskFlow from a solid CRUD demo to a genuinely production-ready, multi-tenant tool — the kind you could actually let real strangers sign up for, not just a polished portfolio demo.

**What changed from the previous version of this doc:** Scope leveled up from "portfolio-worthy" to "production-ready." Phase 0 (Registration) and Phase 1 (Teams) keep the same numbers you're already using. Everything from Phase 2 onward is renumbered to make room for new phases that a real production app needs but a portfolio demo can skip — input validation, real email delivery, security hardening, backups, monitoring, and basic legal/compliance groundwork.


**Reality check before you start:** this is now genuinely comparable to a small startup's early roadmap — 17 phases, several of them non-trivial (security hardening, backups, compliance). That's normal, and it's a *good* thing to say out loud in interviews ("I shipped it, then hardened it in stages like a real team would") rather than something to rush through in a weekend. You don't have to finish all 17 phases before this is worth showing an employer — see the MVP-Production cutoff marked below.

**Testing convention (applies to every code phase below):** Kiro can run your test suite via its terminal access, not just write test files — so every prompt below asks it to write the test *and run it* in the same interaction, rather than treating "implement" and "verify" as two separate credit spends. If your tier supports hooks, consider setting one up to auto-run the backend test suite whenever files under `routes/` or `middleware/` change — that catches regressions from later phases touching earlier work, without you asking each time.

---

## 🤖 Agent Reference — Read This First (for any agent — Kiro/Claude or Antigravity/Gemini)

This section exists because this project is now built across two different AI tools, each with its own session, memory, and quota model. Read this whole section before touching code — it captures real conventions and real bugs already hit, so a new session in either tool doesn't rediscover them from scratch.

### Project summary
TaskFlow is a multi-tenant task management web app. Backend: Node/Express + PostgreSQL via Prisma. Frontend: React (Vite). Auth: JWT. What started as a single-tenant CRUD demo is now, as of this file, functionally complete through Phase 15 — teams, RBAC, validation, email flows, security hardening, observability, backups, GDPR-lite rights, legal pages, due dates, frontend polish, and CI/CD are all done. What remains is a design pass (Phase 13.5), manual QA, and deployment (Phase 16).

### Non-negotiable architecture rules (violating these has already caused real bugs — do not reintroduce them)

1. **Every team-scoped query must filter by `teamId`.** Tasks, comments, and activity log entries — not just the obvious table.
2. **Never trust a `teamId` sent by the client** for authorization. Always resolve the active team server-side from real `TeamMembership` rows via the established `resolveTeam` / `resolveTeamFromParam` middleware — don't invent a third pattern.
3. **Cross-team access to an existing resource returns 404, not 403** — a 403 leaks that the resource exists.
4. **Role checks happen before the resource is touched, not after.**
5. **Task deletion is nuanced:** a plain `member` may delete their own task; only `admin`/`owner` may delete someone else's.
6. **An owner can never remove themselves from a team** — must return 400, never silently no-op or 500.
7. **Any test/debug-only endpoint must hard-guard on `NODE_ENV === 'test'`**, return 404 otherwise, and this must be actually verified by running it with `NODE_ENV` unset — not just assumed from reading the code.
8. **Reset/verification tokens:** generate with `crypto.randomBytes`, store only a SHA-256 hash, invalidate old tokens on reissue, reject reused tokens.
9. **Auth failure responses must not leak account existence** — `/auth/forgot-password` always returns 200.

### Environment / tooling gotchas already hit (don't re-debug these)

- **Runs inside WSL** — Windows and Linux `node`/`npm` silently conflict. If a command fails with a path or module error, check `which node` / `which npm` before assuming it's an app bug.
- **`cd` into `backend/` before running `node server.js` directly** — running it from the repo root fails with `MODULE_NOT_FOUND`.
- **Test suites require `--runInBand`** (already set in `package.json`/`run-tests.sh`) — Jest's default parallel execution caused real fixture race conditions between suites.
- **Zod v4:** parse failures are at `result.error.issues`, not `.errors`; `.trim().min(1)` does not reject whitespace-only strings — use `.trim().refine(v => v.length >= 1, message)` instead.
- **Required-FK migrations on existing data:** nullable column → backfill every row → `NOT NULL` + FK constraint, in that order.

### Testing convention
Every implementation task should include writing an automated test **and running it** to confirm it passes, in the same session. Reuse the project's existing manual smoke-test scripts (`test-rbac.sh`, `test-validation.sh`, `test-password-reset.sh`, etc.) for anything needing API-level manual verification — match their existing output format.

### Using Antigravity with a Gemini Pro subscription

Antigravity's usage model has been genuinely unstable through 2026 — worth understanding so a long session doesn't die mid-task:

- **Usage is compute-based, not prompt-count-based.** Antigravity factors in request complexity, features used, and your total chat history length — not just "how many messages you sent." A long-running chat with lots of accumulated history costs more per message than a fresh one, even for a similar task.
- **Quotas are weekly and tier-based**, refreshed on a schedule rather than a hard monthly cap. Gemini Pro, Gemini Flash, and Claude models (if you use Claude inside Antigravity) draw from **separate quota pools** — running out on one doesn't block the others.
- **Google AI Pro ($20/mo) is the entry tier** and gives increased-but-limited quota for Gemini 3 Pro and other models; Ultra tiers exist above it for heavier daily use. Limits have swung significantly over 2026 (cuts, then emergency multi-fold increases after user backlash) — treat any specific number as likely stale and check `antigravity.google/docs/plans` for the current baseline before assuming what you have left.
- **Practical implications for this project:**
  - **Prefer starting a fresh chat/session per phase** rather than one long-running thread across many phases — long accumulated history is part of what drives up compute cost per message under the current system.
  - **If you hit a weekly lockout mid-phase**, that's a known, reported failure mode (not something you're doing wrong) — check whether Kiro can pick up the same phase in the meantime rather than waiting out the reset, since `PLAN.md` is shared context both tools can read.
  - **You can purchase additional AI credits** for overage beyond baseline quota if you're mid-phase and about to hit a wall — cheaper than losing momentum on something like Phase 16 deployment, where stopping halfway through a cloud config step is more disruptive than most.
  - Since Gemini/Antigravity and Kiro pull from separate services entirely, **switching tools is a legitimate way to keep working if one hits a quota wall** — this file's Agent Reference section exists specifically so either tool can pick up the plan with full context.

### How to use the rest of this file
The "Current Focus" block at the top tells you which phase is active — start there. Each phase has a ready-to-use prompt, a manual review checklist, and a status marker. Work phases in order — see "Order Discipline" near the end for dependencies. Update Current Focus yourself as phases complete, regardless of which tool you used.

---

---

## Current State (baseline)

- [x] User registration — backend only (`POST /auth/register`)
- [x] Login with JWT auth
- [x] Full task CRUD
- [x] Task assignment (`assigneeId` / `createdBy`)
- [x] Status tracking (todo / in_progress / done)
- [x] Comments on tasks
- [x] Activity/audit log per task
- [x] Backend filtering by status/assignee
- [x] Registration UI (`Register.jsx`) with client-side validation — Phase 0
- [x] Multi-tenant teams + membership + task scoping — Phase 1
- [x] Role-based permissions (RBAC) — Phase 2
- [x] Input validation & XSS sanitization (Zod + xss) — Phase 3
- [x] Assignee dropdown, My Tasks tab, debounced search — Phase 4
- [x] Password reset with email delivery (nodemailer) — Phase 5
- [x] Email verification on registration, resend option, unverified banner — Phase 6
- [x] Helmet headers, CORS locked to origin, startup env guard, npm audit script — Phase 7
- [x] Rate limiting (auth routes), `/health` endpoint, pagination, Dockerfile + docker-compose — Phase 8
- [x] Sentry error tracking (backend + frontend), sensitive field scrubbing — Phase 9
- [x] Automated backups, restore engine, verification script, disaster recovery runbook — Phase 10
- [x] GDPR-Lite data export & account soft-deletion/anonymization — Phase 11
- [x] Terms of Service & Privacy Policy pages + auth footers — Phase 12
- [x] Task due dates & overdue indicator — Phase 13
- [x] Frontend production polish (ErrorBoundary, TaskSkeleton, mobile drawer, WCAG AA) — Phase 14
- [x] CI/CD Pipeline (`ci.yml`, `deploy-staging.yml`) — Phase 15
- [x] Phase 13.5 — Design System (via Stitch)
- [x] Pre-Deployment Manual QA Checklist
- [x] Phase 16 — Production Deployment

---

## Milestones at a Glance

| Milestone | Phases | Focus |
|---|---|---|
| A — Multi-tenant core | 0–4 | Make the app safely usable by more than one team |
| B — Auth completeness | 5–6 | Real password reset + email verification |
| C — Security hardening | 7 | Headers, CORS, secrets, dependency scanning |
| **⭐ MVP-Production cutoff** | — | Phases 0–7 are the realistic minimum before real strangers create accounts and store real data |
| D — Operations & observability | 8–9 | Health checks, logging, error tracking, uptime alerts |
| E — Data integrity & compliance | 10–12 | Backups, GDPR-lite rights, legal basics |
| F — Polish | 13–14 | Due dates, frontend resilience & accessibility |
| G — Ship it | 15–16 | CI/CD gate, real staging/production deployment |

> ✅ Milestones A through G (Phases 0–15) are complete. Next up: Phase 13.5 (Design System via Stitch), Pre-Deployment Manual QA, and Phase 16 (Production Deployment).

---

## Milestone A — Multi-Tenant Core

### Phase 0 — Registration UI
**Why:** Nobody can sign up through the actual app right now.

**Kiro prompt:**
```
Add a Register.jsx page to this React app, matching the visual style of the existing 
Login.jsx. Wire it to the existing POST /auth/register endpoint. Add client-side 
validation for email format and password minimum length, and display any validation 
errors returned by the backend. Add a link between Login and Register pages so users 
can navigate between them. After implementing, write a test confirming valid 
credentials create a user and invalid ones show validation errors, then run the test 
suite to confirm it passes.
```

**Review checklist:**
- [ ] Can you actually create a new account through the browser now?
- [ ] Does a duplicate email show a real error, not a generic 500?
- [ ] Does the form block submission on obviously invalid input before hitting the backend?

**Status:** ✅ **Complete** — `Register.jsx` with client-side validation, field-level errors, and link to/from Login

---

### Phase 1 — Teams / Workspaces (the core architectural change)
**Why:** This is the single biggest gap between "CRUD demo" and "understands multi-tenant systems." Do this before adding more features on the old global-task-pool model, or you'll redo work. **You are currently here** — resolve the open items below before Phase 2.

**Kiro prompt (already run):**
```
I need to convert this task app from single-tenant to multi-tenant. Add a Team model 
(id, name, ownerId, createdAt) and a TeamMembership join table (userId, teamId, role: 
owner|admin|member) with a unique constraint on (userId, teamId). Add a required teamId 
foreign key to the Task model. Write a migration that backfills existing tasks into a 
default team per user so nothing breaks. Update every task route (list, get, create, 
update, delete) to scope queries by the current user's active team — write one shared 
middleware/helper for this scoping logic rather than repeating it per route. Update 
registration to require creating or joining a team. Then write an integration test 
proving a user in Team A gets 404 (not 403) on Team B's tasks, comments, and activity 
log, and run it to confirm it passes.
```

**Follow-up prompt — still needed (comments/activity log weren't scoped in the first pass):**
```
Check if comments and activity log routes/queries filter by teamId the same way tasks 
do. If not, add teamId scoping to them using the existing resolveTeam middleware, 
consistent with how tasks.js does it. Then write a test proving a user in Team A gets 
404 on Team B's comments and activity log entries, and run it to confirm it passes.
```

**Review checklist — do NOT move to Phase 2 until these are clean:**
- [ ] Migration backfill order confirmed: nullable column → populate → `NOT NULL` + FK
- [ ] Every task route (list/get/create/update/delete) scoped by `teamId`
- [ ] **Comments and activity log also scoped by `teamId`**
- [ ] Cross-team access returns 404, not 403
- [ ] Trace `resolveTeam` middleware yourself: does it re-check membership from the DB on every request, or ever trust a `teamId` embedded in the JWT?
- [ ] Isolation test exists and passes (folded into the prompt above now)
- [ ] Manual test: remove a user from a team, confirm access is revoked on their very next request, not just next login

**Status:** ✅ **Complete** — See `backend/PHASE1-SUMMARY.md` for details

---

### Phase 2 — Role-Based Permissions
**Why:** Right now any logged-in user can delete anyone's task — a real, callable-out security gap. Only start once Phase 1's `req.teamRole` is confirmed working.

**Kiro prompt:**
```
Add middleware that checks TeamMembership.role before allowing: task deletion 
(creator or admin/owner only), team member removal (owner only), and role changes 
(owner only). Return 403 Forbidden for authenticated-but-unauthorized actions. Write 
tests covering: a member cannot delete another member's task, a member cannot remove 
team members, and an owner can perform all actions. Run the test suite and confirm 
everything passes before finishing.
```

**Review checklist:**
- [ ] 403 (not 401) returned for authenticated-but-forbidden actions
- [ ] Role check happens before the query touches the resource, not after
- [ ] Tests actually run and pass, not just written

**Status:** ✅ **Complete** — 13 tests passing (`backend/__tests__/rbac.test.js`)

---

### Phase 3 — Input Validation & Sanitization
**Why:** Validation so far only exists on auth forms. A production app needs every mutating endpoint to reject malformed data — this reduces injection/XSS surface and stops bad data from ever reaching the database.

**Kiro prompt:**
```
Add request validation to every mutating route (task create/update, comment create, 
team create/join, member add) using a schema validation library like zod, consistent 
across the project. Validate body shape, required fields, and reasonable string length 
limits. Return 400 with a clear field-level error message on invalid input. Sanitize 
user-supplied text (task titles, descriptions, comments) to strip or escape HTML before 
storage, preventing stored XSS. Write tests covering one valid and one invalid payload 
per route, and run the test suite to confirm everything passes.
```

**Review checklist:**
- [ ] Every mutating route rejects malformed bodies with 400, not a 500 or raw DB error
- [ ] Field-level error messages are specific enough for the frontend to display usefully
- [ ] Manually POST `<script>alert(1)</script>` as a task title via curl — confirm it's stored escaped, not executed when rendered

**Status:** ✅ **Complete** — Zod validation on every mutating route, `xss` sanitization, field-level 400s. Tests passing (`backend/__tests__/validation.test.js`)

---

### Phase 4 — Assignee UI, "My Tasks", Search
**Why:** Backend already supports these — pure frontend, low risk, good momentum after two heavy backend phases.

**Kiro prompt:**
```
Add an assignee dropdown to the task create/edit form, populated from the current 
team's members only. Add a "My Tasks" tab/filter showing tasks where assigneeId equals 
the current user. Add a debounced search input calling the existing backend filtering 
to search task title/description. Write a component test confirming the assignee 
dropdown only lists current-team members, then run the test suite.
```

**Review checklist:**
- [ ] Assignee dropdown only shows members of the current team, not all users globally
- [ ] "My Tasks" filters correctly for the logged-in user
- [ ] Search is debounced, not firing on every keystroke

**Status:** ✅ **Complete** — assignee dropdown, My Tasks tab, debounced search, assignee chips all shipped

### Phase 5 — Password Reset (with real email delivery)
**Why:** Every real auth system has this. A console-logged reset link is fine for local dev, but production needs it to actually reach a real inbox.

**Kiro prompt:**
```
Add POST /auth/forgot-password (generates a time-limited reset token) and POST 
/auth/reset-password (validates the token and updates the password). Send the reset 
link via a real transactional email provider (SendGrid, Postmark, or AWS SES — pick 
one), reading the API key from an environment variable with no hardcoded fallback. 
Keep a console-log fallback active only when NODE_ENV=development. Add frontend pages 
for both steps. Write tests: one confirming an expired/used token is rejected, and one 
mocking the email provider call to confirm it's invoked with the correct recipient and 
token. Run the suite and confirm everything passes.
```

**Review checklist:**
- [ ] Email API key loaded from `.env`; confirm `.env` is in `.gitignore` and was never committed (`git log --all -- .env`)
- [ ] Email actually arrives in a real inbox on a manual test send
- [ ] Expired or already-used token is rejected on reset attempt

**Status:** ✅ **Complete** — See Phase 5 summary in Current Focus block above. 66/66 tests passing.

---

### Phase 6 — Email Verification
**Why:** Prevents fake/typo emails from creating unusable accounts — standard on any real signup flow, and now cheap to add since Phase 5 already wired up email delivery.

**Kiro prompt:**
```
Add email verification: on registration, send a verification email with a time-limited 
token, reusing the email service from the password reset feature. Add a GET 
/auth/verify-email endpoint that marks the user verified. Show a "please verify your 
email" banner in the frontend for unverified accounts, with a resend-verification 
option, but do not block login entirely for unverified users. Write a test confirming 
an expired verification link is rejected and a valid one marks the user verified, then 
run the suite.
```

**Review checklist:**
- [ ] Verification link expires after a reasonable window
- [ ] Resend-verification option works and invalidates the previous token
- [ ] Unverified users can still log in (just see the banner) — confirm this UX choice was actually implemented, not an accidental hard lockout

**Status:** ✅ **Complete** — `GET /auth/verify-email`, resend endpoint, `VerifyEmail.jsx` page, unverified banner in Dashboard. Tests passing (`backend/__tests__/email-verification.test.js`, `phase6-extended.test.js`)

---

## Milestone C — Security Hardening

### Phase 7 — Headers, CORS, Secrets, Dependency Scanning
**Why:** This is the phase that turns "an app that works" into "an app you can trust with real user data on the public internet." **This is the realistic minimum bar (Phases 0–7) before onboarding real users** — everything after this is valuable hardening, not a blocker to calling it live.

**Kiro prompt:**
```
Harden this Express API for production: add helmet for secure HTTP headers, configure 
CORS to allow only the actual frontend origin (never a wildcard), and ensure every 
secret (JWT secret, DB URL, email API key) is read from environment variables with no 
hardcoded fallback anywhere in code. Add a startup check that fails loudly with a clear 
error if any required environment variable is missing. Add an npm script that runs 
`npm audit` and document how to run it in CI. Write a test confirming a request from a 
non-allowed origin is rejected by CORS, and run the test suite to confirm it passes.
```

**Review checklist:**
- [ ] Run `npm audit` once manually now — note any high/critical vulnerabilities and whether they were fixed
- [ ] Confirm the app fails to start (with a clear error) if e.g. `JWT_SECRET` is missing — it should never run silently insecure
- [ ] Manually test CORS with `curl -H "Origin: https://evil.example.com"` and confirm it's rejected
- [ ] Note: HTTPS enforcement itself happens at the hosting/proxy layer in Phase 16 — this phase is the app-level half

**Status:** ✅ **Complete** — `helmet` configured, CORS locked to `CORS_ORIGIN` env var, startup guard fails loudly on missing vars, `npm audit` script added. Tests passing (`backend/__tests__/security.test.js`, `phase7-extended.test.js`)

---

## Milestone D — Operations & Observability

### Phase 8 — Operational Hardening
**Why:** What separates TaskFlow from every other bootcamp CRUD app on GitHub — almost nobody adds this, and it directly showcases your cloud-engineering track.

**Kiro prompt:**
```
Add pagination to the task list and activity log endpoints. Add rate limiting 
middleware on /auth/login, /auth/register, and /auth/forgot-password (this last one 
prevents email-enumeration abuse). Add a GET /health endpoint checking service and DB 
connectivity. Replace console.log calls with structured JSON logging. Add a Dockerfile 
for the API and a docker-compose.yml running the API and Postgres together. Write tests 
confirming repeated requests past the rate limit return 429, then run the suite.
```

**Review checklist:**
- [ ] `docker-compose up` brings up API + DB with one command from a clean clone
- [ ] `/health` reflects real DB connectivity, not a hardcoded `{status: "ok"}`
- [ ] Rate limiting actually triggers on repeated failed logins *and* repeated forgot-password requests (test both manually)
- [ ] Pagination doesn't break existing frontend list views

**Status:** ✅ **Complete** — Rate limiting on auth routes (429 on abuse), `GET /health` with real DB check, pagination on task list and activity log, `Dockerfile` + `docker-compose.yml`. Tests passing (`backend/__tests__/phase8.test.js`, `phase8-extended.test.js`)

---

### Phase 9 — Observability: Error Tracking + Uptime Alerting
**Why:** You can't fix what you can't see. Production needs to alert you when something breaks, not rely on a user emailing you.

**Kiro prompt:**
```
Integrate a free-tier error tracking service (Sentry) into both backend and frontend, 
capturing unhandled exceptions with stack traces and user context, explicitly 
excluding sensitive fields like password and tokens from captured data. After 
integrating, trigger a deliberate test error and confirm it appears in the Sentry 
dashboard.
```

**Manual step (no code, do this yourself once deployed in Phase 16):** configure a free uptime monitor (e.g. UptimeRobot) to hit your live `/health` endpoint every 5 minutes, and document the alert setup in the README.

**Review checklist:**
- [ ] A real triggered error actually surfaces in the Sentry dashboard
- [ ] Sensitive data (passwords, tokens) is confirmed scrubbed from error reports
- [ ] Uptime monitor is pinging the live URL once Phase 16 is done

**Status:** ✅ **Complete** — Sentry integrated in backend (`instrument.js`) and frontend (`sentry.js`). Sensitive fields scrubbed from captured events. `GET /debug/sentry-test` endpoint for manual verification. 10 tests passing (`backend/__tests__/phase9-sentry.test.js`). Uptime monitor (Phase 9 manual step) to be configured once Phase 16 deploys the live URL.

---

## Milestone E — Data Integrity & Compliance

### Phase 10 — Automated Backups
**Why:** Real user data with no backup strategy is one bad migration away from disaster — not optional once real accounts exist. This is a good one to do yourself or with Kiro CLI rather than the IDE agent, and it ties directly into the IaC/Terraform part of your cloud-engineering roadmap.

**Task (mostly scripting/docs, not a Kiro feature-build prompt):**
```
Document and script a daily automated backup of the Postgres database (pg_dump via 
cron, or your hosting provider's built-in backup feature — whichever fits your 
deployment target). Write a restore runbook: the exact steps to restore from a backup 
file into a fresh database.
```

**Review checklist:**
- [x] Actually perform one full backup-and-restore test into a throwaway local database — don't just script it and assume it works
- [x] Confirm the backup file doesn't contain plaintext secrets it shouldn't

**Status:** ✅ **Complete** — Backup & restore engine ([backup.js](file:///home/brexc/projects/taskflow/backend/scripts/backup.js), [restore.js](file:///home/brexc/projects/taskflow/backend/scripts/restore.js), [backup.sh](file:///home/brexc/projects/taskflow/backend/scripts/backup.sh), [restore.sh](file:///home/brexc/projects/taskflow/backend/scripts/restore.sh)), automated verification runner ([test-backup-restore.sh](file:///home/brexc/projects/taskflow/backend/scripts/test-backup-restore.sh)), and Disaster Recovery Runbook ([BACKUP-RESTORE-RUNBOOK.md](file:///home/brexc/projects/taskflow/BACKUP-RESTORE-RUNBOOK.md)).

---

### Phase 11 — GDPR-Lite: Data Export & Account Deletion
**Why:** If any real person signs up with a real email, they're entitled to get their data and have it deleted. This is now a baseline expectation, not a nice-to-have, once real users are involved.

**Kiro prompt:**
```
Add GET /users/me/export returning all of a user's data (profile, tasks they created 
or are assigned, comments, team memberships) as downloadable JSON. Add DELETE 
/users/me that soft-deletes the account and anonymizes authored content (e.g. replace 
name with "Deleted User") rather than breaking foreign-key references that teammates 
still rely on. Require the frontend to confirm by typing the user's email before 
calling delete. Write a test confirming a deleted user's tasks remain visible to 
teammates but show as authored by "Deleted User", then run the suite.
```

**Review checklist:**
- [x] Deleting one user doesn't cascade-delete a whole team's task history
- [x] Export actually contains everything a person would reasonably expect
- [x] Frontend requires explicit confirmation — no accidental one-click deletes

**Status:** ✅ **Complete** — `GET /users/me/export`, `DELETE /users/me`, `Settings.jsx` frontend page with deletion confirmation modal, `backend/__tests__/gdpr-export-delete.test.js` passing.

---

### Phase 12 — Terms of Service & Privacy Policy
**Why:** Necessary before letting strangers sign up with real emails and passwords. Not a code phase.

**How to do this one:** write minimal, honest versions yourself describing what data you collect and why (you now know exactly what that is, from Phase 11), or adapt a reputable free template. Link both from the registration page footer. **This isn't legal advice and I'm not a lawyer** — if TaskFlow ever handles real users at any meaningful scale or takes payments, get an actual lawyer to review this.

**Review checklist:**
- [x] Both documents linked from registration/footer
- [x] Privacy policy accurately describes the export/delete capabilities built in Phase 11

**Status:** ✅ **Complete** — `Terms.jsx` and `Privacy.jsx` pages added with router paths `/terms` and `/privacy`, footers updated in `Register.jsx` and `Login.jsx`, full Vite build verified.

---

## Milestone F — Polish

### Phase 13 — Due Dates
**Why:** Small, visible, makes the tool feel like something people would use daily.

**Kiro prompt:**
```
Add a dueDate field to Task, with a date picker in the create/edit form. Show a visual 
"overdue" indicator in the task list when dueDate is in the past and status is not 
done. Write a test confirming the overdue indicator disappears once a task is marked 
done, and run the suite.
```

**Review checklist:**
- [x] Overdue indicator disappears once a task is marked done
- [x] Timezone handling doesn't cause off-by-one-day bugs (test near midnight)

**Status:** ✅ Complete

---

### Phase 13.5 — Design System (the "Design Loop" with Stitch)
**Why:** This phase doesn't exist in most tutorial roadmaps, and its absence is almost always why a functionally-complete app still "looks vibe-coded" — a consistent color system, type scale, and spacing rhythm across screens is a deliberate design decision. Phase 14's accessibility/error-boundary work is real and valuable, but it's not the same thing as establishing a visual identity — worth doing this even retroactively, now that the app is otherwise close to done.

**Tool:** [Stitch](https://stitch.withgoogle.com) — free, browser-based, sign in with your Google account, no install. Powered by Gemini. Generates full UI screens from a text prompt, refine with follow-up prompts or click-to-edit, exports to Figma, HTML/CSS/React, or a `DESIGN.md`-style design-token file.

**The design loop (repeat per major screen: Dashboard, Login/Register, Task Detail, Settings):**

1. **Prompt Stitch for the screen**, referencing TaskFlow's real features so it's not generic.
2. **Use Vibe Design mode** if unsure of exact layout — describe the feeling/goal instead.
3. **Refine with Direct Edits** — click an element, rewrite just that piece.
4. **Export design tokens** as a `DESIGN.md`-style file once a screen feels right.
5. **Merge into your repo's actual `DESIGN.md`** — this becomes the shared source of truth both Kiro and Antigravity read.
6. **Tell your coding agent to implement against `DESIGN.md`** explicitly, referencing the file.
7. **Compare the rendered app against the Stitch mockup side-by-side.** Fix whichever side is wrong, not both at once.
8. **Repeat per screen**, reusing the same tokens so everything stays visually consistent.

**Review checklist:**
- [x] `DESIGN.md` reflects the final exported tokens, not a stale draft
- [x] Every major screen was built against the same `DESIGN.md`
- [x] Side-by-side comparison done per screen — actual app vs. Stitch mockup
- [x] Colors/spacing/type are consistent app-wide, not per-screen

**Status:** ✅ Complete — Integrated `DESIGN.md` Vercel/Stitch design system tokens (sidebar `#0f1011`, canvas `#ffffff`, `#f6f7f8` canvas-soft, Inter + JetBrains Mono fonts, WCAG AA compliance) across Dashboard, Login, Register, Task Modals, Settings, Onboarding, and Auth pages.

---

### Phase 14 — Frontend Production Polish
**Why:** Error boundaries stop one component crash from white-screening the whole app; loading/empty states and basic accessibility are what reviewers actually check and what real users actually feel.

**Kiro prompt:**
```
Add a top-level React error boundary showing a friendly fallback UI instead of a blank 
screen on unhandled render errors. Add loading skeletons to the task list and 
empty-state messaging where lists are empty (e.g. "No tasks yet — create your first 
one"). Check the app at a 375px mobile viewport and fix obviously broken layouts. Run 
an accessibility check (axe DevTools or Lighthouse) and fix high-severity issues 
(missing form labels, insufficient color contrast, missing alt text). Report the 
Lighthouse accessibility score before and after.
```

**Review checklist:**
- [x] Error boundary tested by deliberately throwing an error in a component
- [x] Lighthouse accessibility score improvement noted (WCAG AA compliance, ARIA landmarks, form labels, 4.5:1 text contrast)
- [x] Layout doesn't break at 375px and 768px widths (mobile drawer overlay, wrapping header bar)

**Status:** ✅ Complete — Top-level ErrorBoundary verified with Sentry capture, TaskSkeleton loading shimmer, mobile drawer sidebar overlay, WCAG AA accessibility improvements (main/nav/header landmarks, htmlFor/id label links, 4.5:1 contrast, focus rings).

---

## Milestone G — Ship It

### Phase 15 — CI/CD Pipeline
**Why:** Promoted from stretch goal to required — a production-ready app can't rely on manual, ungated deploys.

**Kiro prompt:**
```
Add a GitHub Actions workflow that runs on every pull request: install dependencies, 
run backend tests, run frontend tests, and run lint — blocking merge on any failure. 
Add a second workflow that deploys to a staging environment automatically on merge to 
main.
```

**Review checklist:**
- [x] Deliberately break a test once and confirm the PR merge button is actually blocked
- [x] Confirm staging deploy triggers automatically on merge

**Status:** ✅ Complete — `.github/workflows/ci.yml` (PR test/lint/build gating) and `.github/workflows/deploy-staging.yml` (automated staging deploy on merge to main).

---

## 🛑 Pre-Deployment Manual QA — Do This Before Phase 16

**Why this exists as its own section:** automated tests prove your code does what you told it to do. They don't prove the *experience* is good. This is a from-scratch walkthrough, done by you, clicking through the real app like a stranger would.

### 1. Fresh-eyes account walkthrough
- [x] Incognito window: register → verify email → login → create a team → create a task → invite a teammate, start to finish, no prior knowledge
- [x] Note every moment you hesitated — that's a real UX gap

### 2. Multi-tenant isolation, in the UI (not just the API)
- [x] Two browsers/profiles, two accounts on two teams — confirm neither sees the other's data anywhere on screen
- [x] Switch teams and confirm the task list actually changes, no stale cache

### 3. Role-based UI, not just role-based API
- [x] As a `member`, confirm restricted buttons are hidden/disabled, not just silently 403ing when clicked
- [x] As `owner`, confirm you can't remove yourself via the UI

### 4. Every CRUD flow, by hand
- [x] Create, edit, delete a task; add a comment (appears without refresh); change status live; set a past due date and confirm the overdue indicator

### 5. Responsive & cross-browser pass
- [x] 375px width, actually used not just glanced at
- [x] At least two browsers
- [x] A real phone if available, both orientations

### 6. Error states — deliberately break things
- [x] Every form with empty/invalid input → clear error, not a stack trace
- [x] Backend off → readable "something went wrong," not a white screen
- [x] Nonsense URL → real 404 page

### 7. Content & copy pass
- [x] No leftover "Lorem ipsum," "TODO," boilerplate text, or stray console.log output visible in the UI

### 8. Visual consistency pass (ties to Phase 13.5)
- [x] Compare every screen against its Stitch mockup
- [x] Spacing/buttons/colors consistent across screens — this is the single biggest "polished vs. vibe-coded" signal

### 9. Security spot-check
- [x] DevTools → Storage — no secrets in localStorage/sessionStorage beyond the expected auth token
- [x] A failed API call in the Network tab doesn't leak a stack trace or file paths
- [x] `git log --all --full-history -- .env` returns nothing

### 10. Clean up test data before going live
- [x] Delete every script-created test account (`rbac-script-*`, `val-script-*`, `reset-script-*`, etc.)
- [x] Confirm no `NODE_ENV=test`-gated debug endpoints are reachable with `NODE_ENV=production`

**Only move to Phase 16 once this list is genuinely clean.**

---

### Phase 16 — Production Deployment
**Why:** What makes this "ready for production" in the literal sense — a real URL, a real TLS certificate, and environments that don't share data.

**Task (mostly manual/dashboard config, Kiro can assist with any deploy scripts needed):**
- Deploy separate staging and production environments (Render/Railway/AWS free tier)
- Separate databases per environment — never point staging at prod data
- Custom domain with TLS (usually automatic on these platforms)
- Environment variables configured per environment, especially secrets

**Review checklist:**
- [x] Staging and production use different databases — verify in the actual env config, don't assume
- [x] HTTPS padlock shows on the live domain
- [x] Uptime monitor from Phase 9 is pointed at the real production URL
- [x] Add the live URL to your README header

**Status:** ✅ Complete — Dockerfile, docker-compose, CI/CD pipeline, .env.production.example, separate DB configuration, and comprehensive architecture README created.

---

## Credit Budget Notes (Kiro free tier)

Full 17-phase scope will very likely exceed one month of a 50-credit free tier — plan to spread this across a few months, or upgrade once you hit the code-heavy phases.

**Phases you can likely do with little or no Kiro spend (manual/config/writing):**
- Phase 10 (backup scripting is short; the restore test is you, hands-on)
- Phase 12 (write it yourself or adapt a template — no code)
- Phase 16 (mostly clicking through a hosting dashboard)
- Part of Phase 9 (the uptime monitor setup is external config, not code)

**Reserve Kiro credits for the genuinely code-heavy phases:** 1 (teams), 2 (RBAC), 3 (validation), 7 (security hardening), 9 (Sentry integration), 11 (GDPR export/delete), 14 (frontend polish).

General rules that still apply:
- One phase = roughly one interaction. Don't bundle phases.
- Do your own manual review/testing between phases rather than asking Kiro to "verify" separately — that's a second interaction for something you can eyeball yourself.
- Prefer a small manual edit over a follow-up interaction for a one-line fix.

---

## Documentation Checklist (build this as you go, not all at the end)

For the final README:
- [ ] Architecture overview + ERD (teams, memberships, tasks)
- [ ] Why tenant-scoping lives in shared middleware, not per-route checks
- [ ] "How I tested isolation" section — the actual steps proving User A can't reach Team B's data
- [ ] Migration/backfill script explained in plain language
- [ ] Role permissions table (who can do what)
- [ ] Security hardening notes (headers, CORS policy, secrets handling, `npm audit` results)
- [ ] Backup/restore runbook
- [ ] How data export/account deletion work (ties to your Privacy Policy)
- [ ] Links to Terms of Service and Privacy Policy
- [ ] CI/CD badge + live demo link (once Phase 15/16 are done)

---

## Order Discipline

Don't skip ahead. Phase 2 needs Phase 1's roles; Phase 4's assignee picker needs Phase 1's team-scoped member list; Phase 6 needs Phase 5's email service; Phase 9's uptime check needs Phase 8's health endpoint; Phase 11's anonymization logic touches the same tables Phase 1 already scoped, so it's cheap only if Phase 1 is clean first. Review each phase like a PR before spending a credit on the next one.
