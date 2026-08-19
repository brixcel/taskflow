const xss = require('xss');
const { GoogleGenAI } = require('@google/genai');
const prisma = require('../prisma');
const logger = require('../middleware/logger');
const { decryptSecret } = require('./encryption');
const {
  aiTaskGenerateResponse,
  aiProjectPlanResponse,
  aiProductivityInsightsResponse,
  aiSearchResponse,
} = require('../validation/schemas');
const { parseSearchQuery, buildPrismaWhereClause } = require('./searchParser');
const { recordAiRequest, recordAiTokens, recordAiError } = require('./metrics');

const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_GEMINI_TIMEOUT_MS = 10000;

function getGeminiModel() {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

function getGeminiTimeoutMs() {
  const customTimeout = parseInt(process.env.GEMINI_TIMEOUT_MS, 10);
  return Number.isFinite(customTimeout) && customTimeout > 0
    ? customTimeout
    : DEFAULT_GEMINI_TIMEOUT_MS;
}

/**
 * Resolves the active Gemini API Key for a team:
 * Uses custom encrypted BYOK key if configured, otherwise falls back to system key.
 */
async function resolveGeminiApiKey(teamId = null) {
  if (teamId) {
    try {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, customGeminiKey: true, aiMonthlyUsage: true, aiUsageResetAt: true },
      });

      if (team && team.customGeminiKey) {
        const decrypted = decryptSecret(team.customGeminiKey);
        if (decrypted && decrypted.trim().length > 0) {
          return { apiKey: decrypted.trim(), isCustomKey: true, teamId: team.id };
        }
      }
    } catch (_) {}
  }

  return { apiKey: process.env.GEMINI_API_KEY, isCustomKey: false, teamId };
}

function categorizeGeminiError(error) {
  if (!error) return 'UNKNOWN';
  if (error.name === 'MissingApiKeyError' || error.isMissingKey) {
    return 'MISSING_API_KEY';
  }
  if (error.name === 'TestEnvError') {
    return 'TEST_ENVIRONMENT';
  }

  const msg = (error.message || '').toLowerCase();
  const status = error.status || error.statusCode || error.code;

  if (
    status === 401 ||
    status === 403 ||
    msg.includes('api key') ||
    msg.includes('unauthenticated') ||
    msg.includes('permission denied')
  ) {
    return 'AUTHENTICATION_FAILED';
  }
  if (
    status === 429 ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted')
  ) {
    return 'RATE_LIMIT_EXCEEDED';
  }
  if (
    status === 503 ||
    status === 404 ||
    msg.includes('not found') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('is not supported') ||
    msg.includes('is no longer available')
  ) {
    return 'MODEL_UNAVAILABLE';
  }
  if (
    error.name === 'AbortError' ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('deadline exceeded')
  ) {
    return 'TIMEOUT';
  }
  if (msg.includes('json') || msg.includes('parse')) {
    return 'PARSE_ERROR';
  }
  if (error.name === 'ZodError') {
    return 'SCHEMA_VALIDATION_ERROR';
  }
  return 'UPSTREAM_ERROR';
}

function logGeminiDiagnostic({ feature, model, elapsedMs, error, fallbackReason }) {
  if (process.env.NODE_ENV === 'test' && error?.name === 'TestEnvError') {
    return;
  }

  const errorCategory = categorizeGeminiError(error);
  try {
    recordAiError({
      model: model || getGeminiModel(),
      feature: feature || 'unknown',
      errorType: errorCategory,
    });
  } catch (_) {}

  const sanitizedMessage = error?.message
    ? String(error.message)
        .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]')
        .slice(0, 300)
    : 'Unknown error';

  const diagnostic = {
    feature,
    model: model || getGeminiModel(),
    errorCategory,
    status: error?.status || error?.statusCode || null,
    errorName: error?.name || 'Error',
    errorMessage: sanitizedMessage,
    elapsedMs,
    fallbackReason: fallbackReason || errorCategory,
  };

  if (logger && typeof logger.warn === 'function') {
    logger.warn(diagnostic, `[Gemini AI] Fallback triggered for ${feature}: ${errorCategory}`);
  } else {
    console.warn(`[Gemini AI] Fallback triggered for ${feature}:`, diagnostic);
  }
}

function parseGeminiJsonResponse(responseText) {
  const text = (responseText || '').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    if (!cleaned) return {};
    return JSON.parse(cleaned);
  }
}

async function callGeminiGenerate({
  contents,
  systemInstruction = null,
  responseMimeType = 'application/json',
  timeoutMs = getGeminiTimeoutMs(),
  modelOverride = null,
  teamId = null,
  maxOutputTokens = 600,
}) {
  const { apiKey, isCustomKey } = await resolveGeminiApiKey(teamId);
  const isTestEnv = process.env.NODE_ENV === 'test';

  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.name = 'MissingApiKeyError';
    err.isMissingKey = true;
    throw err;
  }

  if (isTestEnv) {
    const err = new Error('Gemini API call bypassed in test environment');
    err.name = 'TestEnvError';
    throw err;
  }

  // Track monthly usage for teams on built-in free tier
  if (teamId && !isCustomKey) {
    try {
      await prisma.team.update({
        where: { id: teamId },
        data: { aiMonthlyUsage: { increment: 1 } },
      });
    } catch (_) {}
  }

  const model = modelOverride || getGeminiModel();
  const ai = new GoogleGenAI({ apiKey });

  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const timeoutErr = new Error(`Gemini request to model '${model}' timed out after ${timeoutMs}ms`);
      timeoutErr.name = 'AbortError';
      reject(timeoutErr);
    }, timeoutMs);
  });

  const requestConfig = {
    responseMimeType,
    maxOutputTokens,
  };
  if (systemInstruction) {
    requestConfig.systemInstruction = systemInstruction;
  }

  const requestPromise = ai.models.generateContent({
    model,
    contents,
    config: requestConfig,
  });

  try {
    const response = await Promise.race([requestPromise, timeoutPromise]);
    clearTimeout(timerId);
    const text = response.text?.trim() || '{}';
    try {
      const inputTokens = Math.max(1, Math.ceil(JSON.stringify(contents).length / 4));
      const outputTokens = Math.max(1, Math.ceil(text.length / 4));
      recordAiTokens({ model, feature: 'gemini_generate', inputTokens, outputTokens });
      recordAiRequest({
        model,
        feature: 'gemini_generate',
        status: 'success',
        keyType: isCustomKey ? 'byok' : 'system',
      });
    } catch (_) {}
    return text;
  } catch (err) {
    clearTimeout(timerId);
    throw err;
  }
}

/**
 * Sanitize prompt text to strip HTML/scripts and normalize whitespace
 */
function sanitizePrompt(rawPrompt) {
  if (!rawPrompt) return '';
  const cleaned = xss(String(rawPrompt).trim(), {
    whiteList: {},
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
  });
  return cleaned.replace(/\s+/g, ' ').slice(0, 1000);
}

/**
 * Deterministic fallback generator for offline development and testing
 */
function generateFallbackTask(prompt, project) {
  const pLower = prompt.toLowerCase();

  let title = prompt.slice(0, 150);
  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  let priority = 'medium';
  if (pLower.includes('urgent') || pLower.includes('asap') || pLower.includes('critical') || pLower.includes('blocker') || pLower.includes('emergency')) {
    priority = 'urgent';
  } else if (pLower.includes('high') || pLower.includes('priority') || pLower.includes('security') || pLower.includes('vulnerability') || pLower.includes('auth') || pLower.includes('oauth') || pLower.includes('deploy') || pLower.includes('cloud') || pLower.includes('aws')) {
    priority = 'high';
  } else if (pLower.includes('low') || pLower.includes('minor') || pLower.includes('chore') || pLower.includes('cleanup')) {
    priority = 'low';
  }

  let deadlineDays = 3;
  if (priority === 'urgent') deadlineDays = 1;
  else if (priority === 'high') deadlineDays = 2;
  else if (priority === 'low') deadlineDays = 7;

  let labels = [];
  let subtasks = [];
  let description = `### Objective\n${prompt}\n\n### Implementation Details\n- Review technical requirements and system architecture.\n- Execute implementation following SyncTask design guidelines.\n- Verify all features with automated unit & integration tests.`;

  if (pLower.includes('login') || pLower.includes('auth') || pLower.includes('oauth')) {
    if (!title.toLowerCase().includes('auth') && !title.toLowerCase().includes('login')) {
      title = 'Implement Authentication & OAuth Flow';
    }
    description = `### Objective\nProvide seamless and secure user authentication supporting OAuth and email credentials.\n\n### Scope\n- Secure password hashing & JWT token validation.\n- OAuth provider integration.\n- Error handling & rate limiting.`;
    labels = ['auth', 'frontend', 'security'];
    subtasks = [
      { title: 'Design responsive login view', order: 1000 },
      { title: 'Configure authentication providers & JWT', order: 2000 },
      { title: 'Add form validation & test verification', order: 3000 },
    ];
  } else if (pLower.includes('aws') || pLower.includes('deploy') || pLower.includes('cloud') || pLower.includes('docker') || pLower.includes('k8s')) {
    if (!title.toLowerCase().includes('deploy') && !title.toLowerCase().includes('cloud')) {
      title = 'Configure Cloud Infrastructure & Deployment';
    }
    description = `### Objective\nEstablish resilient deployment pipelines and cloud infrastructure for high availability.\n\n### Scope\n- Infrastructure as Code provisioning.\n- CI/CD automated pipeline build.\n- Monitoring and alert setup.`;
    labels = ['devops', 'infrastructure', 'cloud'];
    subtasks = [
      { title: 'Configure cloud resources & security groups', order: 1000 },
      { title: 'Provision containerized application services', order: 2000 },
      { title: 'Set up custom domain & verify health checks', order: 3000 },
    ];
  } else if (pLower.includes('database') || pLower.includes('postgres') || pLower.includes('sql') || pLower.includes('prisma') || pLower.includes('schema')) {
    if (!title.toLowerCase().includes('database') && !title.toLowerCase().includes('migration')) {
      title = 'Database Schema Design & Migration';
    }
    description = `### Objective\nDesign and execute scalable database schema updates with indexing and multi-tenant isolation.\n\n### Scope\n- Prisma schema model updates.\n- Migration testing against test database.\n- Query performance optimization.`;
    labels = ['database', 'backend', 'prisma'];
    subtasks = [
      { title: 'Define Prisma schema models and relationships', order: 1000 },
      { title: 'Apply database migration and generate client', order: 2000 },
      { title: 'Add database indices for optimized queries', order: 3000 },
    ];
  } else if (pLower.includes('bug') || pLower.includes('fix') || pLower.includes('error') || pLower.includes('crash')) {
    priority = 'urgent';
    deadlineDays = 1;
    labels = ['bug', 'fix'];
    subtasks = [
      { title: 'Reproduce and isolate root cause', order: 1000 },
      { title: 'Implement fix with edge-case guards', order: 2000 },
      { title: 'Add automated regression test', order: 3000 },
    ];
  } else if (pLower.includes('redesign') || /\bui\b/i.test(pLower) || /\bux\b/i.test(pLower) || pLower.includes('design') || pLower.includes('frontend')) {
    labels = ['ui', 'design', 'frontend'];
    subtasks = [
      { title: 'Create UI mockups and layout hierarchy', order: 1000 },
      { title: 'Implement component markup with CSS tokens', order: 2000 },
      { title: 'Verify responsive styling and interactions', order: 3000 },
    ];
  } else {
    labels = ['general'];
    subtasks = [
      { title: `Analyze requirements for ${title.slice(0, 50)}`, order: 1000 },
      { title: 'Implement core functionality', order: 2000 },
      { title: 'Review and verify deliverables', order: 3000 },
    ];
  }

  if (project && project.name) {
    labels.push(project.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20));
  }

  labels = Array.from(new Set(labels)).filter(Boolean).slice(0, 5);

  return {
    title: title.slice(0, 200),
    description,
    priority,
    suggestedDeadlineDays: deadlineDays,
    labels,
    suggestedSubtasks: subtasks,
  };
}

