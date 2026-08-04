#!/bin/bash
set -e
export PATH="/home/brexc/.nvm/versions/node/v24.18.1/bin:$PATH"
cd /home/brexc/projects/taskflow

echo "=== Removing root-level duplicates of backend files ==="

# These directories/files exist correctly under backend/ — the copies
# at the root crept in because the backend's own files were staged from
# the working tree before backend/.git was removed.
git rm -r --cached \
  helpers/ \
  middleware/ \
  prisma/ \
  routes/ \
  scripts/ \
  services/ \
  validation/ \
  __tests__/ \
  .agents/ \
  .claude/ \
  .windsurf/ \
  package.json \
  package-lock.json \
  server.js \
  prisma.js \
  prisma.config.ts \
  jest.setup.js \
  skills-lock.json \
  run-tests.sh \
  setup-tests.sh \
  install-test-deps.sh \
  install-nodemailer.sh \
  login_response.json \
  PHASE1-COMPLETION.md \
  PHASE1-SUMMARY.md \
  RUN-TESTS.md \
  TESTING-GUIDE.md \
  .gitignore.root-tmp \
  2>/dev/null || true

# Also remove the run-wsl.sh that's tracked (it's in .gitignore now but was
# committed before the ignore was active)
git rm --cached run-wsl.sh 2>/dev/null || true

git status --short | head -20
echo "---"
git commit -m "chore: remove root-level duplicates of backend files

Backend source files belong under backend/ only.
The initial commit accidentally included copies at the repo root
because they were staged from the working tree before the
backend/.git directory was removed.

Also removes: .gitignore.root-tmp, run-wsl.sh, install-*.sh,
login_response.json, and Prisma skills symlinks at root level."

echo ""
git log --oneline -3
echo ""
echo "=== Files now tracked at root level ==="
git ls-tree --name-only HEAD
