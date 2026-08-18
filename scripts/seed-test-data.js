/**
 * Comprehensive Test Data Seeder for SyncTask / TaskFlow
 *
 * Provisions realistic workspaces, roles, projects, tasks, subtasks,
 * comments, and time entries for local development & testing.
 *
 * Usage:
 *   node scripts/seed-test-data.js
 */

const bcrypt = require('bcrypt');
const prisma = require('../prisma');

async function seedTestData() {
  console.log('\n🌱 Starting SyncTask test data seeding...\n');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Create / Upsert Users
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
    console.log(`  👤 User ready: ${u.name.padEnd(16)} (${u.email})`);
  }

  // 2. Create Teams / Workspaces
  // Team 1: Acme Cloud Technologies (Primary)
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

  // Team 2: Growth & Innovation Lab (Secondary for team switching)
  let teamGrowth = await prisma.team.findFirst({
    where: { name: 'Growth & Innovation Lab', ownerId: users['owner@synctask.local'].id },
  });

  if (!teamGrowth) {
    teamGrowth = await prisma.team.create({
      data: {
        name: 'Growth & Innovation Lab',
        ownerId: users['owner@synctask.local'].id,
      },
    });
  }

  // 3. Configure Team Memberships
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

  const growthMemberships = [
    { user: users['owner@synctask.local'], role: 'owner' },
    { user: users['admin@synctask.local'], role: 'admin' },
    { user: users['designer@synctask.local'], role: 'member' },
  ];

  for (const m of growthMemberships) {
    await prisma.teamMembership.upsert({
      where: {
        userId_teamId: {
          userId: m.user.id,
          teamId: teamGrowth.id,
        },
      },
      update: { role: m.role },
      create: {
        userId: m.user.id,
        teamId: teamGrowth.id,
        role: m.role,
      },
    });
  }

  console.log(`\n  🏢 Team 1: ${teamAcme.name} (5 Members: Owner, Admin, Members)`);
  console.log(`  🏢 Team 2: ${teamGrowth.name} (3 Members)`);

  // 4. Create Projects
  const projectsData = [
    {
      name: 'SaaS Platform 2.0 Web Launch',
      description: 'Production rollout of next-generation task orchestration platform.',
      color: '#3b82f6',
      teamId: teamAcme.id,
      createdById: users['owner@synctask.local'].id,
    },
    {
      name: 'Mobile App Beta (iOS & Android)',
      description: 'Cross-platform mobile application with push notifications and offline sync.',
      color: '#10b981',
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
    },
    {
      name: 'AI Productivity Suite & Search',
      description: 'Gemini 3.5 AI assistant, smart task breakdowns, and natural language search.',
      color: '#8b5cf6',
      teamId: teamAcme.id,
      createdById: users['dev@synctask.local'].id,
    },
    {
      name: 'Design System & Component Library',
      description: 'shadcn/ui migration, accessible color tokens, dark mode, and micro-interactions.',
      color: '#f59e0b',
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
    }
    projects.push(proj);
    console.log(`  📁 Project: ${proj.name}`);
  }

  // 5. Clean and Seed Tasks
  const projectIds = projects.map(p => p.id);
  await prisma.task.deleteMany({
    where: { projectId: { in: projectIds } },
  });

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const tasksToCreate = [
    // ── Done Tasks ──
    {
      title: 'Finalize Postgres Row-Level Security (RLS) policies',
      description: 'Enforce multi-tenant database isolation across all team tables with strict tenant context.',
      status: 'done',
      priority: 'urgent',
      labels: ['security', 'database', 'rls'],
      projectId: projects[0].id,
      teamId: teamAcme.id,
      createdById: users['owner@synctask.local'].id,
      assigneeId: users['dev@synctask.local'].id,
      dueDate: new Date(now - 2 * dayMs),
      subtasks: [
        { title: 'Define tenant isolation helper in middleware', completed: true, order: 0 },
        { title: 'Add automated tests for cross-tenant IDOR defense', completed: true, order: 1 },
      ],
      comments: [
        { authorId: users['qa@synctask.local'].id, content: 'All automated tenant isolation tests passed with 100% separation.' },
      ],
      timeEntries: [
        { userId: users['dev@synctask.local'].id, durationMinutes: 180, description: 'Implemented RLS policies and test suites' },
      ],
    },
    {
      title: 'Audit WCAG AA Contrast Ratios across Dark & Light Modes',
      description: 'Verify all typography and interactive surfaces meet accessibility standards.',
      status: 'done',
      priority: 'medium',
      labels: ['design', 'accessibility', 'ui'],
      projectId: projects[3].id,
      teamId: teamAcme.id,
      createdById: users['designer@synctask.local'].id,
      assigneeId: users['designer@synctask.local'].id,
      dueDate: new Date(now - 1 * dayMs),
      subtasks: [
        { title: 'Run axe-core automated audit on dashboard', completed: true, order: 0 },
        { title: 'Adjust secondary button border contrast', completed: true, order: 1 },
      ],
      comments: [
        { authorId: users['designer@synctask.local'].id, content: 'Contrast ratio is now 4.8:1 on all text tokens.' },
      ],
      timeEntries: [
        { userId: users['designer@synctask.local'].id, durationMinutes: 120, description: 'Design system token refinement' },
      ],
    },

    // ── In Progress Tasks ──
    {
      title: 'Implement Server-Side Redis Session Engine & Eviction',
      description: 'Support configurable session lifetimes, explicit expiresAt, and LRU concurrent session limits.',
      status: 'in_progress',
      priority: 'urgent',
      labels: ['backend', 'redis', 'security'],
      projectId: projects[0].id,
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
      assigneeId: users['dev@synctask.local'].id,
      dueDate: new Date(now + 2 * dayMs),
      subtasks: [
        { title: 'Store explicit expiresAt in Redis payload', completed: true, order: 0 },
        { title: 'Enforce LRU concurrent session limits (default 5)', completed: true, order: 1 },
        { title: 'Add Axios response interceptor for session revocation', completed: false, order: 2 },
      ],
      comments: [
        { authorId: users['admin@synctask.local'].id, content: 'Make sure device tracking captures OS and browser headers.' },
        { authorId: users['dev@synctask.local'].id, content: 'Understood. Device parser is wired to user-agent.' },
      ],
      timeEntries: [
        { userId: users['dev@synctask.local'].id, durationMinutes: 150, description: 'Redis session management and LRU eviction' },
      ],
    },
    {
      title: 'Configure Push Notification Payload Architecture',
      description: 'Deliver instant push alerts when task assignments or status changes occur.',
      status: 'in_progress',
      priority: 'high',
      labels: ['mobile', 'notifications', 'api'],
      projectId: projects[1].id,
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
      assigneeId: users['qa@synctask.local'].id,
      dueDate: new Date(now + 3 * dayMs),
      subtasks: [
        { title: 'Test push tokens with Apple APNs sandbox', completed: true, order: 0 },
        { title: 'Configure Firebase Cloud Messaging (FCM)', completed: false, order: 1 },
      ],
      comments: [],
      timeEntries: [
        { userId: users['qa@synctask.local'].id, durationMinutes: 90, description: 'Push notification sandbox payload testing' },
      ],
    },
    {
      title: 'Refactor Kanban Board with shadcn/ui & Fluid Drag',
      description: 'Upgrade Kanban columns, card drag handles, and smooth drop placeholders.',
      status: 'in_progress',
      priority: 'high',
      labels: ['frontend', 'ui', 'shadcn'],
      projectId: projects[3].id,
      teamId: teamAcme.id,
      createdById: users['designer@synctask.local'].id,
      assigneeId: users['designer@synctask.local'].id,
      dueDate: new Date(now + 4 * dayMs),
      subtasks: [
        { title: 'Add drag elevation shadow tokens', completed: true, order: 0 },
        { title: 'Implement keyboard reordering accessibility', completed: false, order: 1 },
      ],
      comments: [],
      timeEntries: [
        { userId: users['designer@synctask.local'].id, durationMinutes: 75, description: 'Kanban drag styling polish' },
      ],
    },

    // ── Review Tasks ──
    {
      title: 'Integrate Gemini 3.5 Flash AI Assistant for Task Breakdown',
      description: 'Automated task generation, suggested subtasks, and token budgeting firewall.',
      status: 'review',
      priority: 'high',
      labels: ['ai', 'gemini', 'automation'],
      projectId: projects[2].id,
      teamId: teamAcme.id,
      createdById: users['owner@synctask.local'].id,
      assigneeId: users['dev@synctask.local'].id,
      dueDate: new Date(now + 1 * dayMs),
      subtasks: [
        { title: 'Implement AI cost firewall and prompt token limits', completed: true, order: 0 },
        { title: 'Add AI assistant UI modal on task creation', completed: true, order: 1 },
      ],
      comments: [
        { authorId: users['owner@synctask.local'].id, content: 'Tested the breakdown prompt with 10 complex tasks — results look crisp!' },
      ],
      timeEntries: [
        { userId: users['dev@synctask.local'].id, durationMinutes: 120, description: 'Gemini AI task generation integration' },
      ],
    },
    {
      title: 'Implement Granular Role-Based Permissions (RBAC)',
      description: 'Ensure owners, admins, and members have strict privilege boundary checks.',
      status: 'review',
      priority: 'urgent',
      labels: ['security', 'auth', 'rbac'],
      projectId: projects[0].id,
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
      assigneeId: users['qa@synctask.local'].id,
      dueDate: new Date(now + 1 * dayMs),
      subtasks: [
        { title: 'Member cannot delete projects test', completed: true, order: 0 },
        { title: 'Admin cannot remove team owner test', completed: true, order: 1 },
      ],
      comments: [
        { authorId: users['qa@synctask.local'].id, content: 'RBAC boundary matrix tested. All 14 security assertions passed.' },
      ],
      timeEntries: [
        { userId: users['qa@synctask.local'].id, durationMinutes: 110, description: 'RBAC security matrix testing' },
      ],
    },

    // ── Todo Tasks ──
    {
      title: 'Configure Cloudflare Turnstile CAPTCHA on Auth Routes',
      description: 'Add invisible bot defense on registration and login endpoints.',
      status: 'todo',
      priority: 'medium',
      labels: ['security', 'auth', 'cloudflare'],
      projectId: projects[0].id,
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
      assigneeId: users['dev@synctask.local'].id,
      dueDate: new Date(now + 5 * dayMs),
      subtasks: [
        { title: 'Obtain Turnstile sitekey and secret key', completed: false, order: 0 },
        { title: 'Add Turnstile server validation helper', completed: false, order: 1 },
      ],
      comments: [],
      timeEntries: [],
    },
    {
      title: 'Build Offline SQLite Sync for Mobile App',
      description: 'Allow users to read and create tasks offline, syncing automatically upon reconnect.',
      status: 'todo',
      priority: 'high',
      labels: ['mobile', 'sync', 'offline'],
      projectId: projects[1].id,
      teamId: teamAcme.id,
      createdById: users['admin@synctask.local'].id,
      assigneeId: users['dev@synctask.local'].id,
      dueDate: new Date(now + 6 * dayMs),
      subtasks: [],
      comments: [],
      timeEntries: [],
    },
    {
      title: 'Design Dark Mode Color Palette for Charts & Graphs',
      description: 'Create harmonious HSL color scales for workload distribution and burndown charts.',
      status: 'todo',
      priority: 'low',
      labels: ['design', 'charts', 'theme'],
      projectId: projects[3].id,
      teamId: teamAcme.id,
      createdById: users['designer@synctask.local'].id,
      assigneeId: users['designer@synctask.local'].id,
      dueDate: new Date(now + 7 * dayMs),
      subtasks: [],
      comments: [],
      timeEntries: [],
    },
  ];

  for (const t of tasksToCreate) {
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
        subtasks: {
          create: t.subtasks,
        },
        comments: {
          create: t.comments,
        },
      },
    });

    if (t.timeEntries && t.timeEntries.length > 0) {
      await prisma.timeEntry.createMany({
        data: t.timeEntries.map((te) => ({
          taskId: task.id,
          userId: te.userId,
          teamId: t.teamId,
          durationMinutes: te.durationMinutes,
          description: te.description,
          startTime: new Date(now - te.durationMinutes * 60 * 1000),
          endTime: new Date(now),
        })),
      });
    }

    console.log(`  ✓ Task: [${t.status.toUpperCase().padEnd(11)}] ${t.title}`);
  }

  console.log('\n🎉 Test Data Seeding Complete!\n');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('                 SYNC-TASK TEST ACCOUNTS (Password: Password123!)           ');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  1. Workspace Owner:  owner@synctask.local    (Elena Rostova)');
  console.log('  2. Workspace Admin:  admin@synctask.local    (Marcus Vance)');
  console.log('  3. Senior Developer: dev@synctask.local      (Sarah Chen)');
  console.log('  4. Lead Designer:    designer@synctask.local (Liam Brooks)');
  console.log('  5. QA Engineer:      qa@synctask.local       (Amara Okafor)');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  Workspaces: Acme Cloud Technologies & Growth & Innovation Lab');
  console.log('  Projects: 4 Active Projects | Tasks: 10 Seeded Tasks across all columns\n');
}

seedTestData()
  .catch((e) => {
    console.error('❌ Error seeding test data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
