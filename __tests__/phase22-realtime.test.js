/**
 * Phase 22 — Real-Time Collaboration Test Suite
 */

const http = require('http');
const express = require('express');
const request = require('supertest');
const { io: ioc } = require('socket.io-client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { initSocketServer } = require('../services/realtime');

const authRoutes         = require('../routes/auth');
const taskRoutes         = require('../routes/tasks');
const teamRoutes         = require('../routes/teams');
const commentRoutes      = require('../routes/comments');
const notificationRoutes = require('../routes/notifications');

let server;
let io;
let port;
let serverUrl;

let userA, userB, userC, userExternal;
let tokenA, tokenB, tokenC, tokenExternal;
let teamA, teamB;
let testTaskA;

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

function createClientSocket(token) {
  return ioc(serverUrl, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
  });
}

beforeAll(async () => {
  // Set up Express app with Socket.IO
  const app = express();
  app.use(express.json());
  app.use('/auth',          authRoutes);
  app.use('/tasks',         taskRoutes);
  app.use('/teams',         teamRoutes);
  app.use('/notifications', notificationRoutes);
  app.use('/tasks/:taskId/comments', commentRoutes);

  server = http.createServer(app);
  io = initSocketServer(server);

  await new Promise((resolve) => {
    server.listen(0, () => {
      port = server.address().port;
      serverUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  // Clean database records
  await prisma.notification.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: ['p22_a@test.com', 'p22_b@test.com', 'p22_c@test.com', 'p22_ext@test.com'] },
    },
  });

  const passwordHash = await bcrypt.hash('Password123!', 8);

  userA = await prisma.user.create({
    data: { name: 'Alice Alpha', email: 'p22_a@test.com', passwordHash, emailVerified: true },
  });
  userB = await prisma.user.create({
    data: { name: 'Bob Beta', email: 'p22_b@test.com', passwordHash, emailVerified: true },
  });
  userC = await prisma.user.create({
    data: { name: 'Charlie Gamma', email: 'p22_c@test.com', passwordHash, emailVerified: true },
  });
  userExternal = await prisma.user.create({
    data: { name: 'Eve External', email: 'p22_ext@test.com', passwordHash, emailVerified: true },
  });

  tokenA = makeToken(userA);
  tokenB = makeToken(userB);
  tokenC = makeToken(userC);
  tokenExternal = makeToken(userExternal);

  // Team A (Alice Owner, Bob Member, Charlie Member)
  teamA = await prisma.team.create({
    data: { name: 'Team Alpha', ownerId: userA.id },
  });
  await prisma.teamMembership.createMany({
    data: [
      { userId: userA.id, teamId: teamA.id, role: 'owner' },
      { userId: userB.id, teamId: teamA.id, role: 'member' },
      { userId: userC.id, teamId: teamA.id, role: 'member' },
    ],
  });

  // Team B (Eve External Owner)
  teamB = await prisma.team.create({
    data: { name: 'Team Beta', ownerId: userExternal.id },
  });
  await prisma.teamMembership.create({
    data: { userId: userExternal.id, teamId: teamB.id, role: 'owner' },
  });

  // Create initial task in Team A
  testTaskA = await prisma.task.create({
    data: {
      title: 'Initial Alpha Task',
      status: 'todo',
      createdById: userA.id,
      assigneeId: userB.id,
      teamId: teamA.id,
    },
  });
});

afterAll(async () => {
  if (io) {
    io.close();
  }
  await new Promise((resolve) => {
    server.close(resolve);
  });

  await prisma.notification.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.teamMembership.deleteMany({});
  await prisma.team.deleteMany({});
  await prisma.user.deleteMany({
    where: {
      email: { in: ['p22_a@test.com', 'p22_b@test.com', 'p22_c@test.com', 'p22_ext@test.com'] },
    },
  });
});

