# TaskFlow — Multi-Tenant Task Management Platform

[![CI Pipeline](https://github.com/brixcel/taskflow/actions/workflows/ci.yml/badge.svg)](https://github.com/brixcel/taskflow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.x-blue.svg)](https://www.postgresql.org)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748.svg)](https://www.prisma.io)
[![React](https://img.shields.io/badge/React-18.x-61DAFB.svg)](https://react.dev)

TaskFlow is a production-hardened, multi-tenant task and project management platform built with Node.js/Express, Prisma ORM, PostgreSQL, and React. Architected with strict tenant isolation, role-based access controls (RBAC), end-to-end input validation, automated disaster recovery, and compliance features (GDPR-lite export & account soft-deletion).

---

## 🏛 Architecture Overview

TaskFlow isolates customer data at the database level using a shared-database, shared-schema multi-tenant design with strict tenant partitioning. Every tenant operates as an independent **Team**, and all resources (Tasks, Comments, Activities, Memberships) are explicitly scoped by `teamId`.

### Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    User ||--o{ TeamMembership : "belongs to"
    User ||--o{ Team : "owns"
    User ||--o{ Task : "creates"
    User ||--o{ Task : "assigned to"
    User ||--o{ Comment : "authors"
    User ||--o{ Activity : "triggers"
    User ||--o{ PasswordResetToken : "has"
    User ||--o{ EmailVerificationToken : "has"

    Team ||--o{ TeamMembership : "has"
    Team ||--o{ Task : "contains"

    Task ||--o{ Comment : "contains"
    Task ||--o{ Activity : "logs"

    User {
        string id PK
        string email UK
        string passwordHash
        string name
        boolean emailVerified
        boolean isDeleted
        datetime deletedAt
        datetime createdAt
    }

    Team {
        string id PK
        string name
        string ownerId FK
        datetime createdAt
    }

    TeamMembership {
        string userId PK,FK
        string teamId PK,FK
        string role "owner | admin | member"
        datetime joinedAt
    }

    Task {
        string id PK
        string title
        string description
        string status "todo | in_progress | done"
        datetime dueDate
        string assigneeId FK
        string createdById FK
        string teamId FK
        datetime createdAt
        datetime updatedAt
    }

    Comment {
        string id PK
        string content
        string taskId FK
        string authorId FK
        datetime createdAt
    }

    Activity {
        string id PK
        string taskId FK
        string userId FK
        string action
        string details
        datetime createdAt
    }

    PasswordResetToken {
        string id PK
        string tokenHash UK
        string userId FK
        datetime expiresAt
        datetime usedAt
    }

    EmailVerificationToken {
        string id PK
        string tokenHash UK
        string userId FK
        datetime expiresAt
        datetime usedAt
    }
```

---

## 🔒 Tenant-Scoping Architecture

### Why Scoping Lives in Shared Middleware

In multi-tenant SaaS applications, placing tenant checks inside individual route handlers is error-prone — forgetting a single `where: { teamId }` filter results in critical cross-tenant data leaks. 

TaskFlow enforces multi-tenancy at the middleware layer using `resolveTeam` and `resolveTeamFromParam`:

```
Incoming Request
       │
       ▼
[ authenticateToken ] ──► Verifies JWT signature & attaches req.user
       │
       ▼
[ resolveTeam ]        ──► Re-checks membership against live DB on EVERY request
       │                   ├─ Validates X-Team-Id header OR selects user's active team
       │                   ├─ Attaches req.teamId and req.teamRole
       │                   └─ Returns 403 if user is not a member (or 404 if no teams)
       │
       ▼
[ Route Handler ]     ──► Uses scopedTaskQuery helper to guarantee where: { teamId }
```

### Key Security Invariants
1. **Never Trust Client-Sent `teamId` in Request Bodies**: The team ID is always derived server-side from `req.teamId` populated by `resolveTeam`.
2. **Cross-Tenant Requests Return 404 (Not 403)**: Accessing a resource belonging to another team returns `404 Not Found` rather than `403 Forbidden` to prevent resource enumeration attacks.
3. **Real-time DB Membership Verification**: Membership is checked against PostgreSQL on every single HTTP request rather than trusting stale JWT claims, ensuring instantaneous access revocation when a member is removed.

---

## 🛡️ Multi-Tenant Isolation Testing

Isolation is verified by an automated test suite (`__tests__/team-isolation.test.js` & `__tests__/security.test.js`) that runs against real PostgreSQL transactions:

```bash
cd backend
npm test __tests__/team-isolation.test.js
```

### Verified Isolation Vectors:
- **Task Isolation**: User B in Team B cannot `GET /tasks` belonging to Team A.
- **Cross-Team Mutation**: User B cannot `PATCH` or `DELETE` User A's task (returns `404`).
- **Comment Isolation**: User B cannot view or post comments on Team A's tasks (returns `404`).
- **Activity Log Isolation**: Audit entries for Team A's tasks are completely invisible to Team B (returns `404`).
- **Immediate Revocation**: Removing User B from a team in the database instantly blocks their next request with `403/404` without waiting for token expiration.

---

## 👥 Role-Based Access Control (RBAC)

TaskFlow implements three hierarchical team roles: `owner`, `admin`, and `member`.

| Capability | Owner | Admin | Member |
|---|:---:|:---:|:---:|
| **View Team Tasks, Comments & Activity** | ✅ | ✅ | ✅ |
| **Create & Update Assigned Tasks** | ✅ | ✅ | ✅ |
| **Delete Own Created Tasks** | ✅ | ✅ | ✅ |
| **Delete Any Member's Tasks** | ✅ | ✅ | ❌ |
| **Update Team Name / Settings** | ✅ | ✅ | ❌ |
| **Invite & Add Members** | ✅ | ✅ | ❌ |
| **Change Member Roles** | ✅ | ❌ | ❌ |
| **Remove Members** | ✅ | ❌ | ❌ |
| **Transfer Team Ownership / Delete Team** | ✅ | ❌ | ❌ |
| **Self-Removal from Team (Single Owner Guard)** | ❌ (Guarded) | ✅ | ✅ |

*Note: An owner cannot leave a team without transferring ownership or deleting the team, preventing orphaned teams.*

---

## 🔄 Zero-Downtime Migration & Backfill Strategy

When introducing multi-tenancy to pre-existing single-tenant databases, TaskFlow uses a safe 3-step zero-downtime migration strategy:

1. **Phase A (Schema Expansion)**: Add `teamId` as a nullable column (`teamId String?`).
2. **Phase B (Data Migration & Backfill)**: Run `scripts/backfill-teams.js` to create default personal teams for all existing users, establish `owner` memberships, and assign all existing tasks to the respective user's team.
3. **Phase C (Constraint Enforcement)**: Apply `NOT NULL` constraint and foreign key relation on `teamId` with `onDelete: Cascade`.

---

## 🔐 Security Hardening

- **Security Headers (`helmet`)**: Enforces Strict-Transport-Security, X-Content-Type-Options (`nosniff`), X-Frame-Options (`DENY`), and Content-Security-Policy.
- **Strict Origin CORS**: Whitelist-locked to `process.env.CORS_ORIGIN` (wildcards prohibited with credentials).
- **Brute-Force Rate Limiting**:
  - `/auth/login` & `/auth/register`: 20 requests per 15 minutes.
  - `/auth/forgot-password`: 5 requests per 15 minutes (with uniform responses to prevent account enumeration).
- **Cryptographic Security**:
  - Passwords hashed using `bcrypt` (salt rounds 10).
  - Password reset & email verification tokens generated via `crypto.randomBytes(32)` and stored as one-way `SHA-256` hashes in PostgreSQL.
- **Input Validation & Sanitization**:
  - Strict type checking and constraint validation via **Zod v4**.
  - HTML/script stripping on user-supplied strings via **xss**.
- **Observability & Error Scrubbing**:
  - Sentry error tracking patched with sensitive field scrubbing (`password`, `token`, `authorization` headers).
  - Production error handler returns clean generic 500s without stack traces or path leaks.

---

## 💾 Automated Backups & Disaster Recovery

TaskFlow includes an automated backup engine (`scripts/backup.js`) and restoration utility (`scripts/restore.js`) with Point-In-Time validation.

```bash
# Generate compressed snapshot with SHA-256 checksum
node scripts/backup.js

# Restore database from backup snapshot
node scripts/restore.js backups/taskflow_backup_YYYYMMDD_HHMMSS.json.gz

# Run full backup & restore verification suite
bash scripts/test-backup-restore.sh
```

See [BACKUP-RESTORE-RUNBOOK.md](file:///home/brexc/projects/taskflow/BACKUP-RESTORE-RUNBOOK.md) for full disaster recovery procedures, backup rotation policies, and offsite replication guides.

---

## 📜 Compliance & Privacy (GDPR-Lite)

- **Data Portability (`GET /users/me/export`)**: Exports a full JSON archive of the user's profile, owned teams, created tasks, assigned tasks, comments, and activity audit logs.
- **Right to Erasure (`DELETE /users/me`)**:
  - Soft-deletes user account (`isDeleted: true`, `deletedAt: now()`).
  - Anonymizes personal identifiable information (`name -> "Deleted User"`, `email -> "deleted_<uuid>@deleted.taskflow"`).
  - Invalidates all active JWT tokens and sessions.
- **Legal Agreements**:
  - [Terms of Service](file:///home/brexc/projects/taskflow/frontend/src/pages/Terms.jsx) (`/terms`)
  - [Privacy Policy](file:///home/brexc/projects/taskflow/frontend/src/pages/Privacy.jsx) (`/privacy`)

---

## 🚀 Quickstart & Development Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 15+ (or Docker)

### 1. Backend Setup
```bash
cd backend
npm install
cp .env.example .env

# Run Prisma migrations & client generation
npx prisma migrate dev
npx prisma generate

# Start development server
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env

# Start Vite dev server
npm run dev
```

### 3. Run Automated Test Suite
```bash
cd backend
npm test
```

---

## 🚢 Production Deployment

### Production Environment Variables (`backend/.env`)
```ini
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://user:pass@db-host.internal:5432/taskflow_prod?sslmode=require"
JWT_SECRET="<64-char-random-hex-key>"
CORS_ORIGIN="https://app.taskflow.com"
APP_URL="https://app.taskflow.com"
RESEND_API_KEY="re_..."
EMAIL_FROM="TaskFlow <noreply@taskflow.com>"
SENTRY_DSN="https://...@o0.ingest.sentry.io/..."
```

### Docker Deployment
```bash
# Build and launch isolated production containers
docker-compose up -d --build
```