async function generateTaskFromPrompt({ prompt, project = null, currentContext = '', teamId = null }) {
  const cleanPrompt = sanitizePrompt(prompt);
  if (!cleanPrompt) {
    throw new Error('Prompt cannot be empty');
  }

  const model = getGeminiModel();
  const startTime = Date.now();

  try {
    const systemInstructions = `You are TaskFlow AI, the intelligent workspace agent for freelancers, designers, marketers, content creators, and engineering teams.
Your job is to take the user's task request and produce a concise, structured JSON task plan.

Output MUST be a valid JSON object matching this schema:
{
  "title": "Action-oriented title under 150 characters",
  "description": "Concise markdown description with Goal, Deliverables, and Next Steps",
  "priority": "low" | "medium" | "high" | "urgent",
  "suggestedDeadlineDays": integer between 1 and 30,
  "labels": ["1-3", "concise", "lowercase", "labels"],
  "suggestedSubtasks": [
    { "title": "Concise step 1", "order": 1000 },
    { "title": "Concise step 2", "order": 2000 },
    { "title": "Concise step 3", "order": 3000 }
  ]
}

Guidelines:
- Tailor language to the user's field (e.g. design assets, client revisions, content drafting, or technical implementation).
- Limit suggestedSubtasks to AT MOST 3 concise checklist items to conserve tokens.
- Output ONLY the raw JSON object with no preamble or codeblock formatting.`;

    let contextSnippet = '';
    if (project && project.name) {
      contextSnippet += `\nTarget Project: ${project.name} (${project.description || 'No description'})`;
    }
    if (currentContext) {
      contextSnippet += `\nAdditional Context: ${currentContext}`;
    }

    const fullPrompt = `${systemInstructions}\n${contextSnippet}\n\nUser Request: "${cleanPrompt}"`;

    const responseText = await callGeminiGenerate({
      contents: fullPrompt,
      teamId,
      maxOutputTokens: 500,
    });

    const parsedJson = parseGeminiJsonResponse(responseText);

    const deadlineDays = typeof parsedJson.suggestedDeadlineDays === 'number' && parsedJson.suggestedDeadlineDays > 0
      ? Math.min(parsedJson.suggestedDeadlineDays, 60)
      : 3;

    const dueDate = new Date();
    dueDate.setUTCDate(dueDate.getUTCDate() + deadlineDays);
    const suggestedDueDate = dueDate.toISOString().slice(0, 10);

    const validated = aiTaskGenerateResponse.parse({
      title: parsedJson.title || cleanPrompt.slice(0, 100),
      description: parsedJson.description || '',
      priority: parsedJson.priority || 'medium',
      suggestedDeadlineDays: deadlineDays,
      suggestedDueDate,
      labels: Array.isArray(parsedJson.labels) ? parsedJson.labels : [],
      suggestedSubtasks: Array.isArray(parsedJson.suggestedSubtasks) ? parsedJson.suggestedSubtasks : [],
    });

    try {
      recordAiTokens({
        model,
        feature: 'generateTaskFromPrompt',
        inputTokens: Math.max(10, Math.ceil(cleanPrompt.length / 4)),
        outputTokens: Math.max(20, Math.ceil(JSON.stringify(validated).length / 4)),
      });
      recordAiRequest({
        model,
        feature: 'generateTaskFromPrompt',
        status: 'success',
        keyType: teamId ? 'byok' : 'system',
        durationSeconds: (Date.now() - startTime) / 1000,
      });
    } catch (_) {}

    return validated;
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    logGeminiDiagnostic({
      feature: 'generateTaskFromPrompt',
      model,
      elapsedMs,
      error,
    });

    const rawResult = generateFallbackTask(cleanPrompt, project);
    const dueDate = new Date();
    dueDate.setUTCDate(dueDate.getUTCDate() + rawResult.suggestedDeadlineDays);
    const suggestedDueDate = dueDate.toISOString().slice(0, 10);

    const fallbackResult = aiTaskGenerateResponse.parse({
      ...rawResult,
      suggestedDueDate,
    });

    try {
      recordAiTokens({
        model,
        feature: 'generateTaskFromPrompt',
        inputTokens: Math.max(10, Math.ceil(cleanPrompt.length / 4)),
        outputTokens: Math.max(20, Math.ceil(JSON.stringify(fallbackResult).length / 4)),
      });
      recordAiRequest({
        model,
        feature: 'generateTaskFromPrompt',
        status: 'fallback',
        keyType: 'system',
        durationSeconds: (Date.now() - startTime) / 1000,
      });
    } catch (_) {}

    return fallbackResult;
  }
}

/**
 * Deterministic fallback breakdown generator for offline dev, testing, and fallback
 */
function generateFallbackBreakdown({ title = '', description = '', existingSubtasks = [] }) {
  const combined = `${title} ${description}`.toLowerCase();
  let subtasks = [];

  if (combined.includes('deploy') || combined.includes('aws') || combined.includes('cloud') || combined.includes('infrastructure')) {
    subtasks = [
      { title: 'Create cloud credentials and IAM permissions', estimatedMinutes: 20, order: 1000 },
      { title: 'Configure VPC, subnets, and security groups', estimatedMinutes: 30, order: 2000 },
      { title: 'Provision managed database & connection strings', estimatedMinutes: 25, order: 3000 },
      { title: 'Build and deploy backend API services', estimatedMinutes: 45, order: 4000 },
      { title: 'Deploy frontend static assets / CDN distribution', estimatedMinutes: 30, order: 5000 },
      { title: 'Configure custom domain, SSL certs, and DNS records', estimatedMinutes: 20, order: 6000 },
      { title: 'Set up application monitoring, health checks & alerts', estimatedMinutes: 25, order: 7000 },
      { title: 'Execute end-to-end deployment smoke tests', estimatedMinutes: 15, order: 8000 },
    ];
  } else if (combined.includes('auth') || combined.includes('oauth') || combined.includes('login') || combined.includes('signup')) {
    subtasks = [
      { title: 'Design responsive login and registration modal UI', estimatedMinutes: 30, order: 1000 },
      { title: 'Configure OAuth 2.0 client credentials (Google/GitHub)', estimatedMinutes: 25, order: 2000 },
      { title: 'Implement backend token generation and refresh handlers', estimatedMinutes: 40, order: 3000 },
      { title: 'Add client-side authentication state and persistence', estimatedMinutes: 30, order: 4000 },
      { title: 'Configure password reset token and verification email', estimatedMinutes: 35, order: 5000 },
      { title: 'Write integration and security edge-case unit tests', estimatedMinutes: 30, order: 6000 },
    ];
  } else if (combined.includes('database') || combined.includes('postgres') || combined.includes('migration') || combined.includes('schema')) {
    subtasks = [
      { title: 'Draft model relations and constraints in Prisma schema', estimatedMinutes: 20, order: 1000 },
      { title: 'Generate Prisma migration and verify SQL DDL scripts', estimatedMinutes: 25, order: 2000 },
      { title: 'Add composite indexes for high-frequency queries', estimatedMinutes: 20, order: 3000 },
      { title: 'Update data access repositories and validation schemas', estimatedMinutes: 35, order: 4000 },
      { title: 'Verify database migration and rollbacks in test environment', estimatedMinutes: 20, order: 5000 },
    ];
  } else if (combined.includes('social') || combined.includes('content') || combined.includes('campaign') || combined.includes('instagram') || combined.includes('tiktok') || combined.includes('marketing')) {
    subtasks = [
      { title: 'Draft content calendar and key messaging themes', estimatedMinutes: 30, order: 1000 },
      { title: 'Design high-resolution visual graphics and thumbnails', estimatedMinutes: 45, order: 2000 },
      { title: 'Write engaging copy, captions, and call-to-actions', estimatedMinutes: 30, order: 3000 },
      { title: 'Review and get client approval on creative assets', estimatedMinutes: 20, order: 4000 },
      { title: 'Schedule posts across designated social channels', estimatedMinutes: 20, order: 5000 },
      { title: 'Monitor engagement metrics and reply to audience comments', estimatedMinutes: 25, order: 6000 },
    ];
  } else if (combined.includes('redesign') || combined.includes('design system') || /\bui\b/i.test(combined) || /\bux\b/i.test(combined) || combined.includes('figma')) {
    subtasks = [
      { title: 'Review Figma wireframes and component token palette', estimatedMinutes: 25, order: 1000 },
      { title: 'Create reusable UI component structure & primitives', estimatedMinutes: 40, order: 2000 },
      { title: 'Implement CSS variables for dark and light modes', estimatedMinutes: 30, order: 3000 },
      { title: 'Add micro-animations, hover transitions, and active states', estimatedMinutes: 25, order: 4000 },
      { title: 'Perform accessibility audit (ARIA roles, contrast ratio)', estimatedMinutes: 20, order: 5000 },
      { title: 'Test responsive breakpoints on mobile and tablet screens', estimatedMinutes: 20, order: 6000 },
    ];
  } else if (combined.includes('bug') || combined.includes('crash') || combined.includes('fix') || combined.includes('error')) {
    subtasks = [
      { title: 'Reproduce issue in isolated development environment', estimatedMinutes: 20, order: 1000 },
      { title: 'Analyze stack trace and isolate root cause in code', estimatedMinutes: 30, order: 2000 },
      { title: 'Implement defensive fix and handle edge-case null checks', estimatedMinutes: 25, order: 3000 },
      { title: 'Write regression test covering the failure scenario', estimatedMinutes: 25, order: 4000 },
      { title: 'Verify fix in staging and prepare release changelog', estimatedMinutes: 15, order: 5000 },
    ];
  } else if (combined.includes('api') || combined.includes('endpoint') || combined.includes('rest') || combined.includes('graphql')) {
    subtasks = [
      { title: 'Define route contract, query parameters, and Zod schema', estimatedMinutes: 20, order: 1000 },
      { title: 'Implement route handler with tenant isolation checks', estimatedMinutes: 35, order: 2000 },
      { title: 'Add rate limiting and input sanitization middleware', estimatedMinutes: 20, order: 3000 },
      { title: 'Integrate real-time notification / WebSocket events', estimatedMinutes: 25, order: 4000 },
      { title: 'Write Supertest integration tests and documentation', estimatedMinutes: 30, order: 5000 },
    ];
  } else {
    const cleanTitle = title.trim() || 'Task';
    subtasks = [
      { title: `Analyze technical requirements for "${cleanTitle.slice(0, 40)}"`, estimatedMinutes: 20, order: 1000 },
      { title: 'Prepare design specifications and architectural plan', estimatedMinutes: 30, order: 2000 },
      { title: 'Implement core functionality and data models', estimatedMinutes: 45, order: 3000 },
      { title: 'Add error handling, loading states, and edge-case guards', estimatedMinutes: 30, order: 4000 },
      { title: 'Perform automated test verification and code review', estimatedMinutes: 25, order: 5000 },
    ];
  }

  const existingTitles = new Set(existingSubtasks.map(s => (s.title || '').toLowerCase().trim()));
  const filtered = subtasks.filter(s => !existingTitles.has(s.title.toLowerCase().trim()));
  return filtered.length > 0 ? filtered : subtasks;
}

