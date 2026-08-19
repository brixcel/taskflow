# SyncTask

A real-time, multi-tenant project and task management platform built for modern engineering and product teams.

[![CI](https://github.com/brixcel/synctask/actions/workflows/ci.yml/badge.svg)](https://github.com/brixcel/synctask/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/postgresql-15%2B-blue.svg)](https://www.postgresql.org)
[![React](https://img.shields.io/badge/react-19-61dafb.svg)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

SyncTask provides collaborative project tracking with multi-tenant workspace isolation, flexible board and list views, real-time updates via WebSockets, time tracking, developer webhooks, and AI-assisted task workflows.

---

## Key Features

- **Multi-Tenant Workspaces & RBAC**: Shared-database architecture with strict tenant scoping. Role-based access control (`owner`, `admin`, `member`) ensures secure data boundaries across teams.
- **Task & Project Management**: Manage tasks across Kanban boards, list views, and calendar views. Supports subtasks, watchers, task templates, custom saved views, file attachments, and activity history.
- **Real-Time Collaboration**: Instant status synchronization, comment streams, and live user notifications powered by Socket.IO.
- **Time Tracking & Metrics**: Built-in time tracking per task, workload analytics, and Prometheus metrics for operational observability.
- **Developer API & Integrations**: RESTful API with API key authentication, HMAC-signed outbound webhooks, GitHub PR/commit linking, and Discord/Slack integrations.
- **AI-Assisted Workflows**: Task summarization, subtask generation, and priority suggestions with controlled token budgeting.
- **Security & Privacy**: Zod schema validation, input sanitization, rate-limited auth endpoints, and user data export/erasure endpoints.

---

## Architecture & Data Model

SyncTask implements a multi-tenant hierarchy where all operational resources are scoped to a **Team**.

```mermaid
graph TD
    Client[React + Vite Frontend] <-->|REST API / WebSockets| Server[Node.js / Express API]
    Server <--> DB[(PostgreSQL + Prisma ORM)]
    Server <--> Cache[(Redis Cache & Sessions)]
    Server --> Integrations[GitHub / Slack / Webhooks]
```

### Core Entity Relationships

- **User**: Authentication, profile settings, API keys, notifications, and personal preferences.
- **Team & TeamMembership**: Top-level tenant boundary. Memberships govern user roles (`owner`, `admin`, `member`).
- **Project**: Team-scoped container for grouping related tasks and milestones.
- **Task**: Core unit of work, containing status, assignees, subtasks, attachments, comments, time entries, and audit logs.
- **Integrations & Webhooks**: Scoped to teams/projects with secret-based signature verification.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS, Radix UI Primitives, Lucide Icons, Axios |
| **Backend** | Node.js, Express 5, Prisma ORM 7, Socket.IO, Zod |
| **Database & Cache** | PostgreSQL 15+, Redis (ioredis) |
| **Observability** | Prometheus (`prom-client`), Sentry error tracking, structured logging |
| **Testing** | Jest, Supertest |

---

## Getting Started

### Prerequisites

- **Node.js**: `20.x` or higher
- **PostgreSQL**: `15.x` or higher
- **Redis**: `7.x` or higher (optional for local dev, recommended for caching/sessions)

### 1. Clone & Install

```bash
git clone https://github.com/brixcel/synctask.git
cd synctask

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 2. Environment Configuration

Copy the sample environment files and configure your local credentials:

```bash
# Backend configuration
cp .env.example .env

# Frontend configuration
cp frontend/.env.example frontend/.env
```

Key environment variables in `.env`:

```ini
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/synctask?schema=public"
JWT_SECRET="your-development-jwt-secret-min-32-chars"
CORS_ORIGIN="http://localhost:5173"
REDIS_URL="redis://localhost:6379"
```

### 3. Database Migration & Setup

Generate the Prisma client and apply database migrations:

```bash
npx prisma migrate dev
npx prisma generate
```

*(Optional)* If migrating legacy single-tenant data:
```bash
node scripts/backfill-teams.js
```

### 4. Running Locally

Start the backend API server:
```bash
npm run dev
# API running on http://localhost:3000
```

In a separate terminal, start the frontend development server:
```bash
cd frontend
npm run dev
# Frontend running on http://localhost:5173
```

---

## Testing

SyncTask includes comprehensive automated unit, integration, and security test suites.

```bash
# Run all backend tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tenant isolation & security test suites
npm test -- __tests__/team-isolation.test.js
npm test -- __tests__/security.test.js
```

---

## Project Structure

```text
synctask/
├── backend/                  # (or root) Express API server & routes
│   ├── routes/               # Modular REST route handlers
│   ├── middleware/           # Auth, tenant resolver, rate limiting, sanitization
│   ├── services/             # Realtime (Socket.IO), email, AI, webhook delivery
│   └── __tests__/            # Jest test suites (unit, integration, RBAC, isolation)
├── frontend/                 # React 19 + Vite client
│   ├── src/
│   │   ├── components/       # Reusable UI & Radix components
│   │   ├── pages/            # View pages (Board, List, Calendar, Settings)
│   │   ├── services/         # API client & socket listeners
│   │   └── state/            # Application state management
├── prisma/                   # Prisma schema, migrations, and seed scripts
├── scripts/                  # Maintenance, backup/restore, and backfill utilities
└── docs/                     # Architectural specs and runbooks
```

---

## Documentation

- [Architecture & System Design](file:///home/brexc/projects/taskflow/ARCHITECTURE.md)
- [REST API Reference](file:///home/brexc/projects/taskflow/API.md)
- [Production Deployment Guide](file:///home/brexc/projects/taskflow/DEPLOYMENT.md)
- [Backup & Disaster Recovery Runbook](file:///home/brexc/projects/taskflow/BACKUP-RESTORE-RUNBOOK.md)
- [Engineering Charter](file:///home/brexc/projects/taskflow/SYNCTASK_2_0_ENGINEERING_CHARTER.md)

---

## Security & Responsible Disclosure

Security and tenant isolation are foundational design principles of SyncTask:
- **Tenant Scoping**: All resource queries are strictly bounded by verified team memberships resolved at the middleware layer.
- **Input Sanitization**: All user inputs are validated with strict schemas (`zod`) and sanitized against XSS attacks before storage.
- **Cryptographic Standards**: Secure password hashing with bcrypt, constant-time token comparison for reset/verification links, and HMAC-SHA256 signatures for outgoing webhooks.

To report security vulnerabilities, please contact the maintainers directly or open a private advisory on GitHub rather than filing a public issue.

---

## License

This project is licensed under the [MIT License](LICENSE).