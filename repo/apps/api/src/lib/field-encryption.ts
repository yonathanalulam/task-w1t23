import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 'v1';

const deriveKey = (secret: string): Buffer => createHash('sha256').update(secret).digest();

export const encryptField = (plaintext: string, secret: string): string => {
  const iv = randomBytes(12);
  const key = deriveKey(secret);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${VERSION}:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
};

export const decryptField = (payload: string, secret: string): string => {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported encrypted field payload format.');
  }

  const ivRaw = parts[1];
  const tagRaw = parts[2];
  const encryptedRaw = parts[3];
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Encrypted field payload is missing components.');
  }

  const key = deriveKey(secret);
  const iv = Buffer.from(ivRaw, 'base64url');
  const tag = Buffer.from(tagRaw, 'base64url');
  const encrypted = Buffer.from(encryptedRaw, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return plaintext.toString('utf8');
};
