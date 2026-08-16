const crypto = require('crypto');
const prisma = require('../prisma');

/**
 * Generates a cryptographically secure API key
 * Format: tf_live_<64 hex chars>
 */
function generateApiKey(prefix = 'tf_live_') {
  const randomPart = crypto.randomBytes(32).toString('hex');
  const rawKey = `${prefix}${randomPart}`;
  const keyPrefix = `${prefix}${randomPart.slice(0, 8)}...`;
  return {
    rawKey,
    keyPrefix,
    keyHash: hashApiKey(rawKey),
  };
}

/**
 * Hashes an API key with SHA-256 for secure database storage
 */
function hashApiKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') {
    throw new Error('API key must be a non-empty string');
  }
  return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
}

/**
 * Validates and authenticates an incoming raw API key
 */
async function authenticateApiKey(rawKey, { prismaInstance = prisma, requiredScope = null } = {}) {
  if (!rawKey || typeof rawKey !== 'string' || !rawKey.startsWith('tf_')) {
    return { valid: false, error: 'Invalid API key format' };
  }

  const keyHash = hashApiKey(rawKey);

  const apiKeyRecord = await prismaInstance.apiKey.findUnique({
    where: { keyHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          isDeleted: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!apiKeyRecord) {
    return { valid: false, error: 'API key not found' };
  }

  if (apiKeyRecord.revokedAt) {
    return { valid: false, error: 'API key has been revoked' };
  }

  if (apiKeyRecord.expiresAt && new Date(apiKeyRecord.expiresAt) < new Date()) {
    return { valid: false, error: 'API key has expired' };
  }

  if (apiKeyRecord.user.isDeleted) {
    return { valid: false, error: 'User account is deactivated' };
  }

  // Check if user is still a valid member of the team
  const membership = await prismaInstance.teamMembership.findUnique({
    where: {
      userId_teamId: {
        userId: apiKeyRecord.userId,
        teamId: apiKeyRecord.teamId,
      },
    },
  });

  if (!membership) {
    return { valid: false, error: 'User is no longer a member of the API key team' };
  }

  // Check scope if specified
  if (requiredScope) {
    const hasScope =
      apiKeyRecord.scopes.includes('*') ||
      apiKeyRecord.scopes.includes(requiredScope) ||
      (requiredScope.endsWith(':read') && apiKeyRecord.scopes.includes(requiredScope.replace(':read', ':write')));

    if (!hasScope) {
      return { valid: false, error: `API key lacks required scope: ${requiredScope}` };
    }
  }

  // Asynchronously update lastUsedAt (non-blocking)
  prismaInstance.apiKey
    .update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return {
    valid: true,
    apiKey: apiKeyRecord,
    user: apiKeyRecord.user,
    teamId: apiKeyRecord.teamId,
    role: membership.role,
  };
}

module.exports = {
  generateApiKey,
  hashApiKey,
  authenticateApiKey,
};
