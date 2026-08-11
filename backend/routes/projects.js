const express     = require('express');
const prisma      = require('../prisma');
const requireAuth = require('../middleware/auth');
const resolveTeam = require('../middleware/resolveTeam');
const requireRole = require('../middleware/requireRole');
const validate    = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const schemas     = require('../validation/schemas');
const logger      = require('../middleware/logger');
const {
  emitProjectCreated,
  emitProjectUpdated,
  emitProjectDeleted,
} = require('../services/realtime');

const router = express.Router({ mergeParams: true });

// Require auth and resolve team for all project routes
router.use(requireAuth);

// Team resolution helper supporting both direct /projects and nested /teams/:teamId/projects
async function resolveProjectTeam(req, res, next) {
  if (req.params.teamId) {
    const membership = await prisma.teamMembership.findUnique({
      where: {
        userId_teamId: {
          userId: req.userId,
          teamId: req.params.teamId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }

    req.teamId = req.params.teamId;
    req.teamRole = membership.role;
    return next();
  }

  return resolveTeam(req, res, next);
}

router.use(resolveProjectTeam);

// Helper to compute project stats
function computeProjectStats(project) {
  const tasks = project.tasks || [];
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'done').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const todoTasks = tasks.filter((t) => t.status === 'todo').length;

  const now = new Date();
  const overdueTasks = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done'
  ).length;

  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    totalTasks,
    completedTasks,
    inProgressTasks,
    todoTasks,
    overdueTasks,
    progress,
    membersCount: project.members ? project.members.length : 0,
  };
}

