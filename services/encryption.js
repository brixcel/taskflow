const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'default-fallback-dev-secret-key-32b';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypts sensitive credentials (like custom API keys) using AES-256-GCM
 * @param {string} plainText
 * @returns {string} iv:authTag:encryptedText (hex encoded)
 */
function encryptSecret(plainText) {
  if (!plainText || typeof plainText !== 'string') return null;

  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted strings
 * @param {string} encryptedPayload (format: iv:authTag:encryptedText)
 * @returns {string|null} Plaintext or null if decryption fails
 */
function decryptSecret(encryptedPayload) {
  if (!encryptedPayload || typeof encryptedPayload !== 'string') return null;

  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) return null;

  const [ivHex, authTagHex, encryptedText] = parts;

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    return null;
  }
}

module.exports = {
  encryptSecret,
  decryptSecret,
};
