#!/bin/bash
set -e
export PATH="/home/brexc/.nvm/versions/node/v24.18.1/bin:$PATH"
cd /home/brexc/projects/taskflow

echo "=== Step 1: Clean up any partial root repo ==="
rm -rf .git

echo ""
echo "=== Step 2: Remove backend/.git (folding into root) ==="
rm -rf ./backend/.git

echo ""
echo "=== Step 3: Init root repo ==="
git init
git checkout -b main

echo ""
echo "=== Step 4: Stage everything (respects .gitignore) ==="
git add .
git status --short | head -60

echo ""
echo "=== Step 5: Initial commit ==="
git commit -m "feat: taskflow monorepo — phases 0-5 complete

Initial commit of the full project as a single root-level repository.

Completed phases:
  Phase 0  — Registration UI (Register.jsx, client-side validation)
  Phase 1  — Multi-tenant teams + membership + task/comment/activity scoping
  Phase 2  — Role-based permissions (RBAC), 403 enforcement
  Phase 3  — Input validation (Zod) + XSS sanitization (xss lib)
  Phase 4  — Assignee dropdown, My Tasks tab, debounced search
  Phase 5  — Password reset with nodemailer (SMTP prod / console-log dev)

Backend stack: Node.js, Express 5, Prisma 7, PostgreSQL (Supabase)
Frontend stack: React 18, Vite, Tailwind CSS
Test suite: Jest + Supertest — 66 tests passing

Key files:
  backend/routes/auth.js          — register, login, forgot/reset-password
  backend/routes/tasks.js         — CRUD scoped by teamId
  backend/prisma/schema.prisma    — User, Team, TeamMembership, Task, Comment,
                                    Activity, PasswordResetToken
  backend/services/email.js       — nodemailer wrapper
  backend/validation/schemas.js   — Zod schemas for all mutating routes
  backend/__tests__/              — rbac, team-isolation, validation, password-reset
  backend/scripts/                — test-rbac.sh, test-validation.sh,
                                    test-password-reset.sh
  frontend/src/pages/             — Login, Register, Onboarding, Dashboard,
                                    ForgotPassword, ResetPassword
  PLAN.md                         — 17-phase production roadmap"

echo ""
echo "=== Done ==="
git log --oneline -5
echo ""
git show --stat HEAD | tail -20
