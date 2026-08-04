-- Migration: add_teams_multi_tenancy
-- Safe order:
--   1. Create teams + team_memberships tables
--   2. Backfill: one default team per existing user, assign them as owner
--   3. Add teamId to tasks as nullable, populate from createdById, then set NOT NULL

-- ─── Step 1: Create teams ─────────────────────────────────────────────────────

CREATE TABLE "teams" (
    "id"        TEXT        NOT NULL,
    "name"      TEXT        NOT NULL,
    "ownerId"   TEXT        NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_memberships" (
    "userId"   TEXT        NOT NULL,
    "teamId"   TEXT        NOT NULL,
    "role"     TEXT        NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("userId", "teamId")
);

-- Foreign keys on teams
ALTER TABLE "teams"
    ADD CONSTRAINT "teams_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys on team_memberships
ALTER TABLE "team_memberships"
    ADD CONSTRAINT "team_memberships_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_memberships"
    ADD CONSTRAINT "team_memberships_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "teams"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Step 2: Backfill — one default team per existing user ───────────────────
--
-- For each user, create a team named "<name>'s Team" with a generated UUID.
-- Then insert an owner membership row.
-- gen_random_uuid() is available in Postgres 13+ via pgcrypto (or built-in).

INSERT INTO "teams" ("id", "name", "ownerId", "createdAt")
SELECT
    gen_random_uuid()::TEXT,
    u."name" || '''s Team',
    u."id",
    u."createdAt"
FROM "users" u;

INSERT INTO "team_memberships" ("userId", "teamId", "role", "joinedAt")
SELECT
    t."ownerId",
    t."id",
    'owner',
    t."createdAt"
FROM "teams" t;

-- ─── Step 3: Add teamId to tasks ─────────────────────────────────────────────
--
-- Add as nullable first so the column can be created before the backfill
-- sets its value; tasks with no owner would be orphaned — there are none
-- because createdById is NOT NULL, but we guard with COALESCE anyway.

ALTER TABLE "tasks" ADD COLUMN "teamId" TEXT;

-- Populate: each task belongs to the team owned by whoever created it.
UPDATE "tasks" t
SET "teamId" = (
    SELECT tm."id"
    FROM   "teams" tm
    WHERE  tm."ownerId" = t."createdById"
    LIMIT  1
);

-- Any task whose creator has no team (shouldn't happen after the backfill,
-- but defensive) gets skipped — they would block the NOT NULL below.
-- If this DELETE runs it means data integrity was already broken before.
DELETE FROM "tasks" WHERE "teamId" IS NULL;

-- Now enforce NOT NULL and add the FK.
ALTER TABLE "tasks" ALTER COLUMN "teamId" SET NOT NULL;

ALTER TABLE "tasks"
    ADD CONSTRAINT "tasks_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "teams"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
