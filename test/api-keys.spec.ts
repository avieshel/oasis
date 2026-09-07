import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';

const PASSWORD = 'password123';
const SITE_URL = 'https://acme.atlassian.net';
const CONNECT_URL = `${SITE_URL}/rest/api/3/myself`;
const SERVER_INFO_URL = `${SITE_URL}/rest/api/3/serverInfo`;
const PROJECTS_URL = `${SITE_URL}/rest/api/3/project/search?maxResults=100`;
const ISSUE_URL = `${SITE_URL}/rest/api/3/issue`;

interface CsrfBody {
  token: string;
}

interface ErrorBody {
  error: string;
}

interface ApiKeyMeta {
  id: string;
  name: string;
  allowedProjectKeys: string[] | null;
}

interface CreatedKey {
  key: ApiKeyMeta;
  rawKey: string;
}

function bodyOf<T>(res: request.Response): T {
  return res.body as T;
}

function cookieJar(res: request.Response): string {
  const raw = res.headers['set-cookie'] as string | string[] | undefined;
  if (raw === undefined) {
    return '';
  }
  return (Array.isArray(raw) ? raw : [raw])
    .map((c) => c.split(';')[0])
    .filter((c) => c.length > 0)
    .join('; ');
}

async function boot(): Promise<Server> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz'] });
  await app.init();
  return app.getHttpServer() as Server;
}

async function fetchCsrf(
  server: Server,
): Promise<{ jar: string; token: string }> {
  const res = await request(server).get('/api/app/csrf-token').expect(200);
  return { jar: cookieJar(res), token: bodyOf<CsrfBody>(res).token };
}

type FetchHandler = (url: string, init?: RequestInit) => Response;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(handler: FetchHandler): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown, init?: RequestInit) =>
      Promise.resolve(handler(String(input), init)),
    ),
  );
}

function resetFetch(): void {
  vi.unstubAllGlobals();
}

async function signupAndLogin(
  server: Server,
  email: string,
): Promise<{ jar: string; token: string }> {
  const { jar: csrfJar, token } = await fetchCsrf(server);
  await request(server)
    .post('/api/app/signup')
    .set('Cookie', csrfJar)
    .set('x-csrf-token', token)
    .send({ email, password: PASSWORD });
  const login = await request(server)
    .post('/api/app/auth/login')
    .set('Cookie', csrfJar)
    .set('x-csrf-token', token)
    .send({ email, password: PASSWORD })
    .expect(200);
  return { jar: `${csrfJar}; ${cookieJar(login)}`, token };
}

