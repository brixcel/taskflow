require('dotenv').config();
const express        = require('express');
const cors           = require('cors');
const authRoutes     = require('./routes/auth');
const taskRoutes     = require('./routes/tasks');
const teamRoutes     = require('./routes/teams');
const commentRoutes      = require('./routes/comments');
const activityRoutes     = require('./routes/activities');
const notificationRoutes = require('./routes/notifications');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth',          authRoutes);
app.use('/tasks',         taskRoutes);
app.use('/teams',         teamRoutes);
app.use('/notifications', notificationRoutes);

// Comments and activities are nested under tasks
app.use('/tasks/:taskId/comments',   commentRoutes);
app.use('/tasks/:taskId/activities', activityRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
