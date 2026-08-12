/**
 * Search Parser & Query Expression Engine
 *
 * Transforms human search queries (e.g., "status:todo assignee:me priority:high due:today label:frontend fix login")
 * into structured validated filter ASTs and safe Prisma where clauses.
 */

/**
 * Normalizes status values to Prisma enum values ('todo', 'in_progress', 'done')
 */
function normalizeStatus(val) {
  if (!val) return null;
  const s = String(val).trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
  if (s === 'todo' || s === 'to_do' || s === 'open' || s === 'pending') return 'todo';
  if (s === 'in_progress' || s === 'inprogress' || s === 'doing' || s === 'active') return 'in_progress';
  if (s === 'done' || s === 'completed' || s === 'closed' || s === 'finished') return 'done';
  return s;
}

/**
 * Normalizes priority values to Prisma enum values ('low', 'medium', 'high', 'urgent')
 */
function normalizePriority(val) {
  if (!val) return null;
  const p = String(val).trim().toLowerCase();
  if (p === 'low' || p === 'med' || p === 'medium' || p === 'high' || p === 'urgent') {
    return p === 'med' ? 'medium' : p;
  }
  return p;
}

/**
 * Date boundary calculator for relative and absolute due dates
 */
function resolveDateRange(dueToken, referenceDate = new Date()) {
  if (!dueToken) return null;
  const val = String(dueToken).trim().toLowerCase();

  const now = referenceDate instanceof Date && !isNaN(referenceDate.getTime()) ? referenceDate : new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const endOfToday   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  if (val === 'today') {
    return { gte: startOfToday, lte: endOfToday, type: 'today' };
  }

  if (val === 'tomorrow') {
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);
    const endOfTomorrow = new Date(endOfToday);
    endOfTomorrow.setUTCDate(endOfTomorrow.getUTCDate() + 1);
    return { gte: startOfTomorrow, lte: endOfTomorrow, type: 'tomorrow' };
  }

  if (val === 'yesterday') {
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setUTCDate(startOfYesterday.getUTCDate() - 1);
    const endOfYesterday = new Date(endOfToday);
    endOfYesterday.setUTCDate(endOfYesterday.getUTCDate() - 1);
    return { gte: startOfYesterday, lte: endOfYesterday, type: 'yesterday' };
  }

  if (val === 'overdue') {
    return { lt: startOfToday, type: 'overdue' };
  }

  if (val === 'this_week' || val === 'thisweek') {
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 6);
    endOfWeek.setUTCHours(23, 59, 59, 999);
    return { gte: startOfWeek, lte: endOfWeek, type: 'this_week' };
  }

  if (val === 'next_week' || val === 'nextweek') {
    const startOfNextWeek = new Date(startOfToday);
    startOfNextWeek.setUTCDate(startOfNextWeek.getUTCDate() - startOfNextWeek.getUTCDay() + 7);
    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setUTCDate(endOfNextWeek.getUTCDate() + 6);
    endOfNextWeek.setUTCHours(23, 59, 59, 999);
    return { gte: startOfNextWeek, lte: endOfNextWeek, type: 'next_week' };
  }

  if (val === 'this_month' || val === 'thismonth') {
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { gte: startOfMonth, lte: endOfMonth, type: 'this_month' };
  }

  if (val === 'nodate' || val === 'none' || val === 'null' || val === 'unscheduled') {
    return { isNull: true, type: 'nodate' };
  }

  if (val === 'hasdate' || val === 'any') {
    return { isNotNull: true, type: 'hasdate' };
  }

  // Handle exact date YYYY-MM-DD or relative comparisons like <2026-08-15, >2026-08-15
  if (/^[<>]=?\d{4}-\d{2}-\d{2}$/.test(val)) {
    const op = val.startsWith('<=') ? 'lte' : val.startsWith('<') ? 'lt' : val.startsWith('>=') ? 'gte' : 'gt';
    const dateStr = val.replace(/^[<>=]+/, '');
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateBoundary = op === 'lt' || op === 'lte'
      ? new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999))
      : new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    return { [op]: dateBoundary, type: 'comparison' };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, m, d] = val.split('-').map(Number);
    const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
    const endOfDay   = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    return { gte: startOfDay, lte: endOfDay, type: 'exact_date' };
  }

  return null;
}

function createEmptyFilters() {
  return {
    statuses: [],
    priorities: [],
    assignees: [],
    projects: [],
    labels: [],
    isFlags: [],
    hasFlags: [],
    due: null,
  };
}

/**
 * Parses raw search expression string into structured token object
 */
