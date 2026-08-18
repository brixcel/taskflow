require('dotenv').config();
const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { app } = require('../server');
const prisma = require('../prisma');
const { UPLOADS_DIR } = require('../middleware/upload');

describe('Phase 36 — Optimized File & Image Attachments with Pre-Upload Compression', () => {
  let userOwner, userMember, userOtherTeam;
  let tokenOwner, tokenMember, tokenOtherTeam;
  let teamA, teamB, taskTeamA, taskTeamB;
  let createdAttachmentId = null;
  let createdFilePath = null;

  // Test fixture files
  const testPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  const testPdfBuffer = Buffer.from('%PDF-1.4 ... test pdf content ... %%EOF');
  const dummyFilePath = path.join(__dirname, 'test-asset.png');
  const dummyPdfPath = path.join(__dirname, 'test-doc.pdf');

  beforeAll(async () => {
    fs.writeFileSync(dummyFilePath, testPngBuffer);
    fs.writeFileSync(dummyPdfPath, testPdfBuffer);

    // 1. Register Team A Owner
    const regOwner = await request(app)
      .post('/auth/register')
      .send({
        name: 'Design Lead',
        email: `design-lead-${Date.now()}@example.com`,
        password: 'Password123!',
        teamName: 'Creative Studio A',
      });
    userOwner = regOwner.body.user;
    tokenOwner = regOwner.body.token;

    const teamsA = await request(app)
      .get('/teams/me')
      .set('Authorization', `Bearer ${tokenOwner}`);
    teamA = teamsA.body.teams[0];

    // 2. Register Team A Member
    const regMember = await request(app)
      .post('/auth/register')
      .send({
        name: 'Freelance Designer',
        email: `freelance-designer-${Date.now()}@example.com`,
        password: 'Password123!',
        teamName: 'Temp Team',
      });
    userMember = regMember.body.user;
    tokenMember = regMember.body.token;

    // Join Team A as member
    await prisma.teamMembership.create({
      data: {
        userId: userMember.id,
        teamId: teamA.id,
        role: 'member',
      },
    });

    // 3. Register Team B User
    const regOther = await request(app)
      .post('/auth/register')
      .send({
        name: 'Competitor Lead',
        email: `competitor-${Date.now()}@example.com`,
        password: 'Password123!',
        teamName: 'Agency B',
      });
    userOtherTeam = regOther.body.user;
    tokenOtherTeam = regOther.body.token;

    const teamsB = await request(app)
      .get('/teams/me')
      .set('Authorization', `Bearer ${tokenOtherTeam}`);
    teamB = teamsB.body.teams[0];

    // Create Task in Team A
    taskTeamA = await prisma.task.create({
      data: {
        title: 'Brand Identity Mockups',
        teamId: teamA.id,
        createdById: userOwner.id,
      },
    });

    // Create Task in Team B
    taskTeamB = await prisma.task.create({
      data: {
        title: 'Confidential Strategy',
        teamId: teamB.id,
        createdById: userOtherTeam.id,
      },
    });
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);
      if (fs.existsSync(dummyPdfPath)) fs.unlinkSync(dummyPdfPath);
      if (taskTeamA) await prisma.task.deleteMany({ where: { id: { in: [taskTeamA.id, taskTeamB?.id] } } });
      if (teamA) await prisma.team.deleteMany({ where: { id: { in: [teamA.id, teamB?.id] } } });
      if (userOwner) await prisma.user.deleteMany({ where: { id: { in: [userOwner.id, userMember?.id, userOtherTeam?.id] } } });
      await prisma.$disconnect();
    } catch (_) {}
  });

  describe('1. File Upload & Compression Handling', () => {
    it('uploads single or multiple files to task and creates records in DB', async () => {
      const res = await request(app)
        .post(`/tasks/${taskTeamA.id}/attachments`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id)
        .attach('files', dummyFilePath, 'logo-v1.png')
        .attach('files', dummyPdfPath, 'brand-guidelines.pdf');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.attachments)).toBe(true);
      expect(res.body.attachments.length).toBe(2);

      const first = res.body.attachments[0];
      createdAttachmentId = first.id;
      createdFilePath = path.join(UPLOADS_DIR, first.storagePath);

      expect(first.taskId).toBe(taskTeamA.id);
      expect(first.teamId).toBe(teamA.id);
      expect(first.uploaderId).toBe(userOwner.id);
      expect(first.fileName).toBe('logo-v1.png');
      expect(first.mimeType).toBe('image/png');
      expect(fs.existsSync(createdFilePath)).toBe(true);
    });

    it('rejects uploads with unsupported file types', async () => {
      const dummyExePath = path.join(__dirname, 'malware.exe');
      fs.writeFileSync(dummyExePath, 'MZ...executable...');

      const res = await request(app)
        .post(`/tasks/${taskTeamA.id}/attachments`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id)
        .attach('files', dummyExePath, 'malware.exe');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unsupported file type');

      if (fs.existsSync(dummyExePath)) fs.unlinkSync(dummyExePath);
    });

    it('rejects upload when no files are provided', async () => {
      const res = await request(app)
        .post(`/tasks/${taskTeamA.id}/attachments`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(400);
    });
  });

  describe('2. Fetching & Previewing Attachments', () => {
    it('lists all attachments for a task with uploader details', async () => {
      const res = await request(app)
        .get(`/tasks/${taskTeamA.id}/attachments`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.attachments)).toBe(true);
      expect(res.body.attachments.length).toBeGreaterThanOrEqual(2);
      expect(res.body.attachments[0].uploader).toBeDefined();
      expect(res.body.attachments[0].uploader.name).toBe('Design Lead');
    });

    it('allows downloading attachment with proper Content-Disposition header', async () => {
      const res = await request(app)
        .get(`/attachments/${createdAttachmentId}/download`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain('logo-v1.png');
    });

    it('allows inline preview of attachments', async () => {
      const res = await request(app)
        .get(`/attachments/${createdAttachmentId}/preview`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
      expect(res.headers['content-disposition']).toContain('inline');
    });
  });

  describe('3. Multi-Tenant Isolation & RBAC Security', () => {
    it('prevents Team B users from uploading to Team A tasks', async () => {
      const res = await request(app)
        .post(`/tasks/${taskTeamA.id}/attachments`)
        .set('Authorization', `Bearer ${tokenOtherTeam}`)
        .set('X-Team-Id', teamB.id)
        .attach('files', dummyFilePath, 'intruder.png');

      expect(res.status).toBe(404);
    });

    it('prevents Team B users from viewing or downloading Team A attachments', async () => {
      const res = await request(app)
        .get(`/attachments/${createdAttachmentId}/download`)
        .set('Authorization', `Bearer ${tokenOtherTeam}`)
        .set('X-Team-Id', teamB.id);

      expect(res.status).toBe(404);
    });

    it('allows task owner/admin to delete attachment and removes physical file', async () => {
      const res = await request(app)
        .delete(`/tasks/${taskTeamA.id}/attachments/${createdAttachmentId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .set('X-Team-Id', teamA.id);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify DB removal
      const dbRecord = await prisma.taskAttachment.findUnique({
        where: { id: createdAttachmentId },
      });
      expect(dbRecord).toBeNull();

      // Verify disk cleanup
      expect(fs.existsSync(createdFilePath)).toBe(false);
    });
  });
});