/**
 * Breakdown an existing or new task into actionable subtasks with Gemini AI or intelligent fallback
 */
async function breakdownTaskIntoSubtasks({ title = '', description = '', existingSubtasks = [], projectContext = null }) {
  const cleanTitle = sanitizePrompt(title);
  const cleanDesc = sanitizePrompt(description);

  if (!cleanTitle && !cleanDesc) {
    throw new Error('Task title or description is required for AI breakdown');
  }

  const model = getGeminiModel();
  const startTime = Date.now();

  try {
    const systemPrompt = `You are ST AI, an expert technical lead and project manager inside SyncTask 2.0.
Your task is to break down a parent task into 4 to 8 sequential, concrete, highly actionable subtasks.

Output MUST be a valid JSON object matching this schema:
{
  "subtasks": [
    {
      "title": "Action-oriented subtask title (imperative verb, under 100 characters)",
      "estimatedMinutes": 30,
      "order": 1000
    }
  ]
}

Guidelines:
- Each subtask must begin with an action verb (e.g., "Configure...", "Implement...", "Design...", "Test...", "Draft...").
- Keep subtasks bite-sized (15 to 60 minutes).
- Order subtasks logically from start to finish (incremental order 1000, 2000, 3000...).
- Do NOT repeat any existing subtasks.
- Do NOT output markdown formatting, backticks, or text other than the JSON object.`;

    let contextText = `Task Title: "${cleanTitle}"\nTask Description: "${cleanDesc || 'None'}"`;
    if (projectContext && projectContext.name) {
      contextText += `\nProject: ${projectContext.name}`;
    }
    if (Array.isArray(existingSubtasks) && existingSubtasks.length > 0) {
      contextText += `\nExisting Subtasks:\n${existingSubtasks.map(s => `- ${s.title}`).join('\n')}`;
    }

    const fullPrompt = `${systemPrompt}\n\n${contextText}`;

    const responseText = await callGeminiGenerate({
      contents: fullPrompt,
    });

    const parsedJson = parseGeminiJsonResponse(responseText);

    if (!parsedJson.subtasks || !Array.isArray(parsedJson.subtasks) || parsedJson.subtasks.length === 0) {
      throw new Error('Invalid subtasks format returned by AI');
    }

    const subtasks = parsedJson.subtasks.map((st, idx) => ({
      title: sanitizePrompt(st.title || `Step ${idx + 1}`).slice(0, 200),
      estimatedMinutes: typeof st.estimatedMinutes === 'number' && st.estimatedMinutes > 0 ? Math.min(st.estimatedMinutes, 480) : 30,
      order: typeof st.order === 'number' ? st.order : (idx + 1) * 1000,
    })).filter(st => st.title.length > 0);

    try {
      recordAiTokens({
        model,
        feature: 'breakdownTaskIntoSubtasks',
        inputTokens: Math.max(10, Math.ceil(cleanTitle.length / 4)),
        outputTokens: Math.max(20, Math.ceil(JSON.stringify(subtasks).length / 4)),
      });
      recordAiRequest({
        model,
        feature: 'breakdownTaskIntoSubtasks',
        status: 'success',
        keyType: 'system',
        durationSeconds: (Date.now() - startTime) / 1000,
      });
    } catch (_) {}

    return { subtasks };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    logGeminiDiagnostic({
      feature: 'breakdownTaskIntoSubtasks',
      model,
      elapsedMs,
      error: err,
    });

    const fallbackList = generateFallbackBreakdown({
      title: cleanTitle,
      description: cleanDesc,
      existingSubtasks,
    });

    try {
      recordAiTokens({
        model,
        feature: 'breakdownTaskIntoSubtasks',
        inputTokens: Math.max(10, Math.ceil(cleanTitle.length / 4)),
        outputTokens: Math.max(20, Math.ceil(JSON.stringify(fallbackList).length / 4)),
      });
      recordAiRequest({
        model,
        feature: 'breakdownTaskIntoSubtasks',
        status: 'fallback',
        keyType: 'system',
        durationSeconds: (Date.now() - startTime) / 1000,
      });
    } catch (_) {}

    return { subtasks: fallbackList };
  }
}

/**
  * Deterministic fallback generator for AI Project Planner (Phase 28)
  */