function parseSearchQuery(queryStr = '') {
  if (!queryStr || typeof queryStr !== 'string') {
    return {
      rawQuery: '',
      text: '',
      filters: createEmptyFilters(),
      tokens: [],
    };
  }

  const raw = queryStr.trim();
  const tokens = [];
  const filters = createEmptyFilters();

  // Match key:"quoted value" | key:'quoted value' | key:unquoted_value
  const operatorRegex = /(?:^|\s+)([a-zA-Z_-]+):(?:"([^"]+)"|'([^']+)'|([^\s]+))/g;
  let match;
  let textCursor = 0;
  const matchedRanges = [];

  while ((match = operatorRegex.exec(raw)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] || match[3] || match[4] || '';
    const matchStart = match.index + (match[0].startsWith(' ') ? 1 : 0);
    const matchEnd = match.index + match[0].length;
    matchedRanges.push({ start: matchStart, end: matchEnd });

    tokens.push({ key, value: val, raw: raw.slice(matchStart, matchEnd).trim() });

    switch (key) {
      case 'status': {
        const parts = val.split(',').map(s => normalizeStatus(s)).filter(Boolean);
        filters.statuses.push(...parts);
        break;
      }
      case 'priority': {
        const parts = val.split(',').map(p => normalizePriority(p)).filter(Boolean);
        filters.priorities.push(...parts);
        break;
      }
      case 'assignee':
      case 'assigned':
      case 'owner': {
        const trimmed = val.replace(/^@/, '').trim();
        if (trimmed) filters.assignees.push(trimmed);
        break;
      }
      case 'project':
      case 'proj': {
        if (val.trim()) filters.projects.push(val.trim());
        break;
      }
      case 'label':
      case 'tag': {
        const parts = val.split(',').map(l => l.trim()).filter(Boolean);
        filters.labels.push(...parts);
        break;
      }
      case 'due':
      case 'deadline': {
        filters.due = val.trim();
        break;
      }
      case 'before': {
        filters.due = `<${val.trim()}`;
        break;
      }
      case 'after': {
        filters.due = `>${val.trim()}`;
        break;
      }
      case 'is': {
        const parts = val.split(',').map(f => f.trim().toLowerCase()).filter(Boolean);
        filters.isFlags.push(...parts);
        break;
      }
      case 'has': {
        const parts = val.split(',').map(f => f.trim().toLowerCase()).filter(Boolean);
        filters.hasFlags.push(...parts);
        break;
      }
      default:
        // Unknown operators are preserved in tokens but not recognized as structured filters
        break;
    }
  }

  // Extract remaining non-operator text
  let remainingText = '';
  let lastIndex = 0;
  for (const range of matchedRanges) {
    if (range.start > lastIndex) {
      remainingText += ' ' + raw.slice(lastIndex, range.start);
    }
    lastIndex = range.end;
  }
  if (lastIndex < raw.length) {
    remainingText += ' ' + raw.slice(lastIndex);
  }

  const cleanText = remainingText.replace(/\s+/g, ' ').trim();

  // Deduplicate array filters
  filters.statuses   = Array.from(new Set(filters.statuses));
  filters.priorities = Array.from(new Set(filters.priorities));
  filters.assignees  = Array.from(new Set(filters.assignees));
  filters.projects   = Array.from(new Set(filters.projects));
  filters.labels     = Array.from(new Set(filters.labels));
  filters.isFlags    = Array.from(new Set(filters.isFlags));
  filters.hasFlags   = Array.from(new Set(filters.hasFlags));

  return {
    rawQuery: raw,
    text: cleanText,
    filters,
    tokens,
  };
}

/**
 * Builds Prisma where condition from parsed search query and context
 *
 * @param {Object} parsed - Result of parseSearchQuery
 * @param {Object} context - { userId, teamId, baseWhere }
 * @returns {Object} Prisma where object
 */
