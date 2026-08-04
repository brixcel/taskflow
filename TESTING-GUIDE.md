# Testing Guide — Phase 1 Team Isolation

This guide explains how to verify Phase 1's multi-tenant isolation is working correctly.

## Automated Tests

### Setup (One-Time)

The test dependencies need to be installed from within WSL due to path compatibility issues:

```bash
# Open WSL terminal
wsl

# Navigate to backend directory
cd /home/brexc/projects/taskflow/backend

# Run setup script
bash setup-tests.sh
```

This installs:
- `jest` — Test framework
- `supertest` — HTTP testing library
- `@types/jest` — TypeScript definitions for IDE support

### Running Tests

```bash
# From within WSL, in the backend directory:
npm test

# Or for watch mode during development:
npm run test:watch
```

### What the Tests Verify

The test suite in `__tests__/team-isolation.test.js` creates:
- Two users (User A and User B)
- Two teams (Team Alpha and Team Beta)  
- Tasks, comments, and activity in each team
- Then verifies cross-team isolation

**Test Coverage:**
1. **Task Isolation** — User B cannot GET, PATCH, or DELETE User A's tasks
2. **Comment Isolation** — User B cannot view or create comments on User A's tasks
3. **Activity Isolation** — User B cannot view activity logs for User A's tasks
4. **Middleware Verification** — Team membership is checked from DB on every request
5. **Explicit Team Header** — `X-Team-Id` header is validated against actual membership

All cross-team access attempts return **404** (not 403), making resources invisible.

## Manual Testing (API Exploration)

If you prefer to manually test the isolation or want to explore the API:

### 1. Start the Server

```bash
# From backend directory in WSL:
npm run dev
```

Server starts on `http://localhost:3000`

### 2. Create Two Users

```bash
# User A
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "password123",
    "name": "Alice"
  }'

# User B
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "bob@example.com",
    "password": "password123",
    "name": "Bob"
  }'
```

Save the JWT tokens from the responses.

### 3. Login (if needed)

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@example.com",
    "password": "password123"
  }'
```

### 4. Create Tasks

Each user creates a task in their team:

```bash
# Alice creates a task (replace TOKEN_A with Alice's JWT)
curl -X POST http://localhost:3000/tasks \
  -H "Authorization: Bearer TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Alice task",
    "description": "This belongs to Alice team"
  }'

# Save the task ID from response
```

### 5. Test Isolation

Try to access Alice's task as Bob:

```bash
# Bob lists tasks (should NOT see Alice's task)
curl http://localhost:3000/tasks \
  -H "Authorization: Bearer TOKEN_B"

# Bob tries to get Alice's specific task by ID (should get 404)
curl http://localhost:3000/tasks/ALICE_TASK_ID \
  -H "Authorization: Bearer TOKEN_B"

# Bob tries to update Alice's task (should get 404)
curl -X PATCH http://localhost:3000/tasks/ALICE_TASK_ID \
  -H "Authorization: Bearer TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"title": "Hacked!"}'

# Bob tries to delete Alice's task (should get 404)
curl -X DELETE http://localhost:3000/tasks/ALICE_TASK_ID \
  -H "Authorization: Bearer TOKEN_B"
```

**Expected Results:** All of Bob's attempts return `404` with `{"error": "Task not found"}`.

### 6. Test Comment Isolation

```bash
# Bob tries to view comments on Alice's task (should get 404)
curl http://localhost:3000/tasks/ALICE_TASK_ID/comments \
  -H "Authorization: Bearer TOKEN_B"

# Bob tries to comment on Alice's task (should get 404)
curl -X POST http://localhost:3000/tasks/ALICE_TASK_ID/comments \
  -H "Authorization: Bearer TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{"content": "Trying to comment"}'
```

### 7. Test Activity Log Isolation

```bash
# Bob tries to view activity log for Alice's task (should get 404)
curl http://localhost:3000/tasks/ALICE_TASK_ID/activities \
  -H "Authorization: Bearer TOKEN_B"
```

### 8. Test Membership Revocation

This requires direct database access:

```bash
# Open Prisma Studio or psql
npx prisma studio

# Find Bob's team membership and delete it
# Then immediately try to access tasks as Bob (should get 404 about no team membership)
curl http://localhost:3000/tasks \
  -H "Authorization: Bearer TOKEN_B"
```

**Expected:** Bob gets `404` with `{"error": "You are not a member of any team..."}` on the very next request, proving the middleware checks the DB every time.

## Troubleshooting

### Tests Won't Run
- Ensure you're running from within WSL, not Windows PowerShell
- Check that PostgreSQL is running
- Verify `.env` file has correct `DATABASE_URL`
- Run `npx prisma generate` to regenerate Prisma client if needed

### Tests Fail on First Run
- The tests clean up after themselves but may fail if leftover data exists
- Run: `npx prisma migrate reset --force` to reset the database
- Then run tests again

### Module Not Found Errors
- Run `bash setup-tests.sh` again from within WSL
- Or manually: `npm install --save-dev jest supertest @types/jest`

## Test Output

Successful test run should show:

```
PASS  __tests__/team-isolation.test.js
  Task Isolation
    ✓ User B cannot GET Task A (returns 404)
    ✓ User B cannot PATCH Task A (returns 404)
    ✓ User B cannot DELETE Task A (returns 404)
    ✓ User A can access their own Task A
  Comment Isolation
    ✓ User B cannot GET comments on Task A (returns 404)
    ✓ User B cannot POST comment on Task A (returns 404)
    ✓ User A can access comments on their own Task A
  Activity Log Isolation
    ✓ User B cannot GET activity log for Task A (returns 404)
    ✓ User A can access activity log for their own Task A
  resolveTeam Middleware Verification
    ✓ Membership is re-checked from DB on every request
    ✓ Explicit team header is validated against DB membership

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
```

## Next Steps

Once all tests pass:
1. Update `PLAN.md` to mark Phase 1 as complete
2. Move on to Phase 2 (Role-Based Permissions)
3. Consider setting up a Git pre-commit hook to run tests automatically