// ─── GET / — List all projects for active team ────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, search, archived } = req.query;

    const where = {
      teamId: req.teamId,
    };

    if (archived === 'true') {
      where.isArchived = true;
    } else if (archived === 'all') {
      // Return both active and archived
    } else {
      where.isArchived = false;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rawProjects = await prisma.project.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        tasks: {
          select: {
            id: true,
            status: true,
            priority: true,
            dueDate: true,
          },
        },
      },
    });

    const projects = rawProjects.map((p) => {
      const stats = computeProjectStats(p);
      const { tasks, ...rest } = p;
      return {
        ...rest,
        stats,
      };
    });

    res.json({ projects, count: projects.length });
  } catch (error) {
    logger.error({ err: error }, 'GET /projects failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── POST / — Create a new project ───────────────────────────────────────────
router.post('/', validate(schemas.projectCreate), async (req, res) => {
  try {
    const {
      name,
      description,
      icon,
      color,
      status,
      startDate,
      targetDate,
      memberIds,
    } = req.body;

    // Validate any provided memberIds belong to the team
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      const validMembers = await prisma.teamMembership.findMany({
        where: {
          teamId: req.teamId,
          userId: { in: memberIds },
        },
        select: { userId: true },
      });

      if (validMembers.length !== memberIds.length) {
        return res.status(400).json({
          error: 'One or more assigned members do not belong to this team',
        });
      }
    }

    // Get next order
    const lastProject = await prisma.project.findFirst({
      where: { teamId: req.teamId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const order = (lastProject?.order ?? 0) + 1000;

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: sanitize(name),
          description: description != null ? sanitize(description) : null,
          icon: icon || '📁',
          color: color || '#6366f1',
          status: status || 'active',
          startDate: startDate ? new Date(startDate) : null,
          targetDate: targetDate ? new Date(targetDate) : null,
          order,
          teamId: req.teamId,
          createdById: req.userId,
        },
      });

      // Add creator as project lead
      await tx.projectMember.create({
        data: {
          projectId: created.id,
          userId: req.userId,
          role: 'lead',
        },
      });

      // Add additional members
      if (Array.isArray(memberIds)) {
        const additionalMembers = memberIds.filter((id) => id !== req.userId);
        if (additionalMembers.length > 0) {
          await tx.projectMember.createMany({
            data: additionalMembers.map((uid) => ({
              projectId: created.id,
              userId: uid,
              role: 'member',
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.project.findUnique({
        where: { id: created.id },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          members: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          tasks: {
            select: { id: true, status: true, priority: true, dueDate: true },
          },
        },
      });
    });

    const stats = computeProjectStats(project);
    const { tasks, ...projectData } = project;
    const responsePayload = {
      ...projectData,
      stats,
    };

    emitProjectCreated(req.teamId, responsePayload);

    res.status(201).json({ project: responsePayload });
  } catch (error) {
    logger.error({ err: error }, 'POST /projects failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /:id — Get single project details ───────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findFirst({
      where: {
        id,
        teamId: req.teamId,
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        tasks: {
          orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            createdBy: { select: { id: true, name: true } },
            subtasks: {
              select: { id: true, completed: true },
            },
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const stats = computeProjectStats(project);

    // Priority breakdown
    const priorityBreakdown = {
      low: project.tasks.filter((t) => t.priority === 'low').length,
      medium: project.tasks.filter((t) => t.priority === 'medium').length,
      high: project.tasks.filter((t) => t.priority === 'high').length,
      urgent: project.tasks.filter((t) => t.priority === 'urgent').length,
    };

    res.json({
      project: {
        ...project,
        stats: {
          ...stats,
          priorityBreakdown,
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'GET /projects/:id failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── PATCH /:id — Update project ─────────────────────────────────────────────
router.patch('/:id', validate(schemas.projectUpdate), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      icon,
      color,
      status,
      startDate,
      targetDate,
      order,
      isArchived,
    } = req.body;

    const existingProject = await prisma.project.findFirst({
      where: { id, teamId: req.teamId },
      include: {
        members: true,
      },
    });

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Permission check: team owner/admin, project creator, or project lead
    const isProjectLead = existingProject.members.some(
      (m) => m.userId === req.userId && m.role === 'lead'
    );
    const isCreator = existingProject.createdById === req.userId;
    const isTeamAdmin = req.teamRole === 'owner' || req.teamRole === 'admin';

    if (!isTeamAdmin && !isCreator && !isProjectLead) {
      return res.status(403).json({
        error: 'You do not have permission to modify this project',
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = sanitize(name);
    if (description !== undefined) updateData.description = description != null ? sanitize(description) : null;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;
    if (status !== undefined) updateData.status = status;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (targetDate !== undefined) updateData.targetDate = targetDate ? new Date(targetDate) : null;
    if (order !== undefined) updateData.order = order;
    if (isArchived !== undefined) updateData.isArchived = isArchived;

    const updated = await prisma.project.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        tasks: {
          select: { id: true, status: true, priority: true, dueDate: true },
        },
      },
    });

    const stats = computeProjectStats(updated);
    const { tasks, ...projectData } = updated;
    const responsePayload = {
      ...projectData,
      stats,
    };

    emitProjectUpdated(req.teamId, responsePayload);

    res.json({ project: responsePayload });
  } catch (error) {
    logger.error({ err: error }, 'PATCH /projects/:id failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── DELETE /:id — Delete project ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { deleteTasks } = req.query;

    const existingProject = await prisma.project.findFirst({
      where: { id, teamId: req.teamId },
      include: {
        members: true,
      },
    });

    if (!existingProject) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const isProjectLead = existingProject.members.some(
      (m) => m.userId === req.userId && m.role === 'lead'
    );
    const isCreator = existingProject.createdById === req.userId;
    const isTeamAdmin = req.teamRole === 'owner' || req.teamRole === 'admin';

    if (!isTeamAdmin && !isCreator && !isProjectLead) {
      return res.status(403).json({
        error: 'You do not have permission to delete this project',
      });
    }

    await prisma.$transaction(async (tx) => {
      if (deleteTasks === 'true') {
        await tx.task.deleteMany({
          where: { projectId: id, teamId: req.teamId },
        });
      } else {
        // Disassociate tasks without deleting them
        await tx.task.updateMany({
          where: { projectId: id, teamId: req.teamId },
          data: { projectId: null },
        });
      }

      await tx.project.delete({
        where: { id },
      });
    });

    emitProjectDeleted(req.teamId, id);

    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'DELETE /projects/:id failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── GET /:id/stats — Detailed project statistics & metrics ──────────────────
router.get('/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findFirst({
      where: { id, teamId: req.teamId },
      include: {
        tasks: {
          include: {
            assignee: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const tasks = project.tasks;
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'done').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
    const todoTasks = tasks.filter((t) => t.status === 'todo').length;

    const now = new Date();
    const overdueTasks = tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done'
    ).length;

    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Status breakdown
    const statusCounts = {
      todo: todoTasks,
      in_progress: inProgressTasks,
      done: completedTasks,
    };

    // Priority breakdown
    const priorityCounts = {
      low: tasks.filter((t) => t.priority === 'low').length,
      medium: tasks.filter((t) => t.priority === 'medium').length,
      high: tasks.filter((t) => t.priority === 'high').length,
      urgent: tasks.filter((t) => t.priority === 'urgent').length,
    };

    // Workload / Assignee distribution
    const assigneeMap = {};
    for (const t of tasks) {
      const key = t.assigneeId || 'unassigned';
      const name = t.assignee?.name || 'Unassigned';
      if (!assigneeMap[key]) {
        assigneeMap[key] = {
          userId: t.assigneeId,
          name,
          total: 0,
          completed: 0,
          inProgress: 0,
          todo: 0,
        };
      }
      assigneeMap[key].total++;
      if (t.status === 'done') assigneeMap[key].completed++;
      else if (t.status === 'in_progress') assigneeMap[key].inProgress++;
      else assigneeMap[key].todo++;
    }

    res.json({
      stats: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        todoTasks,
        overdueTasks,
        progress,
        statusCounts,
        priorityCounts,
        workload: Object.values(assigneeMap),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'GET /projects/:id/stats failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── POST /:id/members — Add member to project ───────────────────────────────
router.post('/:id/members', validate(schemas.projectMemberAdd), async (req, res) => {
  try {
    const { id } = req.params;
    const { userId: targetUserId, role } = req.body;

    const project = await prisma.project.findFirst({
      where: { id, teamId: req.teamId },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Verify target user is member of the team
    const teamMembership = await prisma.teamMembership.findUnique({
      where: {
        userId_teamId: {
          userId: targetUserId,
          teamId: req.teamId,
        },
      },
    });

    if (!teamMembership) {
      return res.status(400).json({ error: 'User is not a member of this team' });
    }

    const member = await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: id,
          userId: targetUserId,
        },
      },
      update: {
        role: role || 'member',
      },
      create: {
        projectId: id,
        userId: targetUserId,
        role: role || 'member',
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    emitProjectUpdated(req.teamId, { id, memberAdded: member });

    res.status(201).json({ member });
  } catch (error) {
    logger.error({ err: error }, 'POST /projects/:id/members failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// ─── DELETE /:id/members/:userId — Remove member from project ─────────────────
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const { id, userId: targetUserId } = req.params;

    const project = await prisma.project.findFirst({
      where: { id, teamId: req.teamId },
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await prisma.projectMember.deleteMany({
      where: {
        projectId: id,
        userId: targetUserId,
      },
    });

    emitProjectUpdated(req.teamId, { id, memberRemovedId: targetUserId });

    res.json({ success: true, message: 'Member removed from project' });
  } catch (error) {
    logger.error({ err: error }, 'DELETE /projects/:id/members/:userId failed');
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;