function buildPrismaWhereClause(parsed, context = {}) {
  const { userId, teamId, baseWhere = {} } = context;
  const where = { ...baseWhere };

  if (teamId) {
    where.teamId = teamId;
  }

  const andConditions = [];
  const filters = { ...createEmptyFilters(), ...(parsed?.filters || {}) };
  const text = parsed?.text || '';

  // ─── Status Filter ────────────────────────────────────────────────────────
  if (filters.statuses.length === 1) {
    where.status = filters.statuses[0];
  } else if (filters.statuses.length > 1) {
    where.status = { in: filters.statuses };
  }

  // ─── Priority Filter ──────────────────────────────────────────────────────
  if (filters.priorities.length === 1) {
    where.priority = filters.priorities[0];
  } else if (filters.priorities.length > 1) {
    where.priority = { in: filters.priorities };
  }

  // ─── Assignee Filter ──────────────────────────────────────────────────────
  if (filters.assignees.length > 0) {
    const assigneeConditions = filters.assignees.map((assigneeVal) => {
      const valLower = assigneeVal.toLowerCase();
      if (valLower === 'me') {
        return { assigneeId: userId || '__none__' };
      }
      if (valLower === 'unassigned' || valLower === 'none' || valLower === 'null') {
        return { assigneeId: null };
      }
      // Check if it's a UUID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assigneeVal);
      if (isUUID) {
        return { assigneeId: assigneeVal };
      }
      // Search by user name or email
      return {
        assignee: {
          OR: [
            { name:  { contains: assigneeVal, mode: 'insensitive' } },
            { email: { contains: assigneeVal, mode: 'insensitive' } },
          ],
        },
      };
    });

    if (assigneeConditions.length === 1) {
      Object.assign(where, assigneeConditions[0]);
    } else {
      andConditions.push({ OR: assigneeConditions });
    }
  }

  // ─── Project Filter ───────────────────────────────────────────────────────
  if (filters.projects.length > 0) {
    const projectConditions = filters.projects.map((projVal) => {
      const valLower = projVal.toLowerCase();
      if (valLower === 'none' || valLower === 'unassigned' || valLower === 'null') {
        return { projectId: null };
      }
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projVal);
      if (isUUID) {
        return { projectId: projVal };
      }
      return {
        project: {
          name: { contains: projVal, mode: 'insensitive' },
        },
      };
    });

    if (projectConditions.length === 1) {
      Object.assign(where, projectConditions[0]);
    } else {
      andConditions.push({ OR: projectConditions });
    }
  }

  // ─── Label Filter ─────────────────────────────────────────────────────────
  if (filters.labels.length > 0) {
    filters.labels.forEach((label) => {
      andConditions.push({ labels: { has: label } });
    });
  }

  // ─── Due Date Filter ──────────────────────────────────────────────────────
  if (filters.due) {
    const dateRange = resolveDateRange(filters.due);
    if (dateRange) {
      if (dateRange.isNull) {
        where.dueDate = null;
      } else if (dateRange.isNotNull) {
        where.dueDate = { not: null };
      } else if (dateRange.type === 'overdue') {
        where.dueDate = { lt: dateRange.lt };
        // Unless user explicitly requested status:done, exclude done tasks from overdue
        if (!filters.statuses.includes('done') && !where.status) {
          where.status = { not: 'done' };
        }
      } else {
        const dueObj = {};
        if (dateRange.gte) dueObj.gte = dateRange.gte;
        if (dateRange.lte) dueObj.lte = dateRange.lte;
        if (dateRange.gt)  dueObj.gt  = dateRange.gt;
        if (dateRange.lt)  dueObj.lt  = dateRange.lt;
        where.dueDate = dueObj;
      }
    }
  }

  // ─── 'is:' Flags ──────────────────────────────────────────────────────────
  if (filters.isFlags.length > 0) {
    filters.isFlags.forEach((flag) => {
      if (flag === 'done' || flag === 'completed') {
        where.status = 'done';
      } else if (flag === 'open' || flag === 'todo' || flag === 'uncompleted') {
        where.status = { not: 'done' };
      } else if (flag === 'overdue') {
        const now = new Date();
        const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
        where.dueDate = { lt: startOfToday };
        if (!where.status) where.status = { not: 'done' };
      } else if (flag === 'assigned') {
        where.assigneeId = { not: null };
      } else if (flag === 'unassigned') {
        where.assigneeId = null;
      }
    });
  }

  // ─── 'has:' Flags ─────────────────────────────────────────────────────────
  if (filters.hasFlags.length > 0) {
    filters.hasFlags.forEach((flag) => {
      if (flag === 'subtasks' || flag === 'subtask') {
        where.subtasks = { some: {} };
      } else if (flag === 'comments' || flag === 'comment') {
        where.comments = { some: {} };
      } else if (flag === 'due' || flag === 'duedate' || flag === 'deadline') {
        where.dueDate = { not: null };
      } else if (flag === 'project') {
        where.projectId = { not: null };
      } else if (flag === 'assignee' || flag === 'owner') {
        where.assigneeId = { not: null };
      }
    });
  }

  // ─── Free-Text Search ─────────────────────────────────────────────────────
  if (text) {
    const terms = text.split(/\s+/).filter(Boolean);
    if (terms.length === 1) {
      const term = terms[0];
      andConditions.push({
        OR: [
          { title:       { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ],
      });
    } else if (terms.length > 1) {
      terms.forEach((term) => {
        andConditions.push({
          OR: [
            { title:       { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        });
      });
    }
  }

  if (andConditions.length > 0) {
    where.AND = [...(where.AND || []), ...andConditions];
  }

  return where;
}

module.exports = {
  parseSearchQuery,
  buildPrismaWhereClause,
  resolveDateRange,
  normalizeStatus,
  normalizePriority,
};
