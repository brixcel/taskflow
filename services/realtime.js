const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

let io = null;

// In-memory active viewers per task: taskId -> Map<socketId, { id, name, email }>
const taskViewers = new Map();

function getUniqueViewers(taskId) {
  const viewersMap = taskViewers.get(taskId);
  if (!viewersMap || viewersMap.size === 0) return [];
  const uniqueUsers = new Map();
  for (const user of viewersMap.values()) {
    uniqueUsers.set(user.id, user);
  }
  return Array.from(uniqueUsers.values());
}

function removeSocketFromAllTasks(socketId) {
  const affectedTasks = [];
  for (const [taskId, viewersMap] of taskViewers.entries()) {
    if (viewersMap.has(socketId)) {
      viewersMap.delete(socketId);
      if (viewersMap.size === 0) {
        taskViewers.delete(taskId);
      }
      affectedTasks.push(taskId);
    }
  }
  return affectedTasks;
}

/**
 * Initialize Socket.IO server on top of HTTP server.
 */
function initSocketServer(httpServer, options = {}) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 25000,
    ...options,
  });

  // ─── Authentication Middleware ───────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      let token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      if (!token && socket.handshake.headers?.authorization) {
        const authHeader = socket.handshake.headers.authorization;
        token = authHeader.startsWith('Bearer ')
          ? authHeader.substring(7)
          : authHeader;
      }

      if (!token) {
        return next(new Error('Authentication error: Missing token'));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'secret'
      );

      const userId = decoded.userId || decoded.id;
      if (!userId) {
        return next(new Error('Authentication error: Invalid token payload'));
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, isDeleted: true },
      });

      if (!user || user.isDeleted) {
        return next(new Error('Authentication error: User not found or inactive'));
      }

      socket.user = {
        id:    user.id,
        name:  user.name,
        email: user.email,
      };

      return next();
    } catch (err) {
      return next(new Error(`Authentication error: ${err.message}`));
    }
  });

  // ─── Connection & Event Handlers ─────────────────────────────────────────────
  io.on('connection', (socket) => {
    const user = socket.user;
    // Auto-join personal user room for direct notifications
    socket.join(`user:${user.id}`);

    // Join a team room
    socket.on('join:team', async ({ teamId }, callback) => {
      try {
        if (!teamId) {
          return callback && callback({ error: 'teamId is required' });
        }

        // Verify membership in database
        const membership = await prisma.teamMembership.findUnique({
          where: { userId_teamId: { userId: user.id, teamId } },
        });

        if (!membership) {
          return callback && callback({ error: 'Forbidden: not a member of this team' });
        }

        socket.join(`team:${teamId}`);
        if (callback) callback({ success: true, teamId });
      } catch (err) {
        console.error('Error in join:team:', err);
        if (callback) callback({ error: 'Failed to join team room' });
      }
    });

    // Leave a team room
    socket.on('leave:team', ({ teamId }, callback) => {
      if (teamId) {
        socket.leave(`team:${teamId}`);
      }
      if (callback) callback({ success: true });
    });

    // Join a task room (for live comments, task updates, active viewers)
    socket.on('join:task', async ({ taskId }, callback) => {
      try {
        if (!taskId) {
          return callback && callback({ error: 'taskId is required' });
        }

        const task = await prisma.task.findUnique({
          where: { id: taskId },
          select: { id: true, teamId: true },
        });

        if (!task) {
          return callback && callback({ error: 'Task not found' });
        }

        // Verify user is a member of the task's team
        const membership = await prisma.teamMembership.findUnique({
          where: { userId_teamId: { userId: user.id, teamId: task.teamId } },
        });

        if (!membership) {
          return callback && callback({ error: 'Forbidden: cannot view task in another team' });
        }

        socket.join(`task:${taskId}`);

        // Register viewer presence
        if (!taskViewers.has(taskId)) {
          taskViewers.set(taskId, new Map());
        }
        taskViewers.get(taskId).set(socket.id, user);

        const viewers = getUniqueViewers(taskId);
        // Broadcast updated viewers to the task room
        io.to(`task:${taskId}`).emit('presence:viewers', { taskId, viewers });

        if (callback) callback({ success: true, taskId, viewers });
      } catch (err) {
        console.error('Error in join:task:', err);
        if (callback) callback({ error: 'Failed to join task room' });
      }
    });

    // Leave a task room
    socket.on('leave:task', ({ taskId }, callback) => {
      if (taskId) {
        socket.leave(`task:${taskId}`);
        if (taskViewers.has(taskId)) {
          taskViewers.get(taskId).delete(socket.id);
          if (taskViewers.get(taskId).size === 0) {
            taskViewers.delete(taskId);
          }
        }
        const viewers = getUniqueViewers(taskId);
        io.to(`task:${taskId}`).emit('presence:viewers', { taskId, viewers });
      }
      if (callback) callback({ success: true });
    });

    // Typing start indicator in task comment section
    socket.on('typing:start', ({ taskId }) => {
      if (taskId) {
        socket.to(`task:${taskId}`).emit('typing:start', {
          taskId,
          user: { id: user.id, name: user.name },
        });
      }
    });

    // Typing stop indicator in task comment section
    socket.on('typing:stop', ({ taskId }) => {
      if (taskId) {
        socket.to(`task:${taskId}`).emit('typing:stop', {
          taskId,
          userId: user.id,
        });
      }
    });

    // Handle disconnect and clean up viewer presence
    socket.on('disconnect', () => {
      const affectedTasks = removeSocketFromAllTasks(socket.id);
      for (const taskId of affectedTasks) {
        const viewers = getUniqueViewers(taskId);
        io.to(`task:${taskId}`).emit('presence:viewers', { taskId, viewers });
      }
    });
  });

  return io;
}

