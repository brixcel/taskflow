-- 1. Enable and Force RLS on tasks
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_team_isolation_policy" ON "tasks";
CREATE POLICY "tasks_team_isolation_policy" ON "tasks"
FOR ALL
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "teamId" = NULLIF(current_setting('app.current_team_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "teamId" = NULLIF(current_setting('app.current_team_id', true), '')
);

-- 2. Enable and Force RLS on projects
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "projects_team_isolation_policy" ON "projects";
CREATE POLICY "projects_team_isolation_policy" ON "projects"
FOR ALL
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "teamId" = NULLIF(current_setting('app.current_team_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "teamId" = NULLIF(current_setting('app.current_team_id', true), '')
);

-- 3. Enable and Force RLS on task_attachments
ALTER TABLE "task_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_attachments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attachments_team_isolation_policy" ON "task_attachments";
CREATE POLICY "attachments_team_isolation_policy" ON "task_attachments"
FOR ALL
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR "teamId" = NULLIF(current_setting('app.current_team_id', true), '')
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR "teamId" = NULLIF(current_setting('app.current_team_id', true), '')
);

-- 4. Enable and Force RLS on subtasks
ALTER TABLE "subtasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subtasks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subtasks_team_isolation_policy" ON "subtasks";
CREATE POLICY "subtasks_team_isolation_policy" ON "subtasks"
FOR ALL
USING (
  current_setting('app.bypass_rls', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "tasks" t
    WHERE t."id" = "subtasks"."taskId"
    AND t."teamId" = NULLIF(current_setting('app.current_team_id', true), '')
  )
)
WITH CHECK (
  current_setting('app.bypass_rls', true) = 'on'
  OR EXISTS (
    SELECT 1 FROM "tasks" t
    WHERE t."id" = "subtasks"."taskId"
    AND t."teamId" = NULLIF(current_setting('app.current_team_id', true), '')
  )
);

-- Grant access on tables to authenticated role so RLS policies govern permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

