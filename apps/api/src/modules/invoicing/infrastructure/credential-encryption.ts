import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/**
 * Encrypt a provider credential with AES-256-GCM and bind it to its tenant.
 * The organization id is authenticated data, so moving a ciphertext to another
 * organization's row makes decryption fail instead of transferring access.
 */
export function encryptProviderCredential(
  credential: string,
  organizationId: string,
  keyHex: string,
): string {
  if (!credential.trim()) throw new Error('Provider credential cannot be empty');
  if (!organizationId) throw new Error('Organization id is required');

  const key = encryptionKey(keyHex);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(organizationId, 'utf8'));

  const ciphertext = Buffer.concat([
    cipher.update(credential, 'utf8'),
    cipher.final(),
  ]);

  return [
    VERSION,
    nonce.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/** Decrypt only for the same tenant and key that authenticated the value. */
export function decryptProviderCredential(
  encrypted: string,
  organizationId: string,
  keyHex: string,
): string {
  const [version, nonceText, tagText, ciphertextText, extra] = encrypted.split('.');
  if (version !== VERSION || !nonceText || !tagText || ciphertextText === undefined || extra) {
    throw new Error('Stored provider credential is invalid');
  }

  const nonce = Buffer.from(nonceText, 'base64url');
  const authTag = Buffer.from(tagText, 'base64url');
  const ciphertext = Buffer.from(ciphertextText, 'base64url');
  if (nonce.length !== NONCE_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error('Stored provider credential is invalid');
  }

  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(keyHex), nonce);
  decipher.setAAD(Buffer.from(organizationId, 'utf8'));
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Do not leak whether a different key, tenant, or modified ciphertext was
    // supplied. Those distinctions are not useful to the caller.
    throw new Error('Stored provider credential could not be decrypted');
  }
}

function encryptionKey(keyHex: string): Buffer {
  if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new Error('Credential encryption key must be 32 bytes encoded as 64 hexadecimal characters');
  }
  return Buffer.from(keyHex, 'hex');
}