function getIO() {
  return io;
}

// ─── Broadcast Helper Functions ───────────────────────────────────────────────

function emitToTeam(teamId, event, data) {
  if (!io || !teamId) return;
  io.to(`team:${teamId}`).emit(event, data);
}

function emitToTask(taskId, event, data) {
  if (!io || !taskId) return;
  io.to(`task:${taskId}`).emit(event, data);
}

function emitToUser(userId, event, data) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, data);
}

function emitTaskCreated(teamId, task) {
  emitToTeam(teamId, 'task.created', { task });
}

function emitTaskUpdated(teamId, task) {
  emitToTeam(teamId, 'task.updated', { task });
  if (task && task.id) {
    emitToTask(task.id, 'task.updated', { task });
  }
}

function emitTaskDeleted(teamId, taskId) {
  emitToTeam(teamId, 'task.deleted', { id: taskId, taskId });
  emitToTask(taskId, 'task.deleted', { id: taskId, taskId });
}

function emitTaskAssigned(teamId, task, previousAssigneeId) {
  emitToTeam(teamId, 'task.assigned', { task, previousAssigneeId });
  if (task.assigneeId) {
    emitToUser(task.assigneeId, 'task.assigned', { task });
  }
}

function emitTaskCompleted(teamId, task) {
  emitToTeam(teamId, 'task.completed', { task });
  if (task && task.id) {
    emitToTask(task.id, 'task.completed', { task });
  }
}

function emitCommentCreated(teamId, taskId, comment) {
  emitToTeam(teamId, 'comment.created', { taskId, comment });
  emitToTask(taskId, 'comment.created', { taskId, comment });
}

function emitNotification(userId, notification) {
  emitToUser(userId, 'notification.created', { notification });
}

module.exports = {
  initSocketServer,
  getIO,
  getUniqueViewers,
  emitToTeam,
  emitToTask,
  emitToUser,
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskDeleted,
  emitTaskAssigned,
  emitTaskCompleted,
  emitCommentCreated,
  emitNotification,
};