describe('Phase 22 — Real-Time Collaboration API & Sockets', () => {

  describe('1. Socket Authentication Handshake', () => {
    it('successfully connects when valid JWT token is provided', (done) => {
      const clientSocket = createClientSocket(tokenA);
      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        clientSocket.disconnect();
        done();
      });
      clientSocket.on('connect_error', (err) => {
        done(err);
      });
    });

    it('rejects connection when token is missing', (done) => {
      const clientSocket = ioc(serverUrl, {
        transports: ['websocket'],
        forceNew: true,
      });
      clientSocket.on('connect_error', (err) => {
        expect(err.message).toMatch(/Authentication error/);
        clientSocket.disconnect();
        done();
      });
      clientSocket.on('connect', () => {
        clientSocket.disconnect();
        done(new Error('Should not have connected without token'));
      });
    });

    it('rejects connection when token is invalid or corrupted', (done) => {
      const clientSocket = createClientSocket('invalid-jwt-token-xyz');
      clientSocket.on('connect_error', (err) => {
        expect(err.message).toMatch(/Authentication error/);
        clientSocket.disconnect();
        done();
      });
      clientSocket.on('connect', () => {
        clientSocket.disconnect();
        done(new Error('Should not have connected with invalid token'));
      });
    });
  });

  describe('2. Multi-Tenant Room Authorization', () => {
    let socketAlice;
    let socketEve;

    beforeEach((done) => {
      socketAlice = createClientSocket(tokenA);
      socketEve   = createClientSocket(tokenExternal);

      let connectedCount = 0;
      const checkDone = () => {
        connectedCount++;
        if (connectedCount === 2) done();
      };

      socketAlice.on('connect', checkDone);
      socketEve.on('connect', checkDone);
    });

    afterEach(() => {
      socketAlice.disconnect();
      socketEve.disconnect();
    });

    it('allows a member to join their team room', (done) => {
      socketAlice.emit('join:team', { teamId: teamA.id }, (response) => {
        expect(response.success).toBe(true);
        expect(response.teamId).toBe(teamA.id);
        done();
      });
    });

    it('forbids an external user from joining another team room', (done) => {
      socketEve.emit('join:team', { teamId: teamA.id }, (response) => {
        expect(response.error).toMatch(/Forbidden/);
        done();
      });
    });

    it('allows a member to join a task room in their team', (done) => {
      socketAlice.emit('join:task', { taskId: testTaskA.id }, (response) => {
        expect(response.success).toBe(true);
        expect(response.taskId).toBe(testTaskA.id);
        expect(Array.isArray(response.viewers)).toBe(true);
        done();
      });
    });

    it('forbids an external user from joining a task room of another team', (done) => {
      socketEve.emit('join:task', { taskId: testTaskA.id }, (response) => {
        expect(response.error).toMatch(/Forbidden/);
        done();
      });
    });
  });

  describe('3. Presence & Active Viewers', () => {
    let socketAlice;
    let socketBob;

    beforeEach((done) => {
      socketAlice = createClientSocket(tokenA);
      socketBob   = createClientSocket(tokenB);

      let count = 0;
      const onConn = () => { if (++count === 2) done(); };
      socketAlice.on('connect', onConn);
      socketBob.on('connect', onConn);
    });

    afterEach(() => {
      socketAlice.disconnect();
      socketBob.disconnect();
    });

    it('broadcasts presence:viewers to task room when users join and leave', (done) => {
      // Alice joins task room first
      socketAlice.emit('join:task', { taskId: testTaskA.id }, () => {
        // Bob registers listener for presence updates before joining
        socketBob.on('presence:viewers', ({ taskId, viewers }) => {
          if (taskId === testTaskA.id && viewers.some(v => v.id === userB.id)) {
            // Both Alice and Bob should be present
            expect(viewers.some(v => v.id === userA.id)).toBe(true);
            expect(viewers.some(v => v.id === userB.id)).toBe(true);

            // Now Bob leaves task room and Alice should get update
            socketAlice.on('presence:viewers', ({ viewers: updatedViewers }) => {
              if (!updatedViewers.some(v => v.id === userB.id)) {
                expect(updatedViewers.some(v => v.id === userA.id)).toBe(true);
                done();
              }
            });

            socketBob.emit('leave:task', { taskId: testTaskA.id });
          }
        });

        // Bob joins task room
        socketBob.emit('join:task', { taskId: testTaskA.id });
      });
    });

    it('cleans up presence automatically on disconnect', (done) => {
      socketAlice.emit('join:task', { taskId: testTaskA.id }, () => {
        socketAlice.on('presence:viewers', ({ viewers }) => {
          if (!viewers.some(v => v.id === userB.id)) {
            done();
          }
        });

        socketBob.emit('join:task', { taskId: testTaskA.id }, () => {
          // Bob unexpectedly disconnects
          socketBob.disconnect();
        });
      });
    });
  });

  describe('4. Typing Indicators', () => {
    let socketAlice;
    let socketBob;

    beforeEach((done) => {
      socketAlice = createClientSocket(tokenA);
      socketBob   = createClientSocket(tokenB);

      let count = 0;
      const onConn = () => { if (++count === 2) done(); };
      socketAlice.on('connect', onConn);
      socketBob.on('connect', onConn);
    });

    afterEach(() => {
      socketAlice.disconnect();
      socketBob.disconnect();
    });

    it('broadcasts typing:start and typing:stop to task viewers excluding sender', (done) => {
      socketAlice.emit('join:task', { taskId: testTaskA.id }, () => {
        socketBob.emit('join:task', { taskId: testTaskA.id }, () => {
          // Alice listens for Bob's typing
          socketAlice.on('typing:start', ({ taskId, user }) => {
            expect(taskId).toBe(testTaskA.id);
            expect(user.id).toBe(userB.id);

            socketAlice.on('typing:stop', ({ taskId: stopTaskId, userId }) => {
              expect(stopTaskId).toBe(testTaskA.id);
              expect(userId).toBe(userB.id);
              done();
            });

            // Bob stops typing
            socketBob.emit('typing:stop', { taskId: testTaskA.id });
          });

          // Bob starts typing
          socketBob.emit('typing:start', { taskId: testTaskA.id });
        });
      });
    });
  });

  describe('5. Real-Time Task Lifecycle Broadcasts', () => {
    let socketAlice;
    let socketBob;
    let socketEve;
    let createdTaskId;

    beforeAll((done) => {
      socketAlice = createClientSocket(tokenA);
      socketBob   = createClientSocket(tokenB);
      socketEve   = createClientSocket(tokenExternal);

      let count = 0;
      const onConn = () => {
        if (++count === 3) {
          socketAlice.emit('join:team', { teamId: teamA.id });
          socketBob.emit('join:team', { teamId: teamA.id });
          socketEve.emit('join:team', { teamId: teamB.id });
          done();
        }
      };

      socketAlice.on('connect', onConn);
      socketBob.on('connect', onConn);
      socketEve.on('connect', onConn);
    });

    afterAll(() => {
      socketAlice.disconnect();
      socketBob.disconnect();
      socketEve.disconnect();
    });

    it('broadcasts task.created to team members when a task is created', async () => {
      let receivedByBob = null;
      let receivedByEve = false;

      socketBob.once('task.created', (data) => {
        receivedByBob = data.task;
      });

      socketEve.once('task.created', () => {
        receivedByEve = true;
      });

      const res = await request(server)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Real-Time Synchronized Task',
          description: 'Testing live websockets',
          assigneeId: userB.id,
        });

      expect(res.status).toBe(201);
      createdTaskId = res.body.task.id;

      // Allow brief moment for socket message propagation
      await new Promise(r => setTimeout(r, 200));

      expect(receivedByBob).not.toBeNull();
      expect(receivedByBob.id).toBe(createdTaskId);
      expect(receivedByBob.title).toBe('Real-Time Synchronized Task');
      expect(receivedByEve).toBe(false); // Isolated from Team B
    });

    it('broadcasts task.updated when task details are patched', async () => {
      let receivedUpdate = null;

      socketBob.once('task.updated', (data) => {
        receivedUpdate = data.task;
      });

      const res = await request(server)
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Real-Time Synchronized Task (Updated)',
        });

      expect(res.status).toBe(200);

      await new Promise(r => setTimeout(r, 200));

      expect(receivedUpdate).not.toBeNull();
      expect(receivedUpdate.title).toBe('Real-Time Synchronized Task (Updated)');
    });

    it('broadcasts task.assigned when assignee is modified', async () => {
      let receivedAssigned = null;

      socketBob.once('task.assigned', (data) => {
        receivedAssigned = data;
      });

      const res = await request(server)
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          assigneeId: userC.id,
        });

      expect(res.status).toBe(200);

      await new Promise(r => setTimeout(r, 200));

      expect(receivedAssigned).not.toBeNull();
      expect(receivedAssigned.task.assigneeId).toBe(userC.id);
    });

    it('broadcasts task.completed when status is set to done', async () => {
      let receivedCompleted = null;

      socketBob.once('task.completed', (data) => {
        receivedCompleted = data.task;
      });

      const res = await request(server)
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          status: 'done',
        });

      expect(res.status).toBe(200);

      await new Promise(r => setTimeout(r, 200));

      expect(receivedCompleted).not.toBeNull();
      expect(receivedCompleted.status).toBe('done');
    });

    it('broadcasts comment.created when a comment is added to a task', async () => {
      let receivedComment = null;

      socketBob.once('comment.created', (data) => {
        receivedComment = data;
      });

      const res = await request(server)
        .post(`/tasks/${createdTaskId}/comments`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          content: 'Live real-time comment from Alice!',
        });

      expect(res.status).toBe(201);

      await new Promise(r => setTimeout(r, 200));

      expect(receivedComment).not.toBeNull();
      expect(receivedComment.taskId).toBe(createdTaskId);
      expect(receivedComment.comment.content).toBe('Live real-time comment from Alice!');
    });

    it('broadcasts notification.created directly to the recipient user room', async () => {
      let receivedNotification = null;

      socketBob.once('notification.created', (data) => {
        receivedNotification = data.notification;
      });

      // User A assigns another task to User B
      await request(server)
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id)
        .send({
          title: 'Direct Notification Task',
          assigneeId: userB.id,
        });

      await new Promise(r => setTimeout(r, 200));

      expect(receivedNotification).not.toBeNull();
      expect(receivedNotification.userId).toBe(userB.id);
      expect(receivedNotification.type).toBe('task_assigned');
    });

    it('broadcasts task.deleted when task is deleted', async () => {
      let receivedDeleted = null;

      socketBob.once('task.deleted', (data) => {
        receivedDeleted = data;
      });

      const res = await request(server)
        .delete(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(204);

      await new Promise(r => setTimeout(r, 200));

      expect(receivedDeleted).not.toBeNull();
      expect(receivedDeleted.id).toBe(createdTaskId);
    });
  });
});
