/**
 * Comprehensive Production-Quality Seed & Test Data Generator for SyncTask
 *
 * Provisions realistic workspaces, roles, projects, tasks, subtasks,
 * comments, time entries, and chronological activity history.
 *
 * Usage:
 *   node scripts/seed-test-data.js
 */

const bcrypt = require('bcrypt');
const prisma = require('../prisma');

async function seedRealisticData() {
  console.log('\n🌱 Starting SyncTask production-grade database cleanup & seeding...\n');

  const passwordHash = await bcrypt.hash('Password123!', 10);
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  // ── 1. Clean Up Ephemeral / Orphaned Test Clutter Safely ──────────────────────
  console.log('🧹 Cleaning orphaned test fixtures and ephemeral demo containers...');

  // Identify and delete orphaned test users (never delete real accounts like brexcel14@gmail.com)
  const ephemeralUserPatterns = [
    { email: { startsWith: 'burst_test_' } },
    { email: { startsWith: 'permanent_' } },
    { email: { startsWith: 'session-lead-' } },
    { email: { startsWith: 'freelance-session-' } },
    { email: { startsWith: 'cache-worker-' } },
    { email: { startsWith: 'cache-lead-' } },
    { email: { startsWith: 'human-' } },
    { email: { startsWith: 'ai-user-' } },
    { email: { endsWith: '@demo.taskflow.local' } },
    { email: 'existing_user_demo_test@example.com' },
  ];

  for (const pattern of ephemeralUserPatterns) {
    const matchedUsers = await prisma.user.findMany({ where: pattern, select: { id: true } });
    if (matchedUsers.length > 0) {
      const userIds = matchedUsers.map(u => u.id);
      await prisma.activity.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.comment.deleteMany({ where: { authorId: { in: userIds } } });
      await prisma.timeEntry.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.subtask.deleteMany({ where: { task: { createdById: { in: userIds } } } });
      await prisma.task.deleteMany({ where: { createdById: { in: userIds } } });
      await prisma.projectMember.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.project.deleteMany({ where: { createdById: { in: userIds } } });
      await prisma.teamMembership.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.team.deleteMany({ where: { ownerId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }

  // Remove empty test teams
  await prisma.team.deleteMany({
    where: {
      name: { in: ['Human Team', 'AI Test Team', 'Temp Cache Team', 'Temp Freelance Team', 'Acme SaaS Launch (Demo)', 'Acme SaaS Launch'] },
      isDemo: false,
      memberships: { none: {} },
    },
  });

  console.log('  ✓ Ephemeral test clutter safely purged.');

  // ── 2. Create / Upsert Core Canonical Team Users ─────────────────────────────
  console.log('\n👤 Provisioning Core Engineering & Design Team...');

  const usersData = [
    {
      email: 'owner@synctask.local',
      name: 'Elena Rostova',
      roleTitle: 'Workspace Owner & Lead Architect',
    },
    {
      email: 'admin@synctask.local',
      name: 'Marcus Vance',
      roleTitle: 'VP of Engineering (Admin)',
    },
    {
      email: 'dev@synctask.local',
      name: 'Sarah Chen',
      roleTitle: 'Senior Full-Stack Engineer',
    },
    {
      email: 'designer@synctask.local',
      name: 'Liam Brooks',
      roleTitle: 'Lead Product Designer',
    },
    {
      email: 'qa@synctask.local',
      name: 'Amara Okafor',
      roleTitle: 'QA Automation & Security Engineer',
    },
  ];

  const users = {};
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        passwordHash,
        emailVerified: true,
      },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        emailVerified: true,
      },
    });
    users[u.email] = user;
    console.log(`  ✓ ${u.name.padEnd(16)} (${u.email}) — ${u.roleTitle}`);
  }

  // ── 3. Configure Workspaces / Teams ──────────────────────────────────────────
  let teamAcme = await prisma.team.findFirst({
    where: { name: 'Acme Cloud Technologies', ownerId: users['owner@synctask.local'].id },
  });

  if (!teamAcme) {
    teamAcme = await prisma.team.create({
      data: {
        name: 'Acme Cloud Technologies',
        ownerId: users['owner@synctask.local'].id,
      },
    });
  }

  let teamGrowth = await prisma.team.findFirst({
    where: { name: 'Growth & Operations', ownerId: users['owner@synctask.local'].id },
  });

  if (!teamGrowth) {
    teamGrowth = await prisma.team.create({
      data: {
        name: 'Growth & Operations',
        ownerId: users['owner@synctask.local'].id,
      },
    });
  }

  // Setup memberships for Acme Cloud Technologies
  const acmeMemberships = [
    { user: users['owner@synctask.local'], role: 'owner' },
    { user: users['admin@synctask.local'], role: 'admin' },
    { user: users['dev@synctask.local'], role: 'member' },
    { user: users['designer@synctask.local'], role: 'member' },
    { user: users['qa@synctask.local'], role: 'member' },
  ];

  for (const m of acmeMemberships) {
    await prisma.teamMembership.upsert({
      where: {
        userId_teamId: {
          userId: m.user.id,
          teamId: teamAcme.id,
        },
      },
      update: { role: m.role },
      create: {
        userId: m.user.id,
        teamId: teamAcme.id,
        role: m.role,
      },
    });
  }

  console.log(`\n🏢 Primary Team: ${teamAcme.name} (5 Members)`);

  // ── 4. Seed Realistic Projects ────────────────────────────────────────────────
  console.log('\n📁 Provisioning Projects & Workstreams...');

  const projectsData = [
    {
      name: 'Customer Portal & Auth Modernization',
      description: 'Upgrade OAuth 2.0 PKCE authentication, biometric session tokens, and security audits.',
      icon: '🔐',
      color: '#3b82f6',
      status: 'active',
      teamId: teamAcme.id,
      createdById: users['owner@synctask.local'].id,
    },
    {
      name: 'Mobile App Performance & Offline Sync',
      description: 'SQLite cache synchronization, WebSocket reconnection resilience, and push alerts.',
      icon: '📱',
      color: '#10b981',
      status: 'active',
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
    },
    {
      name: 'Design System & Component Library',
      description: 'WCAG 2.1 AA accessibility tokens, shadcn/ui components, and fluid micro-interactions.',
      icon: '🎨',
      color: '#f59e0b',
      status: 'active',
      teamId: teamAcme.id,
      createdById: users['designer@synctask.local'].id,
    },
  ];

  const projects = [];
  for (const p of projectsData) {
    let proj = await prisma.project.findFirst({
      where: { name: p.name, teamId: p.teamId },
    });
    if (!proj) {
      proj = await prisma.project.create({ data: p });
    } else {
      proj = await prisma.project.update({
        where: { id: proj.id },
        data: { description: p.description, icon: p.icon, color: p.color, status: p.status },
      });
    }
    projects.push(proj);
    console.log(`  ✓ Project: ${proj.icon} ${proj.name}`);
  }

  // ── 5. Clean & Seed Realistic Tasks ──────────────────────────────────────────
  console.log('\n📋 Seeding Realistic Multi-Sprint Tasks & Dependencies...');

  // Clean old tasks in these projects
  const projectIds = projects.map(p => p.id);
  const existingTasks = await prisma.task.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true },
  });
  const existingTaskIds = existingTasks.map(t => t.id);

  if (existingTaskIds.length > 0) {
    await prisma.activity.deleteMany({ where: { taskId: { in: existingTaskIds } } });
    await prisma.comment.deleteMany({ where: { taskId: { in: existingTaskIds } } });
    await prisma.timeEntry.deleteMany({ where: { taskId: { in: existingTaskIds } } });
    await prisma.subtask.deleteMany({ where: { taskId: { in: existingTaskIds } } });
    await prisma.task.deleteMany({ where: { id: { in: existingTaskIds } } });
  }

  // Realistic Tasks Definitions
  const taskDefinitions = [
    // ── Project 1: Customer Portal & Auth Modernization ──
    {
      title: 'Audit legacy session tokens and cookie security flags',
      description: 'Review cookie SameSite, Secure, and HttpOnly attributes across authentication endpoints to ensure zero session hijacking vectors.',
      status: 'done',
      priority: 'high',
      labels: ['security', 'auth', 'compliance'],
      projectId: projects[0].id,
      teamId: teamAcme.id,
      createdById: users['owner@synctask.local'].id,
      assigneeId: users['dev@synctask.local'].id,
      createdAt: new Date(now.getTime() - 24 * dayMs),
      updatedAt: new Date(now.getTime() - 18 * dayMs),
      dueDate: new Date(now.getTime() - 17 * dayMs),
      subtasks: [
        { title: 'Inspect SameSite & Secure cookie policies in staging', completed: true, order: 0 },
        { title: 'Verify token expiration handling in Redis store', completed: true, order: 1 },
      ],
      comments: [
        { authorId: users['admin@synctask.local'].id, content: 'Audit findings reviewed and verified against OWASP checklist.', createdAt: new Date(now.getTime() - 18 * dayMs) },
      ],
      timeMinutes: 180,
    },
    {
      title: 'Implement OAuth 2.0 PKCE flow for Google and GitHub',
      description: 'Replace legacy static callback secrets with cryptographically random code verifiers and SHA-256 challenges.',
      status: 'done',
      priority: 'urgent',
      labels: ['auth', 'backend', 'oauth'],
      projectId: projects[0].id,
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
      assigneeId: users['dev@synctask.local'].id,
      createdAt: new Date(now.getTime() - 16 * dayMs),
      updatedAt: new Date(now.getTime() - 10 * dayMs),
      dueDate: new Date(now.getTime() - 9 * dayMs),
      subtasks: [
        { title: 'Register client credentials in Google Cloud & GitHub developer portals', completed: true, order: 0 },
        { title: 'Implement code_verifier generation and SHA-256 challenge hashing', completed: true, order: 1 },
        { title: 'Add callback exchange handler with CSRF state verification', completed: true, order: 2 },
      ],
      comments: [
        { authorId: users['dev@synctask.local'].id, content: 'PKCE challenge exchange verified on both providers. PR merged.', createdAt: new Date(now.getTime() - 10 * dayMs) },
      ],
      timeMinutes: 240,
    },
    {
      title: 'Add biometric authentication support for mobile client',
      description: 'Wire FaceID and fingerprint biometric verification triggers into mobile auth session renewal.',
      status: 'in_progress',
      priority: 'high',
      labels: ['mobile', 'auth', 'security'],
      projectId: projects[0].id,
      teamId: teamAcme.id,
      createdById: users['owner@synctask.local'].id,
      assigneeId: users['dev@synctask.local'].id,
      createdAt: new Date(now.getTime() - 7 * dayMs),
      updatedAt: new Date(now.getTime() - 1 * dayMs),
      dueDate: new Date(now.getTime() + 3 * dayMs),
      subtasks: [
        { title: 'Integrate native biometric authentication bridge', completed: true, order: 0 },
        { title: 'Add fallback PIN entry dialog when biometric fails', completed: false, order: 1 },
      ],
      comments: [
        { authorId: users['designer@synctask.local'].id, content: 'Attached biometric unlock modal motion spec.', createdAt: new Date(now.getTime() - 2 * dayMs) },
      ],
      timeMinutes: 120,
    },
    {
      title: 'Implement sliding window rate limiting on password reset',
      description: 'Protect password reset endpoints from brute force attempts using Redis sliding window log with IP & email buckets.',
      status: 'in_progress',
      priority: 'urgent',
      labels: ['backend', 'redis', 'rate-limit'],
      projectId: projects[0].id,
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
      assigneeId: users['admin@synctask.local'].id,
      createdAt: new Date(now.getTime() - 5 * dayMs),
      updatedAt: new Date(now.getTime() - 1 * dayMs),
      dueDate: new Date(now.getTime() + 4 * dayMs),
      subtasks: [
        { title: 'Write Redis Lua script for atomic sliding window evaluation', completed: true, order: 0 },
        { title: 'Add integration tests for concurrent burst traffic', completed: false, order: 1 },
      ],
      comments: [],
      timeMinutes: 90,
    },
    {
      title: 'Conduct penetration testing on auth callback endpoints',
      description: 'Run automated and manual security scans targeting replay attacks, parameter tampering, and redirect hijacking.',
      status: 'review',
      priority: 'high',
      labels: ['security', 'qa', 'audit'],
      projectId: projects[0].id,
      teamId: teamAcme.id,
      createdById: users['owner@synctask.local'].id,
      assigneeId: users['qa@synctask.local'].id,
      createdAt: new Date(now.getTime() - 4 * dayMs),
      updatedAt: new Date(now.getTime() - 1 * dayMs),
      dueDate: new Date(now.getTime() + 1 * dayMs),
      subtasks: [
        { title: 'Test replay attacks with expired state parameters', completed: true, order: 0 },
        { title: 'Validate redirect URI strict whitelisting', completed: true, order: 1 },
      ],
      comments: [
        { authorId: users['qa@synctask.local'].id, content: 'Found 1 edge case on open redirect header; validation patch prepared.', createdAt: new Date(now.getTime() - 1 * dayMs) },
      ],
      timeMinutes: 150,
    },
    {
      title: 'Configure Turnstile CAPTCHA on user registration',
      description: 'Add invisible Cloudflare Turnstile token validation to prevent automated spam bot registrations.',
      status: 'todo',
      priority: 'medium',
      labels: ['security', 'auth', 'spam-prevention'],
      projectId: projects[0].id,
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
      assigneeId: null,
      createdAt: new Date(now.getTime() - 2 * dayMs),
      updatedAt: new Date(now.getTime() - 2 * dayMs),
      dueDate: new Date(now.getTime() + 7 * dayMs),
      subtasks: [
        { title: 'Obtain Turnstile sitekey and secret credentials', completed: false, order: 0 },
        { title: 'Wire verification widget into registration form', completed: false, order: 1 },
      ],
      comments: [],
      timeMinutes: 0,
    },

    // ── Project 2: Mobile App Performance & Offline Sync ──
    {
      title: 'Benchmark SQLite schema migrations on iOS and Android',
      description: 'Evaluate SQLite migration execution times and memory consumption with large local offline datasets.',
      status: 'done',
      priority: 'medium',
      labels: ['mobile', 'sqlite', 'performance'],
      projectId: projects[1].id,
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
      assigneeId: users['dev@synctask.local'].id,
      createdAt: new Date(now.getTime() - 20 * dayMs),
      updatedAt: new Date(now.getTime() - 14 * dayMs),
      dueDate: new Date(now.getTime() - 13 * dayMs),
      subtasks: [
        { title: 'Run cold-start read latency benchmark on device testbed', completed: true, order: 0 },
        { title: 'Measure memory footprint during 10,000 task bulk sync', completed: true, order: 1 },
      ],
      comments: [
        { authorId: users['dev@synctask.local'].id, content: 'Bulk query latency reduced from 340ms to 42ms with indexed queries.', createdAt: new Date(now.getTime() - 14 * dayMs) },
      ],
      timeMinutes: 150,
    },
    {
      title: 'Implement optimistic UI updates for task mutations',
      description: 'Apply local UI state immediately upon user action, queuing backend sync in background with automatic retry.',
      status: 'in_progress',
      priority: 'high',
      labels: ['mobile', 'ux', 'offline-sync'],
      projectId: projects[1].id,
      teamId: teamAcme.id,
      createdById: users['owner@synctask.local'].id,
      assigneeId: users['dev@synctask.local'].id,
      createdAt: new Date(now.getTime() - 8 * dayMs),
      updatedAt: new Date(now.getTime() - 1 * dayMs),
      dueDate: new Date(now.getTime() + 2 * dayMs),
      subtasks: [
        { title: 'Store rollback snapshot before dispatching mutation', completed: true, order: 0 },
        { title: 'Implement background sync retry queue with exponential backoff', completed: false, order: 1 },
      ],
      comments: [],
      timeMinutes: 180,
    },
    {
      title: 'Resolve memory leak during continuous WebSocket reconnects',
      description: 'Ensure Socket.IO listeners and heartbeat timers are properly destroyed when the mobile client switches network interfaces.',
      status: 'review',
      priority: 'urgent',
      labels: ['mobile', 'websocket', 'performance'],
      projectId: projects[1].id,
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
      assigneeId: users['admin@synctask.local'].id,
      createdAt: new Date(now.getTime() - 6 * dayMs),
      updatedAt: new Date(now.getTime() - 1 * dayMs),
      dueDate: new Date(now.getTime() + 1 * dayMs),
      subtasks: [
        { title: 'Clean up dangling Socket.IO listener references on unmount', completed: true, order: 0 },
        { title: 'Verify memory profile after 100 simulated network reconnections', completed: true, order: 1 },
      ],
      comments: [
        { authorId: users['admin@synctask.local'].id, content: 'Heap snapshot confirms flat memory line after 100 reconnections.', createdAt: new Date(now.getTime() - 1 * dayMs) },
      ],
      timeMinutes: 120,
    },
    {
      title: 'Verify push notification delivery across APNs sandbox',
      description: 'Test Apple Push Notification service token registration, background wakeups, and badge increment accuracy.',
      status: 'done',
      priority: 'high',
      labels: ['mobile', 'notifications', 'qa'],
      projectId: projects[1].id,
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
      assigneeId: users['qa@synctask.local'].id,
      createdAt: new Date(now.getTime() - 12 * dayMs),
      updatedAt: new Date(now.getTime() - 5 * dayMs),
      dueDate: new Date(now.getTime() - 4 * dayMs),
      subtasks: [
        { title: 'Send push payload tests with custom badge numbers', completed: true, order: 0 },
        { title: 'Validate silent push background wakeups on iOS testbed', completed: true, order: 1 },
      ],
      comments: [
        { authorId: users['qa@synctask.local'].id, content: 'All APNs notification triggers verified on iOS 17 & 18.', createdAt: new Date(now.getTime() - 5 * dayMs) },
      ],
      timeMinutes: 100,
    },
    {
      title: 'Design network reconnection status banner component',
      description: 'Create non-intrusive offline/reconnecting indicator with retry button for mobile and web viewports.',
      status: 'todo',
      priority: 'low',
      labels: ['mobile', 'design', 'ui'],
      projectId: projects[1].id,
      teamId: teamAcme.id,
      createdById: users['designer@synctask.local'].id,
      assigneeId: users['designer@synctask.local'].id,
      createdAt: new Date(now.getTime() - 3 * dayMs),
      updatedAt: new Date(now.getTime() - 3 * dayMs),
      dueDate: new Date(now.getTime() + 6 * dayMs),
      subtasks: [],
      comments: [],
      timeMinutes: 0,
    },

    // ── Project 3: Design System & Component Library ──
    {
      title: 'Audit WCAG 2.1 AA color contrast across dark and light modes',
      description: 'Audit text contrast, button states, focus indicators, and chart palettes for accessibility compliance.',
      status: 'done',
      priority: 'medium',
      labels: ['design', 'accessibility', 'tokens'],
      projectId: projects[2].id,
      teamId: teamAcme.id,
      createdById: users['designer@synctask.local'].id,
      assigneeId: users['designer@synctask.local'].id,
      createdAt: new Date(now.getTime() - 26 * dayMs),
      updatedAt: new Date(now.getTime() - 21 * dayMs),
      dueDate: new Date(now.getTime() - 20 * dayMs),
      subtasks: [
        { title: 'Audit secondary text tokens against muted background surfaces', completed: true, order: 0 },
        { title: 'Adjust destructive action button border contrast', completed: true, order: 1 },
      ],
      comments: [
        { authorId: users['designer@synctask.local'].id, content: 'All interactive tokens now exceed the required 4.5:1 ratio.', createdAt: new Date(now.getTime() - 21 * dayMs) },
      ],
      timeMinutes: 140,
    },
    {
      title: 'Refactor Button and Dropdown components with shadcn/ui',
      description: 'Migrate core primitive components to accessible Radix primitives with fluid keyboard focus rings.',
      status: 'done',
      priority: 'high',
      labels: ['frontend', 'design-system', 'ui'],
      projectId: projects[2].id,
      teamId: teamAcme.id,
      createdById: users['designer@synctask.local'].id,
      assigneeId: users['designer@synctask.local'].id,
      createdAt: new Date(now.getTime() - 15 * dayMs),
      updatedAt: new Date(now.getTime() - 8 * dayMs),
      dueDate: new Date(now.getTime() - 7 * dayMs),
      subtasks: [
        { title: 'Implement Radix dropdown trigger and animated menu content', completed: true, order: 0 },
        { title: 'Add variant tokens (primary, secondary, outline, ghost, danger)', completed: true, order: 1 },
      ],
      comments: [
        { authorId: users['dev@synctask.local'].id, content: 'Components imported into dashboard views; smooth transition feel.', createdAt: new Date(now.getTime() - 8 * dayMs) },
      ],
      timeMinutes: 210,
    },
    {
      title: 'Build accessible keyboard navigation for Kanban columns',
      description: 'Enable full arrow-key card traversal, spacebar grab, and live aria status updates for assistive tech.',
      status: 'in_progress',
      priority: 'high',
      labels: ['frontend', 'accessibility', 'kanban'],
      projectId: projects[2].id,
      teamId: teamAcme.id,
      createdById: users['designer@synctask.local'].id,
      assigneeId: users['designer@synctask.local'].id,
      createdAt: new Date(now.getTime() - 6 * dayMs),
      updatedAt: new Date(now.getTime() - 1 * dayMs),
      dueDate: new Date(now.getTime() + 5 * dayMs),
      subtasks: [
        { title: 'Implement arrow key card navigation within columns', completed: true, order: 0 },
        { title: 'Add aria-live announcer for drag and drop reordering', completed: false, order: 1 },
      ],
      comments: [],
      timeMinutes: 110,
    },
    {
      title: 'Design empty state illustrations and tokens for zero-task views',
      description: 'Craft subtle SVG graphics and helpful microcopy for empty project, filter, and search results.',
      status: 'todo',
      priority: 'low',
      labels: ['design', 'empty-states', 'illustration'],
      projectId: projects[2].id,
      teamId: teamAcme.id,
      createdById: users['designer@synctask.local'].id,
      assigneeId: users['designer@synctask.local'].id,
      createdAt: new Date(now.getTime() - 2 * dayMs),
      updatedAt: new Date(now.getTime() - 2 * dayMs),
      dueDate: new Date(now.getTime() + 8 * dayMs),
      subtasks: [],
      comments: [],
      timeMinutes: 0,
    },
    {
      title: 'Document typography hierarchy and responsive spacing scales',
      description: 'Publish interactive design system guidelines for font weights, letter spacing, and padding tokens.',
      status: 'todo',
      priority: 'low',
      labels: ['documentation', 'design-system', 'tokens'],
      projectId: projects[2].id,
      teamId: teamAcme.id,
      createdById: users['designer@synctask.local'].id,
      assigneeId: users['designer@synctask.local'].id,
      createdAt: new Date(now.getTime() - 1 * dayMs),
      updatedAt: new Date(now.getTime() - 1 * dayMs),
      dueDate: new Date(now.getTime() + 10 * dayMs),
      subtasks: [],
      comments: [],
      timeMinutes: 0,
    },
  ];

  const createdTasks = [];
  for (const t of taskDefinitions) {
    const task = await prisma.task.create({
      data: {
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        labels: t.labels,
        projectId: t.projectId,
        teamId: t.teamId,
        createdById: t.createdById,
        assigneeId: t.assigneeId,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        subtasks: {
          create: t.subtasks.map(s => ({
            title: s.title,
            completed: s.completed,
            order: s.order,
            createdAt: t.createdAt,
          })),
        },
        comments: {
          create: t.comments.map(c => ({
            authorId: c.authorId,
            content: c.content,
            createdAt: c.createdAt,
          })),
        },
      },
    });

    if (t.timeMinutes > 0 && t.assigneeId) {
      await prisma.timeEntry.create({
        data: {
          taskId: task.id,
          userId: t.assigneeId,
          teamId: t.teamId,
          durationMinutes: t.timeMinutes,
          description: `Engineering work on ${t.title}`,
          startTime: new Date(t.updatedAt.getTime() - t.timeMinutes * 60 * 1000),
          endTime: t.updatedAt,
          createdAt: t.updatedAt,
        },
      });
    }

    createdTasks.push({ ...task, originalDef: t });
    console.log(`  ✓ [${t.status.toUpperCase().padEnd(11)}] ${t.title}`);
  }

  // ── 6. Seed Chronological Activity Logs ──────────────────────────────────────
  console.log('\n📜 Seeding Chronological Team Activity History...');

  const activitiesData = [
    {
      taskId: createdTasks[0].id,
      userId: users['dev@synctask.local'].id,
      action: 'status_changed',
      details: 'moved task to Done',
      createdAt: new Date(now.getTime() - 18 * dayMs),
    },
    {
      taskId: createdTasks[6].id,
      userId: users['dev@synctask.local'].id,
      action: 'status_changed',
      details: 'moved task to Done',
      createdAt: new Date(now.getTime() - 14 * dayMs),
    },
    {
      taskId: createdTasks[11].id,
      userId: users['designer@synctask.local'].id,
      action: 'status_changed',
      details: 'moved task to Done',
      createdAt: new Date(now.getTime() - 21 * dayMs),
    },
    {
      taskId: createdTasks[1].id,
      userId: users['dev@synctask.local'].id,
      action: 'status_changed',
      details: 'moved task to Done',
      createdAt: new Date(now.getTime() - 10 * dayMs),
    },
    {
      taskId: createdTasks[12].id,
      userId: users['designer@synctask.local'].id,
      action: 'status_changed',
      details: 'moved task to Done',
      createdAt: new Date(now.getTime() - 8 * dayMs),
    },
    {
      taskId: createdTasks[9].id,
      userId: users['qa@synctask.local'].id,
      action: 'status_changed',
      details: 'moved task to Done',
      createdAt: new Date(now.getTime() - 5 * dayMs),
    },
    {
      taskId: createdTasks[2].id,
      userId: users['dev@synctask.local'].id,
      action: 'status_changed',
      details: 'moved task to In Progress',
      createdAt: new Date(now.getTime() - 4 * dayMs),
    },
    {
      taskId: createdTasks[4].id,
      userId: users['qa@synctask.local'].id,
      action: 'status_changed',
      details: 'moved task to Review',
      createdAt: new Date(now.getTime() - 3 * dayMs),
    },
    {
      taskId: createdTasks[4].id,
      userId: users['qa@synctask.local'].id,
      action: 'comment_added',
      details: 'added security testing review notes',
      createdAt: new Date(now.getTime() - 1 * dayMs),
    },
    {
      taskId: createdTasks[8].id,
      userId: users['admin@synctask.local'].id,
      action: 'status_changed',
      details: 'moved task to Review',
      createdAt: new Date(now.getTime() - 1 * dayMs),
    },
    {
      taskId: createdTasks[13].id,
      userId: users['designer@synctask.local'].id,
      action: 'status_changed',
      details: 'moved task to In Progress',
      createdAt: new Date(now.getTime() - 1 * dayMs),
    },
    {
      taskId: createdTasks[3].id,
      userId: users['admin@synctask.local'].id,
      action: 'status_changed',
      details: 'moved task to In Progress',
      createdAt: new Date(now.getTime() - 2 * dayMs),
    },
    {
      taskId: createdTasks[5].id,
      userId: users['admin@synctask.local'].id,
      action: 'created',
      details: 'created task "Configure Turnstile CAPTCHA on user registration"',
      createdAt: new Date(now.getTime() - 2 * dayMs),
    },
    {
      taskId: createdTasks[14].id,
      userId: users['designer@synctask.local'].id,
      action: 'created',
      details: 'created task "Design empty state illustrations and tokens"',
      createdAt: new Date(now.getTime() - 2 * dayMs),
    },
    {
      taskId: createdTasks[15].id,
      userId: users['designer@synctask.local'].id,
      action: 'created',
      details: 'created task "Document typography hierarchy and spacing scales"',
      createdAt: new Date(now.getTime() - 1 * dayMs),
    },
  ];

  for (const a of activitiesData) {
    await prisma.activity.create({
      data: {
        taskId: a.taskId,
        userId: a.userId,
        action: a.action,
        details: a.details,
        createdAt: a.createdAt,
      },
    });
  }

  console.log(`  ✓ Seeded ${activitiesData.length} chronological activity entries.`);

  console.log('\n🎉 Production-Grade Seeding Complete!\n');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('                 SYNC-TASK DEMO ACCOUNTS (Password: Password123!)           ');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  1. Workspace Owner:  owner@synctask.local    (Elena Rostova)');
  console.log('  2. Workspace Admin:  admin@synctask.local    (Marcus Vance)');
  console.log('  3. Senior Developer: dev@synctask.local      (Sarah Chen)');
  console.log('  4. Lead Designer:    designer@synctask.local (Liam Brooks)');
  console.log('  5. QA Engineer:      qa@synctask.local       (Amara Okafor)');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`  Team: Acme Cloud Technologies (${teamAcme.id})`);
  console.log(`  Projects: 3 Active Projects | Tasks: 16 Correlated Tasks`);
  console.log(`  Metrics: 6 Done (38%), 4 In Progress, 2 Review, 4 Todo`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
}

if (require.main === module) {
  seedRealisticData()
    .catch((e) => {
      console.error('❌ Error seeding test data:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { seedRealisticData };