function generateFallbackProjectPlan(rawPrompt, timeframeWeeks = 4) {
  const prompt = sanitizePrompt(rawPrompt);
  const pLower = prompt.toLowerCase();
  const weeks = Math.max(1, Math.min(Number(timeframeWeeks) || 4, 52));
  const totalDays = weeks * 7;

  const day1 = Math.max(1, Math.round(totalDays * 0.15));
  const day2 = Math.max(day1 + 1, Math.round(totalDays * 0.35));
  const day3 = Math.max(day2 + 1, Math.round(totalDays * 0.65));
  const day4 = Math.max(day3 + 1, Math.round(totalDays * 0.85));
  const day5 = totalDays;

  const defaultPhases = ['Planning', 'UI/UX', 'Development', 'Testing', 'Deployment'];

  let plan = null;

  if (pLower.includes('e-commerce') || pLower.includes('ecommerce') || pLower.includes('shop') || pLower.includes('store') || pLower.includes('marketplace')) {
    plan = {
      name: 'E-Commerce Platform Launch',
      description: `### Project Blueprint\nEnd-to-end launch of a scalable e-commerce store with product catalog, cart, Stripe payment checkout, customer accounts, and order management.\n\n### Target Timeframe\n${weeks} weeks (${totalDays} days)`,
      icon: '🛒',
      color: '#10b981',
      targetDays: totalDays,
      phases: defaultPhases,
      tasks: [
        {
          title: 'Define e-commerce requirements and purchase flows',
          description: 'Establish functional requirements for product browsing, cart persistence, coupon codes, and shipping calculations.',
          phase: 'Planning',
          priority: 'high',
          suggestedDeadlineOffsetDays: day1,
          labels: ['planning', 'requirements', 'e-commerce'],
          subtasks: [
            { title: 'Draft user stories for buyer and seller journeys', estimatedMinutes: 45, order: 1000 },
            { title: 'Define product catalog schema and inventory models', estimatedMinutes: 30, order: 2000 },
            { title: 'Determine payment gateway and currency requirements', estimatedMinutes: 30, order: 3000 },
          ],
        },
        {
          title: 'Design storefront & checkout UI wireframes',
          description: 'Create responsive UI mockups and component hierarchy for product catalog, cart drawer, and single-page checkout.',
          phase: 'UI/UX',
          priority: 'medium',
          suggestedDeadlineOffsetDays: day2,
          labels: ['design', 'ui', 'figma'],
          subtasks: [
            { title: 'Design product grid, search filters, and detail view', estimatedMinutes: 60, order: 1000 },
            { title: 'Build interactive shopping cart and checkout mockups', estimatedMinutes: 45, order: 2000 },
            { title: 'Audit mobile touch targets and accessibility contrast', estimatedMinutes: 30, order: 3000 },
          ],
        },
        {
          title: 'Implement product catalog, inventory API, and cart state',
          description: 'Build backend API endpoints for product CRUD, category tagging, search indexing, and cart session management.',
          phase: 'Development',
          priority: 'urgent',
          suggestedDeadlineOffsetDays: day3,
          labels: ['backend', 'api', 'cart'],
          subtasks: [
            { title: 'Implement product listing endpoint with pagination & filters', estimatedMinutes: 60, order: 1000 },
            { title: 'Build client cart state management with persistent storage', estimatedMinutes: 45, order: 2000 },
            { title: 'Integrate Stripe Payment Intents API & webhook listener', estimatedMinutes: 90, order: 3000 },
          ],
        },
        {
          title: 'Execute end-to-end checkout & payment test suite',
          description: 'Verify payment flows with test cards, edge-case network errors, coupon validation, and invoice generation.',
          phase: 'Testing',
          priority: 'high',
          suggestedDeadlineOffsetDays: day4,
          labels: ['qa', 'testing', 'payments'],
          subtasks: [
            { title: 'Run automated end-to-end checkout test suite', estimatedMinutes: 45, order: 1000 },
            { title: 'Verify webhook idempotency and payment error handling', estimatedMinutes: 30, order: 2000 },
            { title: 'Conduct cross-browser and mobile device verification', estimatedMinutes: 45, order: 3000 },
          ],
        },
        {
          title: 'Configure production hosting, SSL certificates & launch',
          description: 'Provision cloud infrastructure, domain DNS, CDN caching, SSL certificates, and execute launch checklist.',
          phase: 'Deployment',
          priority: 'urgent',
          suggestedDeadlineOffsetDays: day5,
          labels: ['devops', 'deployment', 'launch'],
          subtasks: [
            { title: 'Configure production database and environment secrets', estimatedMinutes: 30, order: 1000 },
            { title: 'Set up CDN asset caching and SSL certificate', estimatedMinutes: 20, order: 2000 },
            { title: 'Run production sanity smoke test and monitor logs', estimatedMinutes: 30, order: 3000 },
          ],
        },
      ],
    };
  } else if (pLower.includes('mobile') || pLower.includes('ios') || pLower.includes('android') || pLower.includes('react native') || pLower.includes('flutter') || pLower.includes('app')) {
    plan = {
      name: 'Mobile App MVP Launch',
      description: `### Project Blueprint\nDesign, develop, and publish a native cross-platform mobile application MVP with offline data caching, push notifications, and App Store readiness.\n\n### Target Timeframe\n${weeks} weeks (${totalDays} days)`,
      icon: '📱',
      color: '#3b82f6',
      targetDays: totalDays,
      phases: defaultPhases,
      tasks: [
        {
          title: 'Define mobile MVP scope and technical stack',
          description: 'Establish core feature boundaries, target OS versions, backend API contracts, and analytics requirements.',
          phase: 'Planning',
          priority: 'high',
          suggestedDeadlineOffsetDays: day1,
          labels: ['planning', 'mobile', 'mvp'],
          subtasks: [
            { title: 'Map user onboarding and core interactive loops', estimatedMinutes: 40, order: 1000 },
            { title: 'Define REST/GraphQL API contracts for mobile clients', estimatedMinutes: 35, order: 2000 },
          ],
        },
        {
          title: 'Create mobile UI/UX designs and native navigation flows',
          description: 'Produce high-fidelity Figma screens with bottom tab navigation, gesture interactions, and light/dark themes.',
          phase: 'UI/UX',
          priority: 'medium',
          suggestedDeadlineOffsetDays: day2,
          labels: ['design', 'ui', 'figma'],
          subtasks: [
            { title: 'Design onboarding carousel and authentication screens', estimatedMinutes: 45, order: 1000 },
            { title: 'Design primary dashboard and detail view layouts', estimatedMinutes: 60, order: 2000 },
          ],
        },
        {
          title: 'Build core application views and offline sync engine',
          description: 'Develop frontend screens, local SQLite/AsyncStorage persistence, and authenticated API communication.',
          phase: 'Development',
          priority: 'urgent',
          suggestedDeadlineOffsetDays: day3,
          labels: ['frontend', 'mobile', 'react-native'],
          subtasks: [
            { title: 'Set up app navigation structure and theme context', estimatedMinutes: 45, order: 1000 },
            { title: 'Implement local caching and offline-first state sync', estimatedMinutes: 60, order: 2000 },
            { title: 'Integrate push notification service (FCM/APNs)', estimatedMinutes: 45, order: 3000 },
          ],
        },
        {
          title: 'Conduct device matrix testing and beta flighting',
          description: 'Run integration tests on physical iOS and Android devices, measure frame rates, and distribute TestFlight beta.',
          phase: 'Testing',
          priority: 'high',
          suggestedDeadlineOffsetDays: day4,
          labels: ['qa', 'testing', 'beta'],
          subtasks: [
            { title: 'Test on iOS and Android screen resolutions', estimatedMinutes: 40, order: 1000 },
            { title: 'Deploy internal beta build via TestFlight / Play Console', estimatedMinutes: 35, order: 2000 },
          ],
        },
        {
          title: 'App Store & Google Play Store submission',
          description: 'Prepare store listing metadata, screenshots, privacy policy URLs, and submit app for store review.',
          phase: 'Deployment',
          priority: 'urgent',
          suggestedDeadlineOffsetDays: day5,
          labels: ['devops', 'release', 'appstore'],
          subtasks: [
            { title: 'Generate signed release binaries (AAB/IPA)', estimatedMinutes: 30, order: 1000 },
            { title: 'Upload screenshots, description, and privacy questionnaire', estimatedMinutes: 30, order: 2000 },
          ],
        },
      ],
    };
  } else if (pLower.includes('cloud') || pLower.includes('aws') || pLower.includes('devops') || pLower.includes('docker') || pLower.includes('kubernetes') || pLower.includes('migration') || pLower.includes('infrastructure')) {
    plan = {
      name: 'Cloud Infrastructure & DevOps Pipeline',
      description: `### Project Blueprint\nEstablish highly available containerized cloud infrastructure with automated CI/CD pipelines, monitoring, and zero-downtime deployment.\n\n### Target Timeframe\n${weeks} weeks (${totalDays} days)`,
      icon: '☁️',
      color: '#8b5cf6',
      targetDays: totalDays,
      phases: defaultPhases,
      tasks: [
        {
          title: 'Audit system architecture and cloud cost budget',
          description: 'Define VPC topology, security boundaries, container sizing, and SLA availability objectives.',
          phase: 'Planning',
          priority: 'high',
          suggestedDeadlineOffsetDays: day1,
          labels: ['architecture', 'cloud', 'security'],
          subtasks: [
            { title: 'Map VPC network subnets, NAT gateways, and routing', estimatedMinutes: 35, order: 1000 },
            { title: 'Define IAM least-privilege security roles', estimatedMinutes: 30, order: 2000 },
          ],
        },
        {
          title: 'Design Infrastructure-as-Code (IaC) blueprints',
          description: 'Draft Terraform or Pulumi templates for compute clusters, managed databases, load balancers, and DNS.',
          phase: 'UI/UX',
          priority: 'medium',
          suggestedDeadlineOffsetDays: day2,
          labels: ['iac', 'terraform', 'design'],
          subtasks: [
            { title: 'Create modular Terraform manifests for cloud resources', estimatedMinutes: 50, order: 1000 },
            { title: 'Define automated backup and disaster recovery plan', estimatedMinutes: 30, order: 2000 },
          ],
        },
        {
          title: 'Implement container orchestration & CI/CD pipeline',
          description: 'Build Docker container images, deploy Kubernetes or container services, and configure GitHub Actions pipelines.',
          phase: 'Development',
          priority: 'urgent',
          suggestedDeadlineOffsetDays: day3,
          labels: ['devops', 'docker', 'cicd'],
          subtasks: [
            { title: 'Optimize multi-stage Docker build files', estimatedMinutes: 35, order: 1000 },
            { title: 'Configure automated test & build GitHub Actions workflows', estimatedMinutes: 45, order: 2000 },
            { title: 'Configure TLS certificate auto-renewal and reverse proxy', estimatedMinutes: 30, order: 3000 },
          ],
        },
        {
          title: 'Execute load testing, failover drills & security audits',
          description: 'Simulate high traffic loads, chaos failover tests, penetration vulnerability scans, and latency benchmarks.',
          phase: 'Testing',
          priority: 'high',
          suggestedDeadlineOffsetDays: day4,
          labels: ['qa', 'security', 'loadtesting'],
          subtasks: [
            { title: 'Run k6 load test simulating peak traffic concurrency', estimatedMinutes: 45, order: 1000 },
            { title: 'Perform automated container image CVE vulnerability scan', estimatedMinutes: 30, order: 2000 },
          ],
        },
        {
          title: 'Production cutover and observability activation',
          description: 'Switch live DNS records, activate Prometheus/Grafana metrics, configure alert triggers, and verify uptime.',
          phase: 'Deployment',
          priority: 'urgent',
          suggestedDeadlineOffsetDays: day5,
          labels: ['deployment', 'observability', 'production'],
          subtasks: [
            { title: 'Switch DNS records to production load balancer', estimatedMinutes: 20, order: 1000 },
            { title: 'Verify metrics dashboard and alert routing', estimatedMinutes: 25, order: 2000 },
          ],
        },
      ],
    };
  } else {
    let cleanTitle = prompt.replace(/[^\w\s-]/g, '').trim();
    if (cleanTitle.length > 50) cleanTitle = cleanTitle.slice(0, 50) + '...';
    if (!cleanTitle) cleanTitle = 'New Initiative';
    cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

    plan = {
      name: `${cleanTitle} Roadmap`,
      description: `### Project Blueprint\nComprehensive execution roadmap for "${prompt}". Formulated with structured milestones, iterative phases, and verification quality gates.\n\n### Target Timeframe\n${weeks} weeks (${totalDays} days)`,
      icon: '🚀',
      color: '#6366f1',
      targetDays: totalDays,
      phases: defaultPhases,
      tasks: [
        {
          title: `Project scoping and requirements definition for ${cleanTitle}`,
          description: 'Document core objectives, deliverable milestones, resource allocation, and success criteria.',
          phase: 'Planning',
          priority: 'high',
          suggestedDeadlineOffsetDays: day1,
          labels: ['planning', 'strategy'],
          subtasks: [
            { title: 'Align stakeholders on scope and deliverables', estimatedMinutes: 30, order: 1000 },
            { title: 'Define project milestone dates and dependencies', estimatedMinutes: 30, order: 2000 },
          ],
        },
        {
          title: 'Design architecture specifications and UI/UX flows',
          description: 'Draft structural schematics, interactive user journeys, and component specifications.',
          phase: 'UI/UX',
          priority: 'medium',
          suggestedDeadlineOffsetDays: day2,
          labels: ['design', 'specification'],
          subtasks: [
            { title: 'Create UI wireframes and user interaction flows', estimatedMinutes: 45, order: 1000 },
            { title: 'Review and iterate design based on team feedback', estimatedMinutes: 30, order: 2000 },
          ],
        },
        {
          title: 'Implement core functionality and feature integration',
          description: 'Execute implementation of foundational modules, services, and integration points.',
          phase: 'Development',
          priority: 'urgent',
          suggestedDeadlineOffsetDays: day3,
          labels: ['development', 'core'],
          subtasks: [
            { title: 'Build core business logic and database models', estimatedMinutes: 60, order: 1000 },
            { title: 'Implement frontend interface and state connectivity', estimatedMinutes: 60, order: 2000 },
            { title: 'Add error handling, loading states, and edge-case guards', estimatedMinutes: 40, order: 3000 },
          ],
        },
        {
          title: 'Conduct thorough QA testing and peer code reviews',
          description: 'Perform automated test verification, manual exploratory testing, and performance profiling.',
          phase: 'Testing',
          priority: 'high',
          suggestedDeadlineOffsetDays: day4,
          labels: ['qa', 'testing'],
          subtasks: [
            { title: 'Write unit and integration tests covering key paths', estimatedMinutes: 45, order: 1000 },
            { title: 'Execute regression and edge-case testing', estimatedMinutes: 35, order: 2000 },
          ],
        },
        {
          title: 'Production release, documentation & launch sign-off',
          description: 'Deploy to production environment, verify operational health, publish documentation, and celebrate launch.',
          phase: 'Deployment',
          priority: 'urgent',
          suggestedDeadlineOffsetDays: day5,
          labels: ['deployment', 'release'],
          subtasks: [
            { title: 'Execute production deployment and verify smoke tests', estimatedMinutes: 30, order: 1000 },
            { title: 'Publish project documentation and release notes', estimatedMinutes: 25, order: 2000 },
          ],
        },
      ],
    };
  }

  return plan;
}

/**
 * Generate a complete project hierarchy and roadmap using Gemini AI or deterministic fallback
 */
async function generateProjectPlan({ prompt, timeframeWeeks = 4, teamContext = null, teamId = null }) {
  const cleanPrompt = sanitizePrompt(prompt);
  if (!cleanPrompt) {
    throw new Error('Prompt cannot be empty');
  }

  const weeks = Math.max(1, Math.min(Number(timeframeWeeks) || 4, 52));
  const model = getGeminiModel();
  const startTime = Date.now();

  try {
    const systemPrompt = `You are TaskFlow AI, the intelligent project director for freelancers, design agencies, marketers, and engineering teams.
Your task is to decompose the project goal into a concise, professional roadmap.

Output MUST be a valid JSON object matching this schema:
{
  "name": "Concise project title (under 80 characters)",
  "description": "Clear markdown summary of Objective, Scope, and Key Deliverables",
  "icon": "Representative emoji (e.g. 🎨, 🚀, 📱, 🛒, 📢, 💼, ⚡)",
  "color": "Hex color code (#6366f1, #10b981, #3b82f6, #8b5cf6, #f59e0b, #ec4899)",
  "targetDays": ${weeks * 7},
  "phases": ["Phase 1 Name", "Phase 2 Name", "Phase 3 Name"],
  "tasks": [
    {
      "title": "Action-oriented task title",
      "description": "Clear explanation of deliverable",
      "phase": "Matching one of the phases above",
      "priority": "low" | "medium" | "high" | "urgent",
      "suggestedDeadlineOffsetDays": integer day offset between 1 and ${weeks * 7},
      "labels": ["1-3", "lowercase", "tags"],
      "subtasks": [
        {
          "title": "Concise checklist item",
          "estimatedMinutes": 30,
          "order": 1000
        }
      ]
    }
  ]
}

Guidelines:
- Generate 3 to 5 high-impact tasks across 2 to 4 phases (e.g. Discovery/Planning, Production/Design, Review/Launch).
- Adapt vocabulary to the user's domain (freelance client deliverables, design revisions, content calendar, or software implementation).
- Limit subtasks to 1 to 3 items per task to conserve output tokens.
- Output ONLY the raw JSON object without markdown codeblocks or filler text.`;

    let contextSnippet = `Target Timeframe: ${weeks} weeks (${weeks * 7} days)\nUser Project Request: "${cleanPrompt}"`;
    if (teamContext && teamContext.name) {
      contextSnippet += `\nOrganization/Team: ${teamContext.name}`;
    }

    const fullPrompt = `${systemPrompt}\n\n${contextSnippet}`;

    const responseText = await callGeminiGenerate({
      contents: fullPrompt,
      teamId,
      maxOutputTokens: 1000,
    });

    const parsedJson = parseGeminiJsonResponse(responseText);

    const validated = aiProjectPlanResponse.parse({
      name: parsedJson.name || cleanPrompt.slice(0, 50),
      description: parsedJson.description || '',
      icon: parsedJson.icon || '🚀',
      color: parsedJson.color || '#6366f1',
      targetDays: typeof parsedJson.targetDays === 'number' ? parsedJson.targetDays : weeks * 7,
      phases: Array.isArray(parsedJson.phases) && parsedJson.phases.length > 0 ? parsedJson.phases : ['Planning', 'UI/UX', 'Development', 'Testing', 'Deployment'],
      tasks: Array.isArray(parsedJson.tasks) ? parsedJson.tasks : [],
    });

    try {
      recordAiTokens({
        model,
        feature: 'generateProjectPlan',
        inputTokens: Math.max(10, Math.ceil(cleanPrompt.length / 4)),
        outputTokens: Math.max(50, Math.ceil(JSON.stringify(validated).length / 4)),
      });
      recordAiRequest({
        model,
        feature: 'generateProjectPlan',
        status: 'success',
        keyType: teamId ? 'byok' : 'system',
        durationSeconds: (Date.now() - startTime) / 1000,
      });
    } catch (_) {}

    return validated;
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    logGeminiDiagnostic({
      feature: 'generateProjectPlan',
      model,
      elapsedMs,
      error: err,
    });

    const rawResult = generateFallbackProjectPlan(cleanPrompt, weeks);
    const fallbackResult = aiProjectPlanResponse.parse(rawResult);

    try {
      recordAiTokens({
        model,
        feature: 'generateProjectPlan',
        inputTokens: Math.max(10, Math.ceil(cleanPrompt.length / 4)),
        outputTokens: Math.max(50, Math.ceil(JSON.stringify(fallbackResult).length / 4)),
      });
      recordAiRequest({
        model,
        feature: 'generateProjectPlan',
        status: 'fallback',
        keyType: 'system',
        durationSeconds: (Date.now() - startTime) / 1000,
      });
    } catch (_) {}

    return fallbackResult;
  }
}

