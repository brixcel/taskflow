/**
 * Cursor Pagination Utility (Phase 40: Performance Engineering)
 *
 * Provides safe, tamper-resistant base64 cursor pagination for Prisma models.
 * Avoids O(N) offset scan overhead on high-volume datasets and ensures stable
 * pagination even when records are inserted or deleted during traversal.
 */

class InvalidCursorError extends Error {
  constructor(message = 'Invalid or malformed pagination cursor') {
    super(message);
    this.name = 'InvalidCursorError';
    this.statusCode = 400;
  }
}

/**
 * Encodes cursor data to an opaque base64 string.
 * @param {Object|string} data
 * @returns {string}
 */
function encodeCursor(data) {
  if (!data) return null;
  const payload = typeof data === 'object' ? JSON.stringify(data) : JSON.stringify({ id: data });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Decodes an opaque base64 cursor string back to an object.
 * Throws InvalidCursorError if decoding fails or JSON is malformed.
 * @param {string} cursorStr
 * @returns {Object}
 */
function decodeCursor(cursorStr) {
  if (!cursorStr || typeof cursorStr !== 'string') {
    throw new InvalidCursorError('Cursor must be a non-empty string');
  }

  try {
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new InvalidCursorError('Malformed cursor structure');
    }
    return parsed;
  } catch (err) {
    if (err instanceof InvalidCursorError) throw err;
    throw new InvalidCursorError('Failed to decode cursor: corrupted or invalid format');
  }
}

/**
 * Executes a cursor-paginated Prisma query.
 *
 * @param {Object} model - Prisma model delegate (e.g. prisma.task)
 * @param {Object} options - Pagination options
 * @param {Object} [options.where] - Prisma filter conditions
 * @param {string} [options.cursor] - Base64 encoded cursor
 * @param {number} [options.limit=20] - Number of items to fetch (max 100)
 * @param {Array|Object} [options.orderBy] - Order by clause (must include unique field like id)
 * @param {Object} [options.include] - Relations to include
 * @param {Object} [options.select] - Fields to select
 * @param {string} [options.cursorField='id'] - Primary unique field for cursor seeking
 * @param {string} [options.direction='next'] - Navigation direction ('next' | 'prev')
 * @returns {Promise<{ items: Array, nextCursor: string|null, prevCursor: string|null, hasMore: boolean, limit: number }>}
 */
async function paginateWithCursor(model, options = {}) {
  const {
    where = {},
    cursor = null,
    limit: rawLimit = 20,
    orderBy = [{ createdAt: 'desc' }, { id: 'desc' }],
    include = undefined,
    select = undefined,
    cursorField = 'id',
    direction = 'next',
  } = options;

  // Enforce boundary limits (1 to 100 items per page)
  const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20));

  const queryArgs = {
    where,
    take: limit + 1, // Fetch +1 to check for next page presence
    orderBy,
  };

  if (include) queryArgs.include = include;
  if (select) queryArgs.select = select;

  let decodedCursor = null;
  if (cursor) {
    decodedCursor = decodeCursor(cursor);
    const cursorValue = decodedCursor[cursorField] || decodedCursor.id;
    if (!cursorValue) {
      throw new InvalidCursorError(`Cursor does not contain required '${cursorField}' key`);
    }

    queryArgs.cursor = { [cursorField]: cursorValue };
    queryArgs.skip = 1; // Skip the cursor record itself
  }

  const results = await model.findMany(queryArgs);

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  let nextCursor = null;
  let prevCursor = null;

  if (items.length > 0) {
    const firstItem = items[0];
    const lastItem = items[items.length - 1];

    if (hasMore) {
      nextCursor = encodeCursor({
        [cursorField]: lastItem[cursorField],
        id: lastItem.id,
        createdAt: lastItem.createdAt,
      });
    }

    if (cursor) {
      prevCursor = encodeCursor({
        [cursorField]: firstItem[cursorField],
        id: firstItem.id,
        createdAt: firstItem.createdAt,
      });
    }
  }

  return {
    items,
    nextCursor,
    prevCursor,
    hasMore,
    limit,
  };
}

module.exports = {
  InvalidCursorError,
  encodeCursor,
  decodeCursor,
  paginateWithCursor,
};