describe('api keys :: management and rest tickets', () => {
  let server: Server;
  let email: string;
  let authedJar: string;
  let csrfTokenValue: string;
  let scopedKey: CreatedKey;
  let wildcardKey: CreatedKey;

  beforeAll(async () => {
    server = await boot();
    email = `keys${Date.now()}@example.com`;
    const ctx = await signupAndLogin(server, email);
    authedJar = ctx.jar;
    csrfTokenValue = ctx.token;

    scopedKey = bodyOf<CreatedKey>(
      await request(server)
        .post('/api/app/api-keys')
        .set('Cookie', authedJar)
        .set('x-csrf-token', csrfTokenValue)
        .send({ name: 'scanner', allowed_project_keys: ['MYPRJ'] })
        .expect(201),
    );
    wildcardKey = bodyOf<CreatedKey>(
      await request(server)
        .post('/api/app/api-keys')
        .set('Cookie', authedJar)
        .set('x-csrf-token', csrfTokenValue)
        .send({ name: 'everything' })
        .expect(201),
    );
  });

  afterAll(() => {
    resetFetch();
    server.close();
  });

  it('requires a session to create an api key', async () => {
    const { jar: csrfJar, token } = await fetchCsrf(server);
    const res = await request(server)
      .post('/api/app/api-keys')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({ name: 'nope' });
    expect(res.status).toBe(401);
    expect(bodyOf<ErrorBody>(res).error).toBe('UNAUTHORIZED');
  });

  it('mints a raw key exactly once per creation and lists its metadata', async () => {
    expect(scopedKey.rawKey.length).toBeGreaterThan(32);
    expect(scopedKey.key.allowedProjectKeys).toEqual(['MYPRJ']);
    expect(scopedKey.key.name).toBe('scanner');

    const list = await request(server)
      .get('/api/app/api-keys')
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .expect(200);
    const items = bodyOf<ApiKeyMeta[]>(list);
    expect(items.map((k) => k.id)).toContain(scopedKey.key.id);
    expect(items[0]).not.toHaveProperty('rawKey');
    expect(items[0]).not.toHaveProperty('keyHash');
  });

  it('rejects an invalid api key payload', async () => {
    const res = await request(server)
      .post('/api/app/api-keys')
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .send({ name: '', allowed_project_keys: ['bad key'] });
    expect(res.status).toBe(400);
    expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
  });

  it('ties a jira connection to the api key and reports status', async () => {
    mockFetch((url) => {
      if (url === CONNECT_URL) {
        return jsonResponse({
          accountId: 'key123',
          accountType: 'atlassian',
          active: true,
          displayName: 'Key Bot',
        });
      }
      if (url === SERVER_INFO_URL) {
        return jsonResponse({
          cloudId: 'cloud-key',
          deploymentType: 'Cloud',
          version: '1001',
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    await request(server)
      .post(`/api/app/api-keys/${scopedKey.key.id}/jira/connect`)
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .send({
        site_url: SITE_URL,
        email: 'service@example.com',
        api_token: 'tok',
      })
      .expect(200);

    const status = await request(server)
      .get(`/api/app/api-keys/${scopedKey.key.id}/jira/status`)
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .expect(200);
    expect(
      bodyOf<{ connected: boolean; email: string }>(status).connected,
    ).toBe(true);
    expect(bodyOf<{ email: string }>(status).email).toBe('service@example.com');
    resetFetch();
  });

  it('creates a ticket via the api key and serves the key-scoped cache', async () => {
    mockFetch((url, init) => {
      if (url === PROJECTS_URL) {
        return jsonResponse({ values: [{ key: 'MYPRJ', name: 'My Project' }] });
      }
      if (url === ISSUE_URL && init?.method === 'POST') {
        return jsonResponse({ id: '20001', key: 'MYPRJ-11', self: 'x' }, 201);
      }
      throw new Error(`unexpected url ${url} ${init?.method ?? ''}`);
    });

    const create = await request(server)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${scopedKey.rawKey}`)
      .send({
        project_key: 'MYPRJ',
        title: 'Scanner finding',
        description: 'from CI',
      })
      .expect(201);
    expect(bodyOf<{ key: string }>(create).key).toBe('MYPRJ-11');
    expect(bodyOf<{ url: string }>(create).url).toBe(
      `${SITE_URL}/browse/MYPRJ-11`,
    );
    resetFetch();

    mockFetch(() => {
      throw new Error('must not call Jira when the key cache is fresh');
    });
    const recent = await request(server)
      .get('/api/v1/tickets/recent?project_key=MYPRJ')
      .set('Authorization', `Bearer ${scopedKey.rawKey}`)
      .expect(200);
    const items = bodyOf<Array<{ key: string; title: string }>>(recent);
    expect(items[0].key).toBe('MYPRJ-11');
    expect(items[0].title).toBe('Scanner finding');
    resetFetch();
  });

  it('enforces the allowed project scope on the api key', async () => {
    const other = bodyOf<CreatedKey>(
      await request(server)
        .post('/api/app/api-keys')
        .set('Cookie', authedJar)
        .set('x-csrf-token', csrfTokenValue)
        .send({ name: 'only-oranges', allowed_project_keys: ['ORANGES'] })
        .expect(201),
    );
    mockFetch((url, init) => {
      if (url === PROJECTS_URL) {
        return jsonResponse({
          values: [
            { key: 'ORANGES', name: 'Oranges' },
            { key: 'MYPRJ', name: 'My Project' },
          ],
        });
      }
      if (url === ISSUE_URL && init?.method === 'POST') {
        return jsonResponse({ id: '20002', key: 'MYPRJ-12', self: 'x' }, 201);
      }
      throw new Error(`unexpected url ${url}`);
    });
    const res = await request(server)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${other.rawKey}`)
      .send({
        project_key: 'MYPRJ',
        title: 'Not allowed',
        description: 'x',
      });
    expect(res.status).toBe(403);
    expect(bodyOf<ErrorBody>(res).error).toBe('API_KEY_PROJECT_FORBIDDEN');
    resetFetch();
  });

  it('treats wildcard keys as allowed for any project', async () => {
    mockFetch((url) => {
      if (url === CONNECT_URL) {
        return jsonResponse({
          accountId: 'wild123',
          accountType: 'atlassian',
          active: true,
          displayName: 'Wild',
        });
      }
      if (url === SERVER_INFO_URL) {
        return jsonResponse({
          cloudId: 'cloud-wild',
          deploymentType: 'Cloud',
          version: '1001',
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    await request(server)
      .post(`/api/app/api-keys/${wildcardKey.key.id}/jira/connect`)
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .send({ site_url: SITE_URL, email: 'wild@example.com', api_token: 'tok' })
      .expect(200);

    mockFetch((url, init) => {
      if (url === PROJECTS_URL) {
        return jsonResponse({
          values: [
            { key: 'ORANGES', name: 'Oranges' },
            { key: 'MYPRJ', name: 'My Project' },
          ],
        });
      }
      if (url === ISSUE_URL && init?.method === 'POST') {
        return jsonResponse({ id: '20003', key: 'ORANGES-1', self: 'x' }, 201);
      }
      if (url === SERVER_INFO_URL) {
        return jsonResponse({
          cloudId: 'cloud-wild',
          deploymentType: 'Cloud',
          version: '1001',
        });
      }
      if (url === CONNECT_URL) {
        return jsonResponse({
          accountId: 'wild123',
          accountType: 'atlassian',
          active: true,
          displayName: 'Wild',
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    const res = await request(server)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${wildcardKey.rawKey}`)
      .send({ project_key: 'ORANGES', title: 'Any', description: 'x' })
      .expect(201);
    expect(bodyOf<{ key: string }>(res).key).toBe('ORANGES-1');
    resetFetch();
  });

  it('rejects an unknown bearer token', async () => {
    const res = await request(server)
      .post('/api/v1/tickets')
      .set('Authorization', 'Bearer not-a-real-key')
      .send({ project_key: 'MYPRJ', title: 'x', description: 'x' });
    expect(res.status).toBe(401);
    expect(bodyOf<ErrorBody>(res).error).toBe('API_KEY_INVALID');
  });

  it('rejects a revoked api key and then treats it as invalid again', async () => {
    const doomed = bodyOf<CreatedKey>(
      await request(server)
        .post('/api/app/api-keys')
        .set('Cookie', authedJar)
        .set('x-csrf-token', csrfTokenValue)
        .send({ name: 'doomed' })
        .expect(201),
    );
    await request(server)
      .delete(`/api/app/api-keys/${doomed.key.id}`)
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .expect(200);

    const res = await request(server)
      .post('/api/v1/tickets')
      .set('Authorization', `Bearer ${doomed.rawKey}`)
      .send({ project_key: 'MYPRJ', title: 'x', description: 'x' });
    expect(res.status).toBe(401);
    expect(bodyOf<ErrorBody>(res).error).toBe('API_KEY_REVOKED');
  });

  it('cannot manage another tenant’s api key', async () => {
    const otherEmail = `keys-other-${Date.now()}@example.com`;
    const other = await signupAndLogin(server, otherEmail);
    const theirKey = bodyOf<CreatedKey>(
      await request(server)
        .post('/api/app/api-keys')
        .set('Cookie', other.jar)
        .set('x-csrf-token', other.token)
        .send({ name: 'theirs' })
        .expect(201),
    );

    const res = await request(server)
      .delete(`/api/app/api-keys/${theirKey.key.id}`)
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue);
    expect(res.status).toBe(404);
    expect(bodyOf<ErrorBody>(res).error).toBe('NOT_FOUND');

    const list = await request(server)
      .get('/api/app/api-keys')
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .expect(200);
    const items = bodyOf<ApiKeyMeta[]>(list);
    expect(items.map((k) => k.id)).not.toContain(theirKey.key.id);
  });
});
