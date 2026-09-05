import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes as nodeRandomBytes,
  timingSafeEqual,
} from 'node:crypto';
import bcrypt from 'bcryptjs';

const GCM_TAG_LENGTH = 16;
const NONCE_LENGTH = 12;

function deriveKey(appSecret: string): Buffer {
  return createHash('sha256').update(appSecret).digest();
}

export function sealSecret(
  plaintext: string,
  appSecret: string,
): { cipher: string; nonce: string } {
  const nonce = nodeRandomBytes(NONCE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(appSecret), nonce);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    cipher: Buffer.concat([encrypted, tag]).toString('base64'),
    nonce: nonce.toString('base64'),
  };
}

export function openSecret(
  cipherB64: string,
  nonceB64: string,
  appSecret: string,
): string {
  const key = deriveKey(appSecret);
  const data = Buffer.from(cipherB64, 'base64');
  const nonce = Buffer.from(nonceB64, 'base64');
  const tag = data.subarray(data.length - GCM_TAG_LENGTH);
  const ciphertext = data.subarray(0, data.length - GCM_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

export function randomBytes(size: number): Buffer {
  return nodeRandomBytes(size);
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const BCRYPT_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
