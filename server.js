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

const http = require('http');
const { initSocketServer } = require('./services/realtime');

const app = express();
const server = http.createServer(app);
const io = initSocketServer(server);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

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
app.use(githubRoutes);
app.use('/api', githubRoutes);

// Comments, activities, and subtasks are nested under tasks
app.use('/tasks/:taskId/comments', commentRoutes);
app.use('/tasks/:taskId/activities', activityRoutes);
app.use('/tasks/:taskId/subtasks', subtaskRoutes);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = { app, server, io };