/**
 * Persist an approved AI Project Plan atomically via Prisma transaction
 */
async function applyProjectPlan({ teamId, userId, planData, prismaInstance = prisma }) {
  if (!teamId || !userId || !planData) {
    throw new Error('teamId, userId, and planData are required');
  }

  return await prismaInstance.$transaction(async (tx) => {
    // 1. Get next order for project in team
    const lastProject = await tx.project.findFirst({
      where: { teamId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const nextOrder = lastProject ? lastProject.order + 1000 : 1000;

    // 2. Compute startDate & targetDate
    const startDate = planData.startDate ? new Date(planData.startDate) : new Date();
    let targetDate = planData.targetDate ? new Date(planData.targetDate) : null;
    if (!targetDate && typeof planData.targetDays === 'number') {
      const d = new Date(startDate.getTime());
      d.setUTCDate(d.getUTCDate() + planData.targetDays);
      targetDate = d;
    }

    // 3. Create Project
    const project = await tx.project.create({
      data: {
        name: planData.name,
        description: planData.description || null,
        icon: planData.icon || '🚀',
        color: planData.color || '#6366f1',
        status: 'active',
        startDate,
        targetDate,
        order: nextOrder,
        teamId,
        createdById: userId,
        members: {
          create: {
            userId,
            role: 'lead',
          },
        },
      },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    // 4. Create tasks and nested subtasks
    const createdTasks = [];
    let totalSubtasks = 0;

    if (Array.isArray(planData.tasks)) {
      for (let i = 0; i < planData.tasks.length; i++) {
        const item = planData.tasks[i];
        let taskDueDate = null;
        if (item.dueDate) {
          taskDueDate = new Date(item.dueDate);
        } else if (typeof item.suggestedDeadlineOffsetDays === 'number') {
          const d = new Date(startDate.getTime());
          d.setUTCDate(d.getUTCDate() + item.suggestedDeadlineOffsetDays);
          taskDueDate = d;
        }

        const task = await tx.task.create({
          data: {
            title: item.title,
            description: item.description || null,
            priority: item.priority || 'medium',
            status: item.status || 'todo',
            dueDate: taskDueDate,
            labels: Array.isArray(item.labels) ? item.labels : [],
            order: (i + 1) * 1000,
            projectId: project.id,
            teamId,
            createdById: userId,
          },
        });

        if (Array.isArray(item.subtasks) && item.subtasks.length > 0) {
          for (let j = 0; j < item.subtasks.length; j++) {
            const st = item.subtasks[j];
            await tx.subtask.create({
              data: {
                title: st.title,
                order: typeof st.order === 'number' ? st.order : (j + 1) * 1000,
                taskId: task.id,
              },
            });
            totalSubtasks++;
          }
        }

        await tx.activity.create({
          data: {
            taskId: task.id,
            userId,
            action: 'TASK_CREATED',
            details: JSON.stringify({ source: 'AI_PROJECT_PLANNER', projectName: project.name }),
          },
        });

        createdTasks.push(task);
      }
    }

    return {
      project,
      tasksCount: createdTasks.length,
      subtasksCount: totalSubtasks,
      tasks: createdTasks,
    };
  });
}

/**
 * Helper to compute date range window objects
 */
function calculateRangeWindows(range = '7d') {
  const now = new Date();
  let currentStart = null;
  let prevStart = null;
  let prevEnd = null;
  let label = 'All Time';

  if (range === '7d') {
    currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    prevEnd = currentStart;
    prevStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    label = 'Past 7 Days';
  } else if (range === '30d') {
    currentStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    prevEnd = currentStart;
    prevStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    label = 'Past 30 Days';
  } else if (range === '90d') {
    currentStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    prevEnd = currentStart;
    prevStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    label = 'Past 90 Days';
  } else if (range === 'this_week') {
    const d = new Date(now);
    const day = d.getDay();
    const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diffToMonday);
    d.setHours(0, 0, 0, 0);
    currentStart = d;

    prevEnd = new Date(currentStart);
    prevStart = new Date(currentStart);
    prevStart.setDate(prevStart.getDate() - 7);
    label = 'This Week';
  } else if (range === 'last_week') {
    const d = new Date(now);
    const day = d.getDay();
    const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diffToMonday - 7);
    d.setHours(0, 0, 0, 0);
    currentStart = d;

    prevEnd = new Date(currentStart);
    prevEnd.setDate(prevEnd.getDate() + 7);
    prevStart = new Date(currentStart);
    prevStart.setDate(prevStart.getDate() - 7);
    label = 'Last Week';
  } else if (range === 'this_month') {
    currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    prevEnd = currentStart;
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    label = 'This Month';
  }

  return {
    range,
    startDate: currentStart ? currentStart.toISOString() : null,
    endDate: now.toISOString(),
    currentStart,
    currentEnd: now,
    prevStart,
    prevEnd,
    label,
  };
}

/**
 * Aggregate productivity metrics securely from authorized TaskFlow database data
 */
async function aggregateProductivityMetrics({
  teamId,
  userId = null,
  projectId = null,
  range = '7d',
  prismaInstance = prisma,
}) {
  const window = calculateRangeWindows(range);
  const now = new Date();

  const taskWhere = { teamId };
  if (userId) taskWhere.assigneeId = userId;
  if (projectId) taskWhere.projectId = projectId;

  const [tasks, memberships, projects] = await Promise.all([
    prismaInstance.task.findMany({
      where: taskWhere,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        assigneeId: true,
        projectId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prismaInstance.teamMembership.findMany({
      where: { teamId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prismaInstance.project.findMany({
      where: { teamId },
      select: { id: true, name: true, status: true },
    }),
  ]);

  const totalTasks = tasks.length;
  const completedAllTime = tasks.filter(t => t.status === 'done').length;
  const completionRate = totalTasks > 0 ? Math.round((completedAllTime / totalTasks) * 100) : 0;

  // Tasks in current window vs prev window
  const completedInCurrent = window.currentStart
    ? tasks.filter(t => t.status === 'done' && new Date(t.updatedAt) >= window.currentStart)
    : tasks.filter(t => t.status === 'done');

  const completedInPrev = (window.prevStart && window.prevEnd)
    ? tasks.filter(t => t.status === 'done' && new Date(t.updatedAt) >= window.prevStart && new Date(t.updatedAt) < window.prevEnd)
    : [];

  const createdInCurrent = window.currentStart
    ? tasks.filter(t => new Date(t.createdAt) >= window.currentStart)
    : tasks;

  const overdueTasks = tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now);
  const activeTasks = tasks.filter(t => t.status !== 'done');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const todoTasks = tasks.filter(t => t.status === 'todo');

  // Velocity change %
  const currentCount = completedInCurrent.length;
  const prevCount = completedInPrev.length;
  let velocityChangePct = 0;
  let hasVelocityBaseline = false;
  if (prevCount > 0) {
    hasVelocityBaseline = true;
    velocityChangePct = Math.round(((currentCount - prevCount) / prevCount) * 100);
  }

  // Peak productivity day of week (requires minimum 3 completions and at least 2 on the top day to be statistically meaningful)
  const dayCounts = { Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0, Sunday: 0 };
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const t of completedInCurrent) {
    const day = dayNames[new Date(t.updatedAt).getDay()];
    if (dayCounts[day] !== undefined) dayCounts[day]++;
  }

  let peakDay = null;
  let maxDayCount = 0;
  if (completedInCurrent.length >= 3) {
    for (const [dName, dCount] of Object.entries(dayCounts)) {
      if (dCount > maxDayCount) {
        maxDayCount = dCount;
        peakDay = dName;
      }
    }
    if (maxDayCount < 2) {
      peakDay = null;
    }
  }

  // Workload distribution
  const workloadByMember = memberships.map(m => {
    const memberTasks = tasks.filter(t => t.assigneeId === m.user.id);
    const active = memberTasks.filter(t => t.status !== 'done');
    const done = window.currentStart
      ? memberTasks.filter(t => t.status === 'done' && new Date(t.updatedAt) >= window.currentStart)
      : memberTasks.filter(t => t.status === 'done');
    return {
      userId: m.user.id,
      name: m.user.name || m.user.email.split('@')[0],
      activeCount: active.length,
      inProgressCount: memberTasks.filter(t => t.status === 'in_progress').length,
      todoCount: memberTasks.filter(t => t.status === 'todo').length,
      overdueCount: memberTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now).length,
      completedCount: done.length,
    };
  });

  // Top contributor
  let topContributor = null;
  const sortedByCompleted = [...workloadByMember].sort((a, b) => b.completedCount - a.completedCount);
  if (sortedByCompleted.length > 0 && sortedByCompleted[0].completedCount > 0) {
    topContributor = {
      name: sortedByCompleted[0].name,
      completedCount: sortedByCompleted[0].completedCount,
    };
  }

  // Highest workload member
  let highestWorkloadMember = null;
  const sortedByActive = [...workloadByMember].sort((a, b) => b.activeCount - a.activeCount);
  if (sortedByActive.length > 0 && sortedByActive[0].activeCount > 0) {
    highestWorkloadMember = {
      name: sortedByActive[0].name,
      activeCount: sortedByActive[0].activeCount,
    };
  }

  // Project slowdowns (Projects with pending tasks where no task completed in past 5 days)
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const projectSlowdowns = [];
  for (const p of projects) {
    const projectTasks = tasks.filter(t => t.projectId === p.id);
    const pendingInProject = projectTasks.filter(t => t.status !== 'done');
    const recentCompletions = projectTasks.filter(t => t.status === 'done' && new Date(t.updatedAt) >= fiveDaysAgo);
    if (pendingInProject.length > 0 && recentCompletions.length === 0) {
      projectSlowdowns.push({
        projectId: p.id,
        name: p.name,
        pendingCount: pendingInProject.length,
      });
    }
  }

  return {
    timeRange: {
      range: window.range,
      startDate: window.startDate,
      endDate: window.endDate,
      label: window.label,
    },
    tasksCompleted: currentCount,
    tasksCompletedPrev: prevCount,
    tasksCreated: createdInCurrent.length,
    totalTasks,
    activeWorkloadCount: activeTasks.length,
    inProgressCount: inProgressTasks.length,
    todoCount: todoTasks.length,
    overdueCount: overdueTasks.length,
    overdueTasksList: overdueTasks.map(t => ({
      title: t.title,
      priority: t.priority,
    })),
    completionRate,
    velocityChangePct,
    hasVelocityBaseline,
    peakProductivityDay: peakDay,
    topContributor,
    highestWorkloadMember,
    workloadByMember,
    projectSlowdowns,
  };
}

/**
 * Deterministic fallback generator for AI Productivity Insights
 */
function generateFallbackInsights(metrics, scopeName = 'Your team') {
  const {
    timeRange,
    totalTasks = 0,
    tasksCompleted = 0,
    tasksCreated = 0,
    completionRate = 0,
    velocityChangePct = 0,
    overdueCount = 0,
    activeWorkloadCount = 0,
    peakProductivityDay = null,
    topContributor = null,
    highestWorkloadMember = null,
    projectSlowdowns = [],
  } = metrics;

  const hasVelocityBaseline = metrics.hasVelocityBaseline !== undefined
    ? Boolean(metrics.hasVelocityBaseline)
    : (velocityChangePct !== 0);

  const highlights = [];
  const bottlenecks = [];
  const workloadAnalysis = [];
  const recommendations = [];

  // 1. Velocity & Milestone Highlights
  if (tasksCompleted > 0) {
    let velText = `${scopeName} completed ${tasksCompleted} task${tasksCompleted === 1 ? '' : 's'} ${timeRange.label.toLowerCase()}`;
    if (hasVelocityBaseline && velocityChangePct > 0) {
      velText += ` (${velocityChangePct}% improvement compared with the previous period).`;
    } else if (hasVelocityBaseline && velocityChangePct < 0) {
      velText += ` (${Math.abs(velocityChangePct)}% decrease from the previous period).`;
    } else {
      velText += '.';
    }
    highlights.push(velText);
  } else {
    highlights.push(`${scopeName} has 0 completed tasks recorded for ${timeRange.label.toLowerCase()}.`);
  }

  if (peakProductivityDay) {
    highlights.push(`Peak productivity occurred on ${peakProductivityDay}s with the highest volume of task completions.`);
  }

  if (topContributor && topContributor.completedCount > 0) {
    highlights.push(`${topContributor.name} was the top contributor with ${topContributor.completedCount} task${topContributor.completedCount === 1 ? '' : 's'} completed.`);
  }

  if (completionRate >= 70 && totalTasks >= 3) {
    highlights.push(`Overall project completion rate is strong at ${completionRate}%.`);
  }

  // 2. Bottlenecks & Overdue Alerts
  if (overdueCount > 0) {
    bottlenecks.push(`${overdueCount} task${overdueCount === 1 ? ' is' : 's are'} overdue and require immediate attention.`);
  }

  if (Array.isArray(projectSlowdowns) && projectSlowdowns.length > 0) {
    for (const ps of projectSlowdowns.slice(0, 2)) {
      bottlenecks.push(`Project "${ps.name}" has slowed over the past 5 days with ${ps.pendingCount} pending task${ps.pendingCount === 1 ? '' : 's'} and no recent completions.`);
    }
  }

  if (bottlenecks.length === 0) {
    bottlenecks.push('No critical overdue blockers or stalled projects detected.');
  }

  // 3. Workload Analysis
  if (highestWorkloadMember && highestWorkloadMember.activeCount >= 3) {
    workloadAnalysis.push(`${highestWorkloadMember.name} has the highest active workload with ${highestWorkloadMember.activeCount} active task${highestWorkloadMember.activeCount === 1 ? '' : 's'}.`);
  } else if (activeWorkloadCount > 0) {
    workloadAnalysis.push(`Active workload is distributed across the team (${activeWorkloadCount} total active task${activeWorkloadCount === 1 ? '' : 's'}).`);
  } else {
    workloadAnalysis.push('No active tasks currently in flight.');
  }

  if (tasksCreated > tasksCompleted && tasksCreated >= 3) {
    workloadAnalysis.push(`Task inflow exceeded completions (${tasksCreated} created vs ${tasksCompleted} completed), increasing active backlog.`);
  }

  // 4. Actionable Recommendations
  if (overdueCount > 0) {
    recommendations.push(`Triage the ${overdueCount} overdue task${overdueCount === 1 ? '' : 's'} in tomorrow's standup or sprint sync.`);
  }

  if (highestWorkloadMember && highestWorkloadMember.activeCount >= 5) {
    recommendations.push(`Consider reallocating upcoming tasks from ${highestWorkloadMember.name} to balance team capacity.`);
  }

  if (projectSlowdowns.length > 0) {
    recommendations.push(`Review blockers on "${projectSlowdowns[0].name}" to resume project momentum.`);
  }

  if (recommendations.length === 0) {
    if (totalTasks === 0) {
      recommendations.push('Create your first task to start tracking work.');
    } else if (activeWorkloadCount > 0) {
      recommendations.push(`Focus on moving the ${activeWorkloadCount} active task${activeWorkloadCount === 1 ? '' : 's'} to review and done.`);
    } else {
      recommendations.push('Plan upcoming milestone backlog items to prepare next sprint tasks.');
    }
  }

  // Formulate executive summary
  let summaryParts = [];
  if (tasksCompleted > 0) {
    summaryParts.push(`${scopeName} completed ${tasksCompleted} task${tasksCompleted === 1 ? '' : 's'} ${timeRange.label.toLowerCase()}${hasVelocityBaseline && velocityChangePct > 0 ? ` (${velocityChangePct}% improvement compared with last period)` : ''}.`);
  } else {
    summaryParts.push(`${scopeName} tracked ${activeWorkloadCount} active tasks ${timeRange.label.toLowerCase()}.`);
  }

  if (overdueCount > 0) {
    summaryParts.push(`${overdueCount} task${overdueCount === 1 ? ' is' : 's are'} overdue.`);
  }

  if (highestWorkloadMember && highestWorkloadMember.activeCount >= 3) {
    summaryParts.push(`${highestWorkloadMember.name} has the highest active workload.`);
  }

  if (projectSlowdowns.length > 0) {
    summaryParts.push(`"${projectSlowdowns[0].name}" has slowed over the past 5 days.`);
  }

  const summary = summaryParts.join(' ');

  return {
    timeRange: {
      range: timeRange.range,
      startDate: timeRange.startDate,
      endDate: timeRange.endDate,
      label: timeRange.label,
    },
    summary,
    metrics: {
      totalTasks,
      tasksCompleted,
      tasksCreated,
      completionRate,
      velocityChangePct,
      hasVelocityBaseline,
      overdueCount,
      activeWorkloadCount,
      peakProductivityDay,
      topContributor,
      highestWorkloadMember,
    },
    highlights,
    bottlenecks,
    workloadAnalysis,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate AI Productivity Insights via Gemini or deterministic fallback
 */
async function generateProductivityInsights({
  teamId,
  userId = null,
  projectId = null,
  range = '7d',
  teamName = 'Your team',
  prismaInstance = prisma,
}) {
  const metrics = await aggregateProductivityMetrics({
    teamId,
    userId,
    projectId,
    range,
    prismaInstance,
  });

  const scopeName = userId ? 'You' : (teamName || 'Your team');
  const model = getGeminiModel();
  const startTime = Date.now();

  try {
    const systemPrompt = `You are a factual, concise Engineering Productivity Intelligence Analyst inside SyncTask.
Your task is to analyze aggregated team productivity metrics and output structured JSON with grounded, professional, fluff-free observations.

Output MUST be a valid JSON object matching this schema:
{
  "summary": "Executive summary paragraph (2-3 sentences max). Factual and grounded.",
  "highlights": ["Array of 2 to 4 positive accomplishments or velocity milestones"],
  "bottlenecks": ["Array of 1 to 3 overdue warnings, stalled projects, or blockers. If none, state 'No critical overdue blockers or stalled projects detected.'"],
  "workloadAnalysis": ["Array of 1 to 3 observations on team capacity and workload balance"],
  "recommendations": ["Array of 2 to 4 actionable, specific suggestions grounded in the metrics"]
}

STRICT GUIDELINES:
- NO generic corporate hype, empty motivational language, or buzzwords (NEVER use 'positive momentum', 'stellar performance', 'driving meaningful outcomes', 'leveraging peak days', 'strategic velocity').
- Reference EXACT numbers, percentages, member names, and project names from the context.
- If completed tasks is low (<3) or there is no previous period baseline, explicitly state that sample size is low rather than claiming velocity gains.
- Only mention peak productivity days if peakProductivityDay is non-null.
- Do NOT output markdown code fences or backticks — ONLY the raw JSON object.`;

    const contextData = {
      scope: scopeName,
      timeframe: metrics.timeRange.label,
      tasksCompleted: metrics.tasksCompleted,
      tasksCreated: metrics.tasksCreated,
      velocityChangePct: metrics.velocityChangePct,
      overdueCount: metrics.overdueCount,
      activeWorkloadCount: metrics.activeWorkloadCount,
      peakProductivityDay: metrics.peakProductivityDay,
      topContributor: metrics.topContributor,
      highestWorkloadMember: metrics.highestWorkloadMember,
      stalledProjects: metrics.projectSlowdowns.map(p => p.name),
    };

    const fullPrompt = `${systemPrompt}\n\nAggregated Data:\n${JSON.stringify(contextData, null, 2)}`;

    const responseText = await callGeminiGenerate({
      contents: fullPrompt,
    });

    const parsedJson = parseGeminiJsonResponse(responseText);

    const fallback = generateFallbackInsights(metrics, scopeName);

    const result = {
      timeRange: {
        range: metrics.timeRange.range,
        startDate: metrics.timeRange.startDate,
        endDate: metrics.timeRange.endDate,
        label: metrics.timeRange.label,
      },
      summary: parsedJson.summary || fallback.summary,
      metrics: {
        totalTasks: metrics.totalTasks,
        tasksCompleted: metrics.tasksCompleted,
        tasksCreated: metrics.tasksCreated,
        completionRate: metrics.completionRate,
        velocityChangePct: metrics.velocityChangePct,
        overdueCount: metrics.overdueCount,
        activeWorkloadCount: metrics.activeWorkloadCount,
        peakProductivityDay: metrics.peakProductivityDay,
        topContributor: metrics.topContributor,
        highestWorkloadMember: metrics.highestWorkloadMember,
      },
      highlights: Array.isArray(parsedJson.highlights) && parsedJson.highlights.length > 0
        ? parsedJson.highlights
        : fallback.highlights,
      bottlenecks: Array.isArray(parsedJson.bottlenecks) && parsedJson.bottlenecks.length > 0
        ? parsedJson.bottlenecks
        : fallback.bottlenecks,
      workloadAnalysis: Array.isArray(parsedJson.workloadAnalysis) && parsedJson.workloadAnalysis.length > 0
        ? parsedJson.workloadAnalysis
        : fallback.workloadAnalysis,
      recommendations: Array.isArray(parsedJson.recommendations) && parsedJson.recommendations.length > 0
        ? parsedJson.recommendations
        : fallback.recommendations,
      generatedAt: new Date().toISOString(),
    };

    const validated = aiProductivityInsightsResponse.parse(result);

    try {
      recordAiTokens({
        model,
        feature: 'generateProductivityInsights',
        inputTokens: Math.max(20, Math.ceil(JSON.stringify(contextData).length / 4)),
        outputTokens: Math.max(50, Math.ceil(JSON.stringify(validated).length / 4)),
      });
      recordAiRequest({
        model,
        feature: 'generateProductivityInsights',
        status: 'success',
        keyType: teamId ? 'byok' : 'system',
        durationSeconds: (Date.now() - startTime) / 1000,
      });
    } catch (_) {}

    return validated;
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    logGeminiDiagnostic({
      feature: 'generateProductivityInsights',
      model,
      elapsedMs,
      error: err,
    });

    const fallback = generateFallbackInsights(metrics, scopeName);
    const fallbackResult = aiProductivityInsightsResponse.parse(fallback);

    try {
      recordAiTokens({
        model,
        feature: 'generateProductivityInsights',
        inputTokens: Math.max(20, Math.ceil(JSON.stringify(metrics).length / 4)),
        outputTokens: Math.max(50, Math.ceil(JSON.stringify(fallbackResult).length / 4)),
      });
      recordAiRequest({
        model,
        feature: 'generateProductivityInsights',
        status: 'fallback',
        keyType: 'system',
        durationSeconds: (Date.now() - startTime) / 1000,
      });
    } catch (_) {}

    return fallbackResult;
  }
}

/**
 * Deterministic fallback NLP interpreter for natural language search queries
 */
function fallbackNaturalSearchInterpreter(rawPrompt, teamContext = {}) {
  const cleanPrompt = sanitizePrompt(rawPrompt);
  const pLower = cleanPrompt.toLowerCase();

  const statuses = [];
  const priorities = [];
  let assignee = null;
  let project = null;
  let due = null;
  const labels = [];
  let sortBy = 'relevance';
  let sortOrder = 'desc';

  // 1. Assignee Detection
  if (
    pLower.includes('assigned to me') ||
    pLower.includes('assigned to myself') ||
    pLower.includes('my tasks') ||
    pLower.includes('my task') ||
    pLower.includes('assigned to i')
  ) {
    assignee = 'me';
  } else if (
    pLower.includes('unassigned') ||
    pLower.includes('not assigned') ||
    pLower.includes('no assignee') ||
    pLower.includes('nobody') ||
    pLower.includes('no one')
  ) {
    assignee = 'unassigned';
  } else if (Array.isArray(teamContext.members) && teamContext.members.length > 0) {
    for (const m of teamContext.members) {
      const mName = (m.name || m.user?.name || '').toLowerCase();
      if (mName && mName.length >= 2 && pLower.includes(mName)) {
        assignee = m.name || m.user?.name || m.userId || m.id;
        break;
      }
      const firstName = mName.split(/\s+/)[0];
      if (firstName && firstName.length >= 2 && new RegExp(`\\b${firstName}\\b`, 'i').test(pLower)) {
        assignee = m.name || m.user?.name || m.userId || m.id;
        break;
      }
    }
  }

  if (!assignee) {
    const assignedMatch = cleanPrompt.match(/assigned to\s+([A-Za-z0-9_-]+)/i);
    if (assignedMatch && assignedMatch[1]) {
      const candidate = assignedMatch[1].trim();
      if (!['me', 'myself', 'nobody', 'someone', 'everyone', 'all', 'user'].includes(candidate.toLowerCase())) {
        assignee = candidate;
      }
    }
  }

  // 2. Priority Detection
  if (pLower.includes('urgent') || pLower.includes('critical') || pLower.includes('blocker') || pLower.includes('emergency')) {
    priorities.push('urgent');
  }
  if (pLower.includes('high priority') || pLower.includes('high-priority') || pLower.includes('high') || pLower.includes('p1')) {
    if (!priorities.includes('high')) priorities.push('high');
  }
  if (pLower.includes('medium priority') || pLower.includes('medium') || pLower.includes('med priority') || pLower.includes('p2')) {
    if (!priorities.includes('medium')) priorities.push('medium');
  }
  if (pLower.includes('low priority') || pLower.includes('low') || pLower.includes('minor') || pLower.includes('p3')) {
    if (!priorities.includes('low')) priorities.push('low');
  }

  // 3. Status Detection
  if (pLower.includes('in progress') || pLower.includes('in-progress') || pLower.includes('doing') || pLower.includes('active') || pLower.includes('working on')) {
    statuses.push('in_progress');
  }
  if (pLower.includes('to do') || pLower.includes('todo') || pLower.includes('to-do') || pLower.includes('pending') || pLower.includes('backlog') || pLower.includes('not started')) {
    if (!statuses.includes('todo')) statuses.push('todo');
  }
  if (pLower.includes('done') || pLower.includes('completed') || pLower.includes('finished') || pLower.includes('closed') || pLower.includes('resolved')) {
    if (!statuses.includes('done')) statuses.push('done');
  }
  if (pLower.includes('open') && !pLower.includes('close') && statuses.length === 0) {
    statuses.push('todo', 'in_progress');
  }

  // 4. Due Date Detection
  if (pLower.includes('due today') || pLower.includes('today')) {
    due = 'today';
  } else if (pLower.includes('due tomorrow') || pLower.includes('tomorrow')) {
    due = 'tomorrow';
  } else if (pLower.includes('overdue') || pLower.includes('past due') || pLower.includes('late')) {
    due = 'overdue';
  } else if (
    pLower.includes('this week') ||
    pLower.includes('due this week') ||
    pLower.includes('this friday') ||
    pLower.includes('due friday') ||
    pLower.includes('friday') ||
    pLower.includes('this monday') ||
    pLower.includes('this tuesday') ||
    pLower.includes('this wednesday') ||
    pLower.includes('this thursday') ||
    pLower.includes('this saturday') ||
    pLower.includes('this sunday')
  ) {
    due = 'this_week';
  } else if (pLower.includes('next week') || pLower.includes('due next week')) {
    due = 'next_week';
  } else if (pLower.includes('this month') || pLower.includes('due this month')) {
    due = 'this_month';
  } else if (pLower.includes('no due date') || pLower.includes('unscheduled') || pLower.includes('no date')) {
    due = 'none';
  }

  // 5. Project Matching
  if (Array.isArray(teamContext.projects)) {
    for (const proj of teamContext.projects) {
      const pName = (proj.name || '').toLowerCase();
      if (pName && pName.length >= 3 && pLower.includes(pName)) {
        project = proj.name;
        break;
      }
    }
  }

  // 6. Label / Tag Matching
  const commonLabels = ['bug', 'bugs', 'frontend', 'backend', 'security', 'auth', 'design', 'api', 'devops', 'docs', 'feature', 'ui'];
  for (const lbl of commonLabels) {
    if (new RegExp(`\\b${lbl}\\b`, 'i').test(cleanPrompt)) {
      labels.push(lbl === 'bugs' ? 'bug' : lbl);
    }
  }

  // 7. Sort By
  if (pLower.includes('sort by priority') || pLower.includes('highest priority')) {
    sortBy = 'priority';
    sortOrder = 'desc';
  } else if (pLower.includes('sort by due date') || pLower.includes('soonest') || pLower.includes('due date')) {
    sortBy = 'dueDate';
    sortOrder = 'asc';
  } else if (pLower.includes('recently created') || pLower.includes('newest') || pLower.includes('latest')) {
    sortBy = 'createdAt';
    sortOrder = 'desc';
  } else if (pLower.includes('oldest')) {
    sortBy = 'createdAt';
    sortOrder = 'asc';
  }

  // 8. Residual text extraction (cleaning stop words and punctuation)
  const multiWordStopWords = [
    'assigned to myself', 'assigned to me', 'assigned to i', 'my tasks', 'my task',
    'due this month', 'due next week', 'due this week', 'due tomorrow', 'due today',
    'high-priority', 'high priority', 'medium priority', 'low priority', 'urgent priority',
    'in progress', 'in-progress', 'to do', 'to-do', 'past due', 'no due date', 'no date',
    'show me all', 'show me', 'find me all', 'find me', 'search for', 'list all', 'get all',
    'that are due', 'which are due', 'that are', 'which are', 'working on', 'not started',
    'sort by priority', 'highest priority', 'sort by due date', 'recently created'
  ];

  const singleWordStopWords = [
    'show', 'find', 'search', 'list', 'get', 'display', 'view', 'all', 'my', 'me', 'mine', 'myself',
    'tasks', 'task', 'items', 'item', 'tickets', 'ticket', 'assigned', 'assignee', 'owner',
    'priority', 'priorities', 'urgent', 'high', 'medium', 'med', 'low', 'critical', 'blocker',
    'status', 'statuses', 'due', 'deadline', 'overdue', 'today', 'tomorrow', 'yesterday',
    'week', 'month', 'this', 'next', 'none', 'done', 'completed', 'finished', 'closed', 'resolved',
    'open', 'progress', 'todo', 'pending', 'backlog', 'unassigned', 'unscheduled',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'in', 'for', 'with', 'by', 'on', 'at', 'to', 'that', 'are', 'is', 'and', 'or', 'the', 'a', 'an',
    'recently', 'created', 'latest', 'newest', 'oldest', 'soonest', 'sort', 'matching', 'named', 'project'
  ];

  let cleanedKeywords = pLower.replace(/[.,?!:;'"()\[\]{}]/g, ' ');
  if (project) {
    cleanedKeywords = cleanedKeywords.replace(new RegExp(`\\b${project.toLowerCase()}\\b`, 'gi'), ' ');
  }
  if (assignee && assignee !== 'me' && assignee !== 'unassigned') {
    cleanedKeywords = cleanedKeywords.replace(new RegExp(`\\b${assignee.toLowerCase()}\\b`, 'gi'), ' ');
    const parts = assignee.toLowerCase().split(/\s+/);
    for (const part of parts) {
      if (part.length >= 2) {
        cleanedKeywords = cleanedKeywords.replace(new RegExp(`\\b${part}\\b`, 'gi'), ' ');
      }
    }
  }
  for (const mw of multiWordStopWords) {
    cleanedKeywords = cleanedKeywords.replace(new RegExp(`\\b${mw}\\b`, 'gi'), ' ');
  }
  for (const lbl of labels) {
    cleanedKeywords = cleanedKeywords.replace(new RegExp(`\\b${lbl}\\b`, 'gi'), ' ');
    cleanedKeywords = cleanedKeywords.replace(new RegExp(`\\b${lbl}s\\b`, 'gi'), ' ');
  }
  for (const sw of singleWordStopWords) {
    cleanedKeywords = cleanedKeywords.replace(new RegExp(`\\b${sw}\\b`, 'gi'), ' ');
  }
  cleanedKeywords = cleanedKeywords.replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanedKeywords.length < 2) cleanedKeywords = '';

  // 9. Build structured filter
  const structuredFilters = {
    text: cleanedKeywords,
    statuses,
    priorities,
    assignee,
    project,
    due,
    labels,
    sortBy,
    sortOrder,
  };

  // 10. Build search expression string (e.g. "assignee:me priority:high due:this_week")
  const exprParts = [];
  if (assignee) {
    exprParts.push(assignee.includes(' ') && !assignee.startsWith('"') ? `assignee:"${assignee}"` : `assignee:${assignee}`);
  }
  if (priorities.length > 0) exprParts.push(`priority:${priorities.join(',')}`);
  if (statuses.length > 0) exprParts.push(`status:${statuses.join(',')}`);
  if (due) exprParts.push(`due:${due}`);
  if (project) exprParts.push(`project:"${project}"`);
  if (labels.length > 0) exprParts.push(`label:${labels.join(',')}`);
  if (cleanedKeywords) exprParts.push(cleanedKeywords);

  const searchExpression = exprParts.join(' ');

  // 11. Formulate human explanation
  const descParts = [];
  if (priorities.length > 0) descParts.push(`${priorities.join('/')}-priority`);
  if (statuses.length > 0) descParts.push(`${statuses.map(s => s.replace('_', ' ')).join('/')}`);
  descParts.push('tasks');
  if (assignee === 'me') descParts.push('assigned to you');
  else if (assignee === 'unassigned') descParts.push('that are unassigned');
  else if (assignee) descParts.push(`assigned to ${assignee}`);
  if (project) descParts.push(`in project "${project}"`);
  if (due) descParts.push(`due ${due.replace('_', ' ')}`);
  if (labels.length > 0) descParts.push(`tagged with #${labels.join(', #')}`);
  if (cleanedKeywords) descParts.push(`matching "${cleanedKeywords}"`);

  const explanation = `Searching for ${descParts.join(' ')}.`;

  return {
    naturalQuery: cleanPrompt,
    explanation,
    structuredFilters,
    searchExpression,
  };
}

/**
 * Interpret a natural language search query using Gemini or fallback
 */
async function interpretNaturalSearchPrompt({
  prompt,
  teamId,
  userId = null,
  teamContext = {},
  prismaInstance = prisma,
}) {
  const cleanPrompt = sanitizePrompt(prompt);
  if (!cleanPrompt) {
    throw new Error('Search prompt cannot be empty');
  }

  // Load team projects & members for contextual resolution if not provided
  let context = { ...teamContext };
  if (!context.projects || !context.members) {
    const [projects, members] = await Promise.all([
      prismaInstance.project.findMany({
        where: { teamId },
        select: { id: true, name: true },
      }),
      prismaInstance.teamMembership.findMany({
        where: { teamId },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    context.projects = projects;
    context.members = members.map(m => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
    }));
  }

  const model = getGeminiModel();
  const startTime = Date.now();

  try {
    const systemPrompt = `You are ST AI, an AI Natural Language Search Query Converter for SyncTask 2.0.
Your job is to translate the user's natural language request into structured search filter JSON.

Output MUST be a valid JSON object matching this schema:
{
  "explanation": "Clear one-sentence description of what is being searched",
  "structuredFilters": {
    "text": "residual free text keyword query without stop words",
    "statuses": ["todo" | "in_progress" | "done"],
    "priorities": ["urgent" | "high" | "medium" | "low"],
    "assignee": "me" | "unassigned" | "exact member name or null",
    "project": "exact project name or null",
    "due": "today" | "tomorrow" | "yesterday" | "overdue" | "this_week" | "next_week" | "this_month" | "none" | null,
    "labels": ["array", "of", "tags"],
    "sortBy": "relevance" | "dueDate" | "priority" | "createdAt" | "title",
    "sortOrder": "asc" | "desc"
  },
  "searchExpression": "SyncTask equivalent operator expression (e.g. assignee:me priority:high due:this_week)"
}

Guidelines:
- If user says 'my tasks' or 'assigned to me', set assignee to 'me'.
- If user says 'unassigned', set assignee to 'unassigned'.
- NEVER output SQL. ONLY valid JSON.`;

    const contextSnippet = `Available Team Projects: ${context.projects.map(p => p.name).join(', ') || 'None'}\nAvailable Members: ${context.members.map(m => m.name).join(', ') || 'None'}`;
    const fullPrompt = `${systemPrompt}\n\n${contextSnippet}\n\nUser Query: "${cleanPrompt}"`;

    const responseText = await callGeminiGenerate({
      contents: fullPrompt,
    });

    const parsedJson = parseGeminiJsonResponse(responseText);
    const fallback = fallbackNaturalSearchInterpreter(cleanPrompt, context);

    return {
      naturalQuery: cleanPrompt,
      explanation: parsedJson.explanation || fallback.explanation,
      structuredFilters: {
        text: parsedJson.structuredFilters?.text !== undefined ? parsedJson.structuredFilters.text : fallback.structuredFilters.text,
        statuses: Array.isArray(parsedJson.structuredFilters?.statuses) ? parsedJson.structuredFilters.statuses : fallback.structuredFilters.statuses,
        priorities: Array.isArray(parsedJson.structuredFilters?.priorities) ? parsedJson.structuredFilters.priorities : fallback.structuredFilters.priorities,
        assignee: parsedJson.structuredFilters?.assignee !== undefined ? parsedJson.structuredFilters.assignee : fallback.structuredFilters.assignee,
        project: parsedJson.structuredFilters?.project !== undefined ? parsedJson.structuredFilters.project : fallback.structuredFilters.project,
        due: parsedJson.structuredFilters?.due !== undefined ? parsedJson.structuredFilters.due : fallback.structuredFilters.due,
        labels: Array.isArray(parsedJson.structuredFilters?.labels) ? parsedJson.structuredFilters.labels : fallback.structuredFilters.labels,
        sortBy: parsedJson.structuredFilters?.sortBy || fallback.structuredFilters.sortBy,
        sortOrder: parsedJson.structuredFilters?.sortOrder || fallback.structuredFilters.sortOrder,
      },
      searchExpression: parsedJson.searchExpression || fallback.searchExpression,
    };

    try {
      recordAiTokens({
        model,
        feature: 'interpretNaturalSearchPrompt',
        inputTokens: Math.max(10, Math.ceil(cleanPrompt.length / 4)),
        outputTokens: Math.max(20, Math.ceil(JSON.stringify(result).length / 4)),
      });
      recordAiRequest({
        model,
        feature: 'interpretNaturalSearchPrompt',
        status: 'success',
        keyType: 'system',
        durationSeconds: (Date.now() - startTime) / 1000,
      });
    } catch (_) {}

    return result;
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    logGeminiDiagnostic({
      feature: 'interpretNaturalSearchPrompt',
      model,
      elapsedMs,
      error: err,
    });

    const fallbackResult = fallbackNaturalSearchInterpreter(cleanPrompt, context);

    try {
      recordAiTokens({
        model,
        feature: 'interpretNaturalSearchPrompt',
        inputTokens: Math.max(10, Math.ceil(cleanPrompt.length / 4)),
        outputTokens: Math.max(20, Math.ceil(JSON.stringify(fallbackResult).length / 4)),
      });
      recordAiRequest({
        model,
        feature: 'interpretNaturalSearchPrompt',
        status: 'fallback',
        keyType: 'system',
        durationSeconds: (Date.now() - startTime) / 1000,
      });
    } catch (_) {}

    return fallbackResult;
  }
}

/**
 * Execute natural language search against TaskFlow database
 */
async function executeNaturalSearch({
  prompt,
  teamId,
  userId,
  executeSearch = true,
  page = 1,
  pageSize = 20,
  prismaInstance = prisma,
}) {
  const interpreted = await interpretNaturalSearchPrompt({
    prompt,
    teamId,
    userId,
    prismaInstance,
  });

  if (!executeSearch) {
    return aiSearchResponse.parse({
      naturalQuery: interpreted.naturalQuery,
      explanation: interpreted.explanation,
      structuredFilters: interpreted.structuredFilters,
      searchExpression: interpreted.searchExpression,
      results: [],
      total: 0,
      page,
      pageSize,
      facets: {},
    });
  }

  // Parse the search expression into TaskFlow AST
  const parsedAST = parseSearchQuery(interpreted.searchExpression);

  // Build Prisma where clause safely with tenant isolation
  const where = buildPrismaWhereClause(parsedAST, {
    userId,
    teamId,
    baseWhere: { teamId },
  });

  const skip = (page - 1) * pageSize;

  let orderBy;
  const { sortBy, sortOrder } = interpreted.structuredFilters;
  if (sortBy === 'dueDate') {
    orderBy = [{ dueDate: sortOrder === 'desc' ? 'desc' : 'asc' }, { createdAt: 'desc' }];
  } else if (sortBy === 'priority') {
    orderBy = [{ priority: sortOrder === 'asc' ? 'asc' : 'desc' }, { createdAt: 'desc' }];
  } else if (sortBy === 'createdAt') {
    orderBy = [{ createdAt: sortOrder === 'asc' ? 'asc' : 'desc' }];
  } else if (sortBy === 'title') {
    orderBy = [{ title: sortOrder === 'desc' ? 'desc' : 'asc' }];
  } else {
    orderBy = [{ order: 'asc' }, { createdAt: 'desc' }];
  }

  const [total, tasks] = await Promise.all([
    prismaInstance.task.count({ where }),
    prismaInstance.task.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include: {
        assignee:  { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        project:   { select: { id: true, name: true, color: true, icon: true } },
        subtasks:  { select: { id: true, completed: true, title: true } },
        _count: {
          select: {
            comments: true,
            activities: true,
            subtasks: true,
          },
        },
      },
    }),
  ]);

  const facets = {
    status: {
      todo: tasks.filter((t) => t.status === 'todo').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      done: tasks.filter((t) => t.status === 'done').length,
    },
    priority: {
      urgent: tasks.filter((t) => t.priority === 'urgent').length,
      high:   tasks.filter((t) => t.priority === 'high').length,
      medium: tasks.filter((t) => t.priority === 'medium').length,
      low:    tasks.filter((t) => t.priority === 'low').length,
    },
  };

  return aiSearchResponse.parse({
    naturalQuery: interpreted.naturalQuery,
    explanation: interpreted.explanation,
    structuredFilters: interpreted.structuredFilters,
    searchExpression: interpreted.searchExpression,
    results: tasks,
    total,
    page,
    pageSize,
    facets,
  });
}

module.exports = {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_TIMEOUT_MS,
  getGeminiModel,
  getGeminiTimeoutMs,
  categorizeGeminiError,
  logGeminiDiagnostic,
  parseGeminiJsonResponse,
  callGeminiGenerate,
  generateTaskFromPrompt,
  breakdownTaskIntoSubtasks,
  generateProjectPlan,
  generateFallbackProjectPlan,
  applyProjectPlan,
  calculateRangeWindows,
  aggregateProductivityMetrics,
  generateFallbackInsights,
  generateProductivityInsights,
  fallbackNaturalSearchInterpreter,
  interpretNaturalSearchPrompt,
  executeNaturalSearch,
  sanitizePrompt,
  generateFallbackTask,
  generateFallbackBreakdown,
};

