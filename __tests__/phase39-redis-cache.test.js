require('dotenv').config();
const request = require('supertest');
const { app } = require('../server');
const prisma = require('../prisma');
const { redis } = require('../config/redis');
const { getOrSet, invalidate, invalidateTeamCache, TTL } = require('../services/cache');

describe('Phase 39 — Backend Redis Caching & Cache-Aside Layer', () => {
  let userOwner, userMember;
  let tokenOwner, tokenMember;
  let team;

  beforeAll(async () => {
    // 1. Register Owner
    const regOwner = await request(app)
      .post('/auth/register')
      .send({
        name: 'Cache Lead',
        email: `cache-lead-${Date.now()}@example.com`,
        password: 'Password123!',
        teamName: 'High Performance Team',
      });

    userOwner = regOwner.body.user;
    tokenOwner = regOwner.body.token;

    const teamsRes = await request(app)
      .get('/teams/me')
      .set('Authorization', `Bearer ${tokenOwner}`);
    team = teamsRes.body.teams[0];

    // 2. Register Member candidate
    const regMember = await request(app)
      .post('/auth/register')
      .send({
        name: 'Cache Worker',
        email: `cache-worker-${Date.now()}@example.com`,
        password: 'Password123!',
        teamName: 'Temp Cache Team',
      });

    userMember = regMember.body.user;
    tokenMember = regMember.body.token;
  });

  afterAll(async () => {
    try {
      if (team) await prisma.team.deleteMany({ where: { id: team.id } });
      if (userOwner) await prisma.user.deleteMany({ where: { id: { in: [userOwner.id, userMember?.id] } } });
      await prisma.$disconnect();
    } catch (_) {}
  });

  describe('1. Cache-Aside Core Functionality (getOrSet)', () => {
    it('executes fetchFn on cache MISS, caches result, and returns cached value on consecutive calls', async () => {
      const testKey = `test:cache:aside:${Date.now()}`;
      let fetchCount = 0;

      const fetchFn = async () => {
        fetchCount++;
        return { data: 'computed-result', count: fetchCount };
      };

      // 1. First call: MISS -> runs fetchFn
      const res1 = await getOrSet(testKey, 60, fetchFn);
      expect(res1.data).toBe('computed-result');
      expect(fetchCount).toBe(1);

      // 2. Second call: HIT -> returns cached object without calling fetchFn
      const res2 = await getOrSet(testKey, 60, fetchFn);
      expect(res2.data).toBe('computed-result');
      expect(fetchCount).toBe(1); // fetchCount remained 1!

      // 3. Invalidate key
      await invalidate(testKey);

      // 4. Third call: MISS -> runs fetchFn again
      const res3 = await getOrSet(testKey, 60, fetchFn);
      expect(res3.data).toBe('computed-result');
      expect(fetchCount).toBe(2);
    });
  });

  describe('2. Team Members Cache & Invalidation', () => {
    it('caches team members list on GET /teams/:id/members and evicts cache when member is added', async () => {
      const cacheKey = `cache:team:${team.id}:members`;

      // 1. Fetch members (populates cache)
      const res1 = await request(app)
        .get(`/teams/${team.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`);
      expect(res1.status).toBe(200);
      expect(res1.body.members).toHaveLength(1);

      // Verify key exists in Redis
      const cached = await redis.get(cacheKey);
      expect(cached).not.toBeNull();
      expect(JSON.parse(cached)).toHaveLength(1);

      // 2. Add member to team (should invalidate cache)
      const addRes = await request(app)
        .post(`/teams/${team.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: userMember.id, role: 'member' });
      expect(addRes.status).toBe(201);

      // 3. Fetch members again (fresh read with 2 members)
      const res2 = await request(app)
        .get(`/teams/${team.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`);
      expect(res2.status).toBe(200);
      expect(res2.body.members).toHaveLength(2);
    });
  });

  describe('3. Project Tree Caching & Mutation Invalidation', () => {
    let createdProjectId;

    it('caches project listings on GET /projects and invalidates on project creation and update', async () => {
      const cacheKey = `cache:team:${team.id}:projects`;

      // 1. Initial list
      const list1 = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', team.id);
      expect(list1.status).toBe(200);
      const initialCount = list1.body.count;

      // Verify cached in Redis
      const cached = await redis.get(cacheKey);
      expect(cached).not.toBeNull();

      // 2. Create new project (triggers cache invalidation)
      const createRes = await request(app)
        .post('/projects')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', team.id)
        .send({
          name: 'Redis Accelerated Project',
          color: '#0070f3',
          icon: 'layers',
        });
      expect(createRes.status).toBe(201);
      createdProjectId = createRes.body.project.id;

      // 3. Fetch project list again (reflects new project)
      const list2 = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', team.id);
      expect(list2.status).toBe(200);
      expect(list2.body.count).toBe(initialCount + 1);

      // 4. Update project (triggers cache invalidation)
      const updateRes = await request(app)
        .patch(`/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', team.id)
        .send({ name: 'Renamed Project' });
      expect(updateRes.status).toBe(200);

      // 5. Fetch updated list
      const list3 = await request(app)
        .get('/projects')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', team.id);
      expect(list3.body.projects.find((p) => p.id === createdProjectId).name).toBe('Renamed Project');
    });
  });
});
