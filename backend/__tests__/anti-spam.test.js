require('dotenv').config();
const request = require('supertest');
const { app } = require('../server');
const prisma = require('../prisma');

describe('Anti-Spam, Bot Protection & Charter Resilience', () => {
  beforeAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [
              'bot-test@example.com',
              'spammer@mailinator.com',
              'burner@tempmail.com',
            ],
          },
        },
      });
    } catch (_) {}
  });

  afterAll(async () => {
    try {
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [
              'bot-test@example.com',
              'spammer@mailinator.com',
              'burner@tempmail.com',
            ],
          },
        },
      });
      await prisma.$disconnect();
    } catch (_) {}
  });

  describe('1. Anti-Bot Honeypot Defense', () => {
    it('rejects automated bot registration when honeypot field is filled', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Spam Bot',
          email: 'bot-test@example.com',
          password: 'Password123!',
          hp_company_url: 'https://spam-link.ru',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('BOT_DETECTED');

      // Verify no user was created in the database
      const user = await prisma.user.findUnique({
        where: { email: 'bot-test@example.com' },
      });
      expect(user).toBeNull();
    });
  });

  describe('2. Disposable & Burner Email Defense', () => {
    it('rejects registration with mailinator.com email', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Burner User',
          email: 'spammer@mailinator.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('DISPOSABLE_EMAIL_REJECTED');
    });

    it('rejects registration with tempmail.com email', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Burner User 2',
          email: 'burner@tempmail.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('DISPOSABLE_EMAIL_REJECTED');
    });

    it('allows legitimate registration with valid email provider', async () => {
      const testHumanEmail = `human-${Date.now()}@example.com`;
      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Human User',
          email: testHumanEmail,
          password: 'Password123!',
          teamName: 'Human Team',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.token).toBeDefined();
    });
  });

  describe('3. Charter C18 — Correlation Request IDs', () => {
    it('attaches X-Request-Id header to HTTP responses', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(typeof res.headers['x-request-id']).toBe('string');
      expect(res.body.requestId).toBeDefined();
    });

    it('preserves incoming X-Request-Id header when provided by client/edge', async () => {
      const customId = 'custom-correlation-id-999';
      const res = await request(app)
        .get('/health')
        .set('X-Request-Id', customId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customId);
      expect(res.body.requestId).toBe(customId);
    });
  });

  describe('4. Charter C14 / C26 — AI Cost Firewall & Payload Validation', () => {
    it('rejects oversized prompt payloads with AI_PAYLOAD_TOO_LARGE before reaching AI model', async () => {
      const aiTestEmail = `ai-user-${Date.now()}@example.com`;
      const regRes = await request(app)
        .post('/auth/register')
        .send({
          name: 'AI Test User',
          email: aiTestEmail,
          password: 'Password123!',
          teamName: 'AI Test Team',
        });

      const token = regRes.body.token;
      const oversizedPrompt = 'a'.repeat(9000); // Exceeds 8,000 char threshold

      const res = await request(app)
        .post('/ai/generate-task')
        .set('Authorization', `Bearer ${token}`)
        .send({
          prompt: oversizedPrompt,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('AI_PAYLOAD_TOO_LARGE');
    });
  });

  describe('5. Cloudflare Turnstile CAPTCHA (Charter C12, C13)', () => {
    const { verifyTurnstileToken } = require('../services/turnstile');

    it('gracefully bypasses Turnstile verification in dev/test mode when secret key is unset', async () => {
      const originalSecret = process.env.TURNSTILE_SECRET_KEY;
      delete process.env.TURNSTILE_SECRET_KEY;

      const result = await verifyTurnstileToken('mock-dev-token');
      expect(result.success).toBe(true);
      expect(result.bypassed).toBe(true);

      if (originalSecret) process.env.TURNSTILE_SECRET_KEY = originalSecret;
    });

    it('fails Turnstile verification when secret is configured but token is missing', async () => {
      const originalSecret = process.env.TURNSTILE_SECRET_KEY;
      process.env.TURNSTILE_SECRET_KEY = '0x4AAAAAAAMockSecretKey';

      const result = await verifyTurnstileToken(null);
      expect(result.success).toBe(false);
      expect(result.errorCodes).toContain('missing-input-response');

      if (originalSecret) {
        process.env.TURNSTILE_SECRET_KEY = originalSecret;
      } else {
        delete process.env.TURNSTILE_SECRET_KEY;
      }
    });

    it('rejects registration request when Turnstile verification fails', async () => {
      const originalSecret = process.env.TURNSTILE_SECRET_KEY;
      process.env.TURNSTILE_SECRET_KEY = '0x4AAAAAAAMockSecretKey';

      const res = await request(app)
        .post('/auth/register')
        .send({
          name: 'Bot User',
          email: `bot-${Date.now()}@example.com`,
          password: 'Password123!',
          turnstileToken: '', // Empty token fails validation
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('TURNSTILE_FAILED');

      if (originalSecret) {
        process.env.TURNSTILE_SECRET_KEY = originalSecret;
      } else {
        delete process.env.TURNSTILE_SECRET_KEY;
      }
    });
  });
});
