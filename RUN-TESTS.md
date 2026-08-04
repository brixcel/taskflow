# Quick Start — Running Phase 1 Tests

## Option 1: One Command (Recommended)

From Windows PowerShell in the project root:

```powershell
wsl bash -c "cd /home/brexc/projects/taskflow/backend && npm install --save-dev jest@^29.7.0 supertest@^7.0.0 @types/jest@^29.5.14 && npm test"
```

This will:
1. Install test dependencies
2. Run the test suite
3. Show you the results

## Option 2: Step by Step

### 1. Open WSL Terminal
```powershell
wsl
```

### 2. Navigate to Backend
```bash
cd /home/brexc/projects/taskflow/backend
```

### 3. Install Test Dependencies (first time only)
```bash
npm install --save-dev jest@^29.7.0 supertest@^7.0.0 @types/jest@^29.5.14
```

### 4. Run Tests
```bash
npm test
```

## Expected Output

```
 PASS  __tests__/team-isolation.test.js (7.2s)
  Task Isolation
    ✓ User B cannot GET Task A (returns 404) (45 ms)
    ✓ User B cannot PATCH Task A (returns 404) (18 ms)
    ✓ User B cannot DELETE Task A (returns 404) (16 ms)
    ✓ User A can access their own Task A (12 ms)
  Comment Isolation
    ✓ User B cannot GET comments on Task A (returns 404) (14 ms)
    ✓ User B cannot POST comment on Task A (returns 404) (15 ms)
    ✓ User A can access comments on their own Task A (13 ms)
  Activity Log Isolation
    ✓ User B cannot GET activity log for Task A (returns 404) (13 ms)
    ✓ User A can access activity log for their own Task A (12 ms)
  resolveTeam Middleware Verification
    ✓ Membership is re-checked from DB on every request (not stale JWT) (23 ms)
    ✓ Explicit team header is validated against DB membership (14 ms)

Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
Snapshots:   0 total
Time:        7.432 s
```

## If Tests Fail

### Database Connection Error
Make sure PostgreSQL is running and DATABASE_URL in `.env` is correct.

### Prisma Client Not Found
```bash
npx prisma generate
```

### Leftover Test Data
```bash
# This will reset your database (BE CAREFUL!)
npx prisma migrate reset --force
npm test
```

### Module Not Found
```bash
npm install
npx prisma generate
npm test
```

## What Happens During Tests?

The test suite:
1. Creates two test users (usera@test.com, userb@test.com)
2. Creates two teams (Team Alpha, Team Beta)
3. Adds each user to their respective team
4. Creates tasks in each team
5. Creates comments and activities in Team A
6. Verifies User B cannot access Team A's resources (gets 404)
7. Verifies User A can access their own resources normally
8. Tests middleware behavior
9. Cleans up all test data

**The tests do not affect your real data** — they use specific test email addresses and clean up after themselves.

## After Tests Pass

✅ **Phase 1 is complete!**

Next steps:
1. Review `backend/PHASE1-COMPLETION.md` for detailed documentation
2. Optionally try manual testing using `backend/TESTING-GUIDE.md`
3. Move on to Phase 2 (Role-Based Permissions) when ready

## Troubleshooting npm from Windows

If you get UNC path errors when running npm from Windows:

**Don't do this:**
```powershell
# ❌ This won't work
npm install --save-dev jest
cd backend
npm test
```

**Do this instead:**
```powershell
# ✅ Use WSL
wsl bash -c "cd /home/brexc/projects/taskflow/backend && npm test"
```

This is a Windows/WSL compatibility limitation, not a bug in the code.
