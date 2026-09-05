import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  hashPassword,
  openSecret,
  randomBytes,
  safeEqual,
  sealSecret,
  sha256Hex,
  verifyPassword,
} from '../src/infra/crypto';

describe('crypto', () => {
  const secret = 'a'.repeat(32);

  it('seals and opens a secret with both outputs required', () => {
    const { cipher, nonce } = sealSecret('jira-token-123', secret);
    expect(nonce.length).toBeGreaterThan(0);
    expect(openSecret(cipher, nonce, secret)).toBe('jira-token-123');
  });

  it('fails to open with a different app secret', () => {
    const { cipher, nonce } = sealSecret('value', secret);
    expect(() => openSecret(cipher, nonce, 'b'.repeat(32))).toThrow();
  });

  it('produces a unique nonce per seal', () => {
    const a = sealSecret('value', secret);
    const b = sealSecret('value', secret);
    expect(a.nonce).not.toBe(b.nonce);
  });

  it('hashes passwords and verifies them', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse');
    await expect(
      verifyPassword('correct horse battery staple', hash),
    ).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('computes sha256 hex deterministically', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).not.toBe(sha256Hex('abd'));
  });

  it('provides random bytes of the requested size', () => {
    expect(randomBytes(32)).toHaveLength(32);
  });

  it('compares strings in constant time', () => {
    expect(safeEqual('aaaa', 'aaaa')).toBe(true);
    expect(safeEqual('aaaa', 'aaab')).toBe(false);
    expect(safeEqual('aaa', 'aaaa')).toBe(false);
  });
});

describe('http', () => {
  let server: Server;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    await app.init();
    server = app.getHttpServer() as Server;
  });

  it('GET /healthz returns ok', async () => {
    const res = await request(server).get('/healthz').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /readyz pings the database', async () => {
    const res = await request(server).get('/readyz').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
