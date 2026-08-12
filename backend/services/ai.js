const xss = require('xss');
const { GoogleGenAI } = require('@google/genai');
const { aiTaskGenerateResponse } = require('../validation/schemas');

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
  let description = `### Objective\n${prompt}\n\n### Implementation Details\n- Review technical requirements and system architecture.\n- Execute implementation following TaskFlow design guidelines.\n- Verify all features with automated unit & integration tests.`;

  if (pLower.includes('login') || pLower.includes('auth') || pLower.includes('oauth')) {
    if (!title.toLowerCase().includes('auth') && !title.toLowerCase().includes('login')) {
      title = 'Implement Authentication & OAuth Flow';
    }
    description = `### Objective\nProvide seamless and secure user authentication supporting OAuth and email credentials.\n\n### Scope\n- Secure password hashing & JWT token validation.\n- OAuth provider integration.\n- Error handling & rate limiting.`;
    labels = ['auth', 'frontend', 'security'];
    subtasks = [
      { title: 'Design responsive login & signup view', order: 1000 },
      { title: 'Configure OAuth providers (Google / GitHub)', order: 2000 },
      { title: 'Implement form validation and error toast states', order: 3000 },
      { title: 'Write integration tests for authentication', order: 4000 },
    ];
  } else if (pLower.includes('aws') || pLower.includes('deploy') || pLower.includes('cloud') || pLower.includes('docker') || pLower.includes('k8s')) {
    if (!title.toLowerCase().includes('deploy') && !title.toLowerCase().includes('cloud')) {
      title = 'Configure Cloud Infrastructure & Deployment';
    }
    description = `### Objective\nEstablish resilient deployment pipelines and cloud infrastructure for high availability.\n\n### Scope\n- Infrastructure as Code provisioning.\n- CI/CD automated pipeline build.\n- Monitoring and alert setup.`;
    labels = ['devops', 'infrastructure', 'cloud'];
    subtasks = [
      { title: 'Configure IAM roles and security groups', order: 1000 },
      { title: 'Provision containerized application services', order: 2000 },
      { title: 'Set up custom domain and SSL/TLS termination', order: 3000 },
      { title: 'Run production health checks & smoke tests', order: 4000 },
    ];
  } else if (pLower.includes('database') || pLower.includes('postgres') || pLower.includes('sql') || pLower.includes('prisma') || pLower.includes('schema')) {
    if (!title.toLowerCase().includes('database') && !title.toLowerCase().includes('migration')) {
      title = 'Database Schema Design & Migration';
    }
    description = `### Objective\nDesign and execute scalable database schema updates with indexing and multi-tenant isolation.\n\n### Scope\n- Prisma schema model updates.\n- Migration testing against test database.\n- Query performance optimization.`;
    labels = ['database', 'backend', 'prisma'];
    subtasks = [
      { title: 'Define Prisma schema models and relationships', order: 1000 },
      { title: 'Apply database migration and generate Prisma client', order: 2000 },
      { title: 'Add database indices for optimized search queries', order: 3000 },
      { title: 'Verify data integrity and cascading deletions', order: 4000 },
    ];
  } else if (pLower.includes('bug') || pLower.includes('fix') || pLower.includes('error') || pLower.includes('crash')) {
    priority = 'urgent';
    deadlineDays = 1;
    labels = ['bug', 'fix'];
    subtasks = [
      { title: 'Reproduce bug in local test environment', order: 1000 },
      { title: 'Isolate root cause in application logic', order: 2000 },
      { title: 'Implement bug fix and edge-case guard', order: 3000 },
      { title: 'Add regression test in test suite', order: 4000 },
    ];
  } else if (pLower.includes('redesign') || pLower.includes('ui') || pLower.includes('design') || pLower.includes('frontend')) {
    labels = ['ui', 'design', 'frontend'];
    subtasks = [
      { title: 'Create UI mockups and component hierarchy', order: 1000 },
      { title: 'Implement component markup with CSS tokens', order: 2000 },
      { title: 'Add interactive animations and micro-interactions', order: 3000 },
      { title: 'Conduct responsive and accessibility audit', order: 4000 },
    ];
  } else {
    labels = ['general'];
    subtasks = [
      { title: `Analyze requirements for ${title.slice(0, 50)}`, order: 1000 },
      { title: 'Implement core functionality', order: 2000 },
      { title: 'Review and verify with unit tests', order: 3000 },
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

async function generateTaskFromPrompt({ prompt, project = null, currentContext = '' }) {
  const cleanPrompt = sanitizePrompt(prompt);
  if (!cleanPrompt) {
    throw new Error('Prompt cannot be empty');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const isTestEnv = process.env.NODE_ENV === 'test';

  if (!apiKey || isTestEnv) {
    const rawResult = generateFallbackTask(cleanPrompt, project);
    const dueDate = new Date();
    dueDate.setUTCDate(dueDate.getUTCDate() + rawResult.suggestedDeadlineDays);
    const suggestedDueDate = dueDate.toISOString().slice(0, 10);

    return aiTaskGenerateResponse.parse({
      ...rawResult,
      suggestedDueDate,
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemInstructions = `You are an AI task assistant inside TaskFlow 2.0, an enterprise task management platform.
Your job is to take the user's natural language task request and produce a complete, structured JSON task plan.

Output MUST be a valid JSON object matching this schema:
{
  "title": "Clear action-oriented title under 200 characters",
  "description": "Comprehensive markdown description with Objective, Scope, and Implementation sections",
  "priority": "low" | "medium" | "high" | "urgent",
  "suggestedDeadlineDays": integer number between 1 and 30,
  "labels": ["array", "of", "1-4", "concise", "lowercase", "labels"],
  "suggestedSubtasks": [
    { "title": "Step 1 description", "order": 1000 },
    { "title": "Step 2 description", "order": 2000 }
  ]
}

Guidelines:
- Title must be crisp and action-oriented.
- Subtasks must be concrete, sequential checklist items (3 to 6 subtasks).
- Priority should reflect the task's stated urgency and importance.
- Do NOT output any markdown code blocks, backticks, or extra text — only the raw JSON object.`;

    let contextSnippet = '';
    if (project && project.name) {
      contextSnippet += `\nTarget Project: ${project.name} (${project.description || 'No description'})`;
    }
    if (currentContext) {
      contextSnippet += `\nAdditional Context: ${currentContext}`;
    }

    const fullPrompt = `${systemInstructions}\n${contextSnippet}\n\nUser Request: "${cleanPrompt}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text?.trim() || '{}';
    let parsedJson;
    try {
      parsedJson = JSON.parse(responseText);
    } catch {
      const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedJson = JSON.parse(cleaned);
    }

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

    return validated;
  } catch (error) {
    const rawResult = generateFallbackTask(cleanPrompt, project);
    const dueDate = new Date();
    dueDate.setUTCDate(dueDate.getUTCDate() + rawResult.suggestedDeadlineDays);
    const suggestedDueDate = dueDate.toISOString().slice(0, 10);

    return aiTaskGenerateResponse.parse({
      ...rawResult,
      suggestedDueDate,
    });
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
  } else if (combined.includes('redesign') || combined.includes('design system') || combined.includes('ui') || combined.includes('figma')) {
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

  const apiKey = process.env.GEMINI_API_KEY;
  const isTestEnv = process.env.NODE_ENV === 'test';

  if (!apiKey || isTestEnv) {
    const fallbackList = generateFallbackBreakdown({
      title: cleanTitle,
      description: cleanDesc,
      existingSubtasks,
    });
    return { subtasks: fallbackList };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemPrompt = `You are an expert technical lead and project manager inside TaskFlow 2.0.
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

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text?.trim() || '{}';
    let parsedJson;
    try {
      parsedJson = JSON.parse(responseText);
    } catch {
      const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsedJson = JSON.parse(cleaned);
    }

    if (!parsedJson.subtasks || !Array.isArray(parsedJson.subtasks) || parsedJson.subtasks.length === 0) {
      throw new Error('Invalid subtasks format returned by AI');
    }

    const subtasks = parsedJson.subtasks.map((st, idx) => ({
      title: sanitizePrompt(st.title || `Step ${idx + 1}`).slice(0, 200),
      estimatedMinutes: typeof st.estimatedMinutes === 'number' && st.estimatedMinutes > 0 ? Math.min(st.estimatedMinutes, 480) : 30,
      order: typeof st.order === 'number' ? st.order : (idx + 1) * 1000,
    })).filter(st => st.title.length > 0);

    return { subtasks };
  } catch (err) {
    const fallbackList = generateFallbackBreakdown({
      title: cleanTitle,
      description: cleanDesc,
      existingSubtasks,
    });
    return { subtasks: fallbackList };
  }
}

module.exports = {
  generateTaskFromPrompt,
  breakdownTaskIntoSubtasks,
  sanitizePrompt,
  generateFallbackTask,
  generateFallbackBreakdown,
};
