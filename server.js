require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const teamRoutes = require('./routes/teams');
const commentRoutes = require('./routes/comments');
const activityRoutes = require('./routes/activities');
const notificationRoutes = require('./routes/notifications');
const projectRoutes = require('./routes/projects');
const calendarRoutes = require('./routes/calendar');
const searchRoutes = require('./routes/search');
const aiRoutes = require('./routes/ai');
const subtaskRoutes = require('./routes/subtasks');
const developerRoutes = require('./routes/developer');
const githubRoutes = require('./routes/github');
const integrationsRoutes = require('./routes/integrations');
const usersRoutes = require('./routes/users');
const attachmentsRoutes = require('./routes/attachments');
const taskTemplatesRoutes = require('./routes/taskTemplates');
const viewsRoutes = require('./routes/views');
const { timeRouter, taskTimeRouter } = require('./routes/timeTracking');

const http = require('http');
const { initSocketServer } = require('./services/realtime');
const requestId = require('./middleware/requestId');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const io = initSocketServer(server);
const PORT = process.env.PORT || 3000;

const { sanitizeInput } = require('./middleware/sanitize');
const { metricsMiddleware } = require('./middleware/metricsMiddleware');
const metricsRoutes = require('./routes/metrics');
const healthRoutes = require('./routes/health');

app.use(requestId);
app.use(metricsMiddleware);
app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(sanitizeInput);

app.use('/metrics', metricsRoutes);
app.use('/health', healthRoutes);

app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/tasks', taskRoutes);
app.use('/teams', teamRoutes);
app.use('/teams/:teamId/projects', projectRoutes);
app.use('/projects', projectRoutes);
app.use('/notifications', notificationRoutes);
app.use('/calendar', calendarRoutes);
app.use('/search', searchRoutes);
app.use('/ai', aiRoutes);
app.use('/subtasks', subtaskRoutes);
app.use('/developer', developerRoutes);
app.use('/developer', integrationsRoutes);
app.use('/task-templates', taskTemplatesRoutes);
app.use('/views', viewsRoutes);
app.use('/time', timeRouter);
app.use('/tasks', taskTimeRouter);
app.use(githubRoutes);
app.use('/api', githubRoutes);
app.use(attachmentsRoutes);

// Comments, activities, and subtasks are nested under tasks
app.use('/tasks/:taskId/comments', commentRoutes);
app.use('/tasks/:taskId/activities', activityRoutes);
app.use('/tasks/:taskId/subtasks', subtaskRoutes);

// Centralized Error Handling Middleware (Charter C19)
app.use(errorHandler);

if (require.main === module) {
  server.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    try {
      const prismaClient = require('./prisma');
      const owner = await prismaClient.user.findUnique({ where: { email: 'owner@synctask.local' } });
      if (!owner) {
        console.log('🌱 No canonical demo accounts detected in database. Seeding demo accounts...');
        const { seedRealisticData } = require('./scripts/seed-test-data');
        await seedRealisticData();
      }
    } catch (err) {
      console.warn('⚠️ Auto-seed check notice:', err.message);
    }
  });
}

module.exports = { app, server, io };
