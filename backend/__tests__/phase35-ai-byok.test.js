require('dotenv').config();
const request = require('supertest');
const { app } = require('../server');
const prisma = require('../prisma');
const { encryptSecret, decryptSecret } = require('../services/encryption');
const { generateTaskFromPrompt, generateProjectPlan } = require('../services/ai');

describe('Phase 35 — AI Token Optimization, Universal Freelancer Agent & BYOK', () => {
  let userOwner, userMember, teamA, teamB, tokenOwner, tokenMember;

  beforeAll(async () => {
    // 1. Create Owner User
    const regOwner = await request(app)
      .post('/auth/register')
      .send({
        name: 'Agency Lead',
        email: `agency-lead-${Date.now()}@example.com`,
        password: 'Password123!',
        teamName: 'Creative Agency A',
      });
    userOwner = regOwner.body.user;
    tokenOwner = regOwner.body.token;

    // Fetch Team A
    const teamsRes = await request(app)
      .get('/teams/me')
      .set('Authorization', `Bearer ${tokenOwner}`);
    teamA = teamsRes.body.teams[0];

    // 2. Create Second Member User
    const regMember = await request(app)
      .post('/auth/register')
      .send({
        name: 'Freelancer Member',
        email: `freelance-member-${Date.now()}@example.com`,
        password: 'Password123!',
        teamName: 'Independent Team B',
      });
    userMember = regMember.body.user;
    tokenMember = regMember.body.token;

    const teamsResB = await request(app)
      .get('/teams/me')
      .set('Authorization', `Bearer ${tokenMember}`);
    teamB = teamsResB.body.teams[0];

    // Add Member to Team A as plain member
    await prisma.teamMembership.create({
      data: {
        userId: userMember.id,
        teamId: teamA.id,
        role: 'member',
      },
    });
  });

  afterAll(async () => {
    try {
      if (teamA) await prisma.team.deleteMany({ where: { id: { in: [teamA.id, teamB.id] } } });
      if (userOwner) await prisma.user.deleteMany({ where: { id: { in: [userOwner.id, userMember.id] } } });
      await prisma.$disconnect();
    } catch (_) {}
  });

  describe('1. AES-256-GCM Credential Encryption', () => {
    it('encrypts and decrypts API keys deterministically and securely', () => {
      const mockKey = 'AIzaSyTestApiKey1234567890abcdefghij';
      const encrypted = encryptSecret(mockKey);

      expect(typeof encrypted).toBe('string');
      expect(encrypted).toContain(':');
      expect(encrypted).not.toEqual(mockKey);

      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(mockKey);
    });

    it('returns null safely for corrupted or forged ciphertext', () => {
      expect(decryptSecret('invalid-cipher-text')).toBeNull();
      expect(decryptSecret(null)).toBeNull();
    });
  });

  describe('2. Team AI Settings & BYOK API Endpoints', () => {
    it('fetches initial AI settings with 0 usage and no custom key', async () => {
      const res = await request(app)
        .get(`/teams/${teamA.id}/ai-settings`)
        .set('Authorization', `Bearer ${tokenOwner}`);

      expect(res.status).toBe(200);
      expect(res.body.hasCustomKey).toBe(false);
      expect(res.body.monthlyLimit).toBe(20);
      expect(res.body.monthlyUsage).toBeGreaterThanOrEqual(0);
    });

    it('allows team owner to save custom Gemini API key', async () => {
      const res = await request(app)
        .put(`/teams/${teamA.id}/ai-settings`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          customGeminiKey: 'AIzaSyMockCustomKey9876543210',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hasCustomKey).toBe(true);

      // Verify encrypted state in database
      const dbTeam = await prisma.team.findUnique({
        where: { id: teamA.id },
      });
      expect(dbTeam.customGeminiKey).toBeDefined();
      expect(dbTeam.customGeminiKey).not.toContain('AIzaSyMockCustomKey');
      expect(decryptSecret(dbTeam.customGeminiKey)).toBe('AIzaSyMockCustomKey9876543210');
    });

    it('prevents plain members from updating custom API keys (RBAC enforcement)', async () => {
      const res = await request(app)
        .put(`/teams/${teamA.id}/ai-settings`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          customGeminiKey: 'AIzaSyHackerKey',
        });

      expect(res.status).toBe(403);
    });

    it('allows removing custom key to revert to default free tier', async () => {
      const res = await request(app)
        .put(`/teams/${teamA.id}/ai-settings`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          customGeminiKey: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.hasCustomKey).toBe(false);

      const dbTeam = await prisma.team.findUnique({
        where: { id: teamA.id },
      });
      expect(dbTeam.customGeminiKey).toBeNull();
    });
  });

  describe('3. Universal Multi-Industry Freelancer Agent', () => {
    it('generates structured design deliverables for creative freelancer prompts', async () => {
      const result = await generateTaskFromPrompt({
        prompt: 'Design coffee shop brand identity and vector logo package',
        teamId: teamA.id,
      });

      expect(result).toBeDefined();
      expect(result.title).toBeDefined();
      expect(result.priority).toBeDefined();
      expect(Array.isArray(result.labels)).toBe(true);
      expect(Array.isArray(result.suggestedSubtasks)).toBe(true);
      // Verify token conservation: subtasks capped at <= 3
      expect(result.suggestedSubtasks.length).toBeLessThanOrEqual(3);
    });

    it('generates marketing campaigns for content creator prompts', async () => {
      const result = await generateTaskFromPrompt({
        prompt: 'Draft 30-day social media content calendar and newsletter copy',
        teamId: teamA.id,
      });

      expect(result).toBeDefined();
      expect(result.title).toBeDefined();
      expect(result.suggestedSubtasks.length).toBeLessThanOrEqual(3);
    });

    it('generates technical implementation tasks for developer prompts', async () => {
      const result = await generateTaskFromPrompt({
        prompt: 'Implement OAuth2 login with Google and GitHub',
        teamId: teamA.id,
      });

      expect(result).toBeDefined();
      expect(result.priority).toBe('high');
      expect(result.suggestedSubtasks.length).toBeLessThanOrEqual(3);
    });
  });

  describe('4. Token-Efficient Project Planning', () => {
    it('generates concise project plans without bloated task counts', async () => {
      const plan = await generateProjectPlan({
        prompt: 'Design and launch freelance client website with brand guide',
        timeframeWeeks: 2,
        teamId: teamA.id,
      });

      expect(plan).toBeDefined();
      expect(plan.name).toBeDefined();
      expect(Array.isArray(plan.phases)).toBe(true);
      expect(Array.isArray(plan.tasks)).toBe(true);
      // Strict token limits: max 5 tasks total
      expect(plan.tasks.length).toBeLessThanOrEqual(5);
    });
  });

  describe('5. Team Isolation for BYOK Keys', () => {
    it('ensures Team A custom key is isolated from Team B', async () => {
      // Set key on Team A
      await request(app)
        .put(`/teams/${teamA.id}/ai-settings`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          customGeminiKey: 'AIzaSyTeamASecretKey',
        });

      // Verify Team B remains unset
      const resB = await request(app)
        .get(`/teams/${teamB.id}/ai-settings`)
        .set('Authorization', `Bearer ${tokenMember}`);

      expect(resB.body.hasCustomKey).toBe(false);
    });
  });
});
