import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';

const PASSWORD = 'password123';
const SITE_URL = 'https://acme.atlassian.net';
const CONNECT_URL = `${SITE_URL}/rest/api/3/myself`;
const PROJECTS_URL = `${SITE_URL}/rest/api/3/project/search?maxResults=100`;
const ISSUE_URL = `${SITE_URL}/rest/api/3/issue`;

interface CsrfBody {
  token: string;
}

interface ErrorBody {
  error: string;
}

interface StatusBody {
  status: string;
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('jira :: api token connection', () => {
  let server: Server;
  let email: string;
  let authedJar: string;
  let csrfTokenValue: string;

  beforeAll(async () => {
    server = await boot();
    email = `jira${Date.now()}@example.com`;
    const { jar: csrfJar, token } = await fetchCsrf(server);
    csrfTokenValue = token;
    await request(server)
      .post('/api/app/signup')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD });

    const login = await request(server)
      .post('/api/app/auth/login')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD });
    authedJar = `${csrfJar}; ${cookieJar(login)}`;
  });

  afterAll(() => {
    resetFetch();
    server.close();
  });

  it('requires a session before connecting to Jira', async () => {
    const { jar: csrfJar, token } = await fetchCsrf(server);
    const res = await request(server)
      .post('/api/app/jira/connect')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({
        site_url: SITE_URL,
        email: 'a@b.com',
        api_token: 'token',
      });
    expect(res.status).toBe(401);
    expect(bodyOf<ErrorBody>(res).error).toBe('UNAUTHORIZED');
  });

  it('connects and stores the site, returning account info', async () => {
    mockFetch((url) => {
      if (url === CONNECT_URL) {
        return jsonResponse({
          accountId: 'abc123',
          accountType: 'atlassian',
          active: true,
          displayName: 'Ada Lovelace',
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const res = await request(server)
      .post('/api/app/jira/connect')
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .send({ site_url: SITE_URL, email: 'ada@example.com', api_token: 'tok' })
      .expect(200);
    expect(bodyOf<{ connected: boolean; siteUrl: string }>(res).connected).toBe(
      true,
    );
    expect(bodyOf<{ siteUrl: string }>(res).siteUrl).toBe(SITE_URL);
    resetFetch();
  });

  it('rejects an invalid Jira site url', async () => {
    const { jar: csrfJar, token } = await fetchCsrf(server);
    const res = await request(server)
      .post('/api/app/jira/connect')
      .set('Cookie', `${csrfJar}; ${authedJar}`)
      .set('x-csrf-token', token)
      .send({ site_url: 'not-a-url', email: 'x@y.com', api_token: 'tok' })
      .expect(400);
    expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
  });
});

describe('jira :: projects, tickets, recent', () => {
  let server: Server;
  let email: string;
  let authedJar: string;
  let csrfTokenValue: string;

  beforeAll(async () => {
    server = await boot();
    email = `jira2${Date.now()}@example.com`;
    const { jar: csrfJar, token } = await fetchCsrf(server);
    csrfTokenValue = token;
    await request(server)
      .post('/api/app/signup')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD });

    const login = await request(server)
      .post('/api/app/auth/login')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD });
    authedJar = `${csrfJar}; ${cookieJar(login)}`;

    mockFetch((url) => {
      if (url === CONNECT_URL) {
        return jsonResponse({
          accountId: 'abc123',
          accountType: 'atlassian',
          active: true,
          displayName: 'Ada',
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    await request(server)
      .post('/api/app/jira/connect')
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .send({ site_url: SITE_URL, email: 'ada@example.com', api_token: 'tok' })
      .expect(200);
    resetFetch();
  });

  afterAll(() => {
    resetFetch();
    server.close();
  });

  it('lists projects from the connected site', async () => {
    mockFetch((url) => {
      if (url === PROJECTS_URL) {
        return jsonResponse({
          values: [
            {
              key: 'MYPRJ',
              name: 'My Project',
              projectTypeKey: 'software',
            },
          ],
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    const res = await request(server)
      .get('/api/app/jira/projects')
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .expect(200);
    expect(bodyOf<Array<{ key: string }>>(res)[0].key).toBe('MYPRJ');
    resetFetch();
  });

  it('creates a task ticket labelled identityhub-finding', async () => {
    mockFetch((url, init) => {
      if (url === PROJECTS_URL) {
        return jsonResponse({ values: [{ key: 'MYPRJ', name: 'My Project' }] });
      }
      if (url === ISSUE_URL && init?.method === 'POST') {
        const body = typeof init.body === 'string' ? init.body : '';
        const payload = JSON.parse(body) as {
          fields: {
            project: { key: string };
            summary: string;
            issuetype: { name: string };
            labels: string[];
          };
        };
        expect(payload.fields.project.key).toBe('MYPRJ');
        expect(payload.fields.issuetype.name).toBe('Task');
        expect(payload.fields.labels).toContain('identityhub-finding');
        return jsonResponse({ id: '10001', key: 'MYPRJ-1', self: 'x' }, 201);
      }
      throw new Error(`unexpected url ${url} ${init?.method ?? ''}`);
    });

    const res = await request(server)
      .post('/api/app/jira/tickets')
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .send({
        project_key: 'MYPRJ',
        title: 'Fix the bug',
        description: 'The bug is here',
      })
      .expect(201);
    expect(bodyOf<{ key: string }>(res).key).toBe('MYPRJ-1');
    expect(bodyOf<{ url: string }>(res).url).toBe(`${SITE_URL}/browse/MYPRJ-1`);
    resetFetch();
  });

  it('returns recent labelled tickets for a project', async () => {
    mockFetch((url) => {
      const parsed = new URL(url);
      const jql = parsed.searchParams.get('jql');
      if (
        parsed.pathname.endsWith('/rest/api/3/search/jql') &&
        jql !== null &&
        jql.includes('MYPRJ') &&
        jql.includes('identityhub-finding')
      ) {
        return jsonResponse({
          issues: [
            {
              key: 'MYPRJ-2',
              fields: {
                summary: 'Another one',
                created: '2026-01-02T10:00:00.000Z',
              },
            },
          ],
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const res = await request(server)
      .get('/api/app/jira/tickets/recent?project_key=MYPRJ')
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .expect(200);
    const items = bodyOf<Array<{ key: string; title: string }>>(res);
    expect(items[0].key).toBe('MYPRJ-2');
    expect(items[0].title).toBe('Another one');
    resetFetch();
  });

  it('surfaces the Jira error message when JQL search fails', async () => {
    mockFetch((url, init) => {
      if (url === PROJECTS_URL) {
        return jsonResponse({ values: [{ key: 'MYPRJ', name: 'My Project' }] });
      }
      if (url === ISSUE_URL && init?.method === 'POST') {
        return jsonResponse({ id: '10003', key: 'MYPRJ-3', self: 'x' }, 201);
      }
      if (url.startsWith(`${SITE_URL}/rest/api/3/search/jql`)) {
        return jsonResponse(
          {
            errorMessages: [
              "The value 'identityhub-finding' does not exist for the field 'labels'.",
            ],
          },
          400,
        );
      }
      throw new Error(`unexpected url ${url} ${init?.method ?? ''}`);
    });

    const create = await request(server)
      .post('/api/app/jira/tickets')
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .send({
        project_key: 'MYPRJ',
        title: 'Fix the bug',
        description: 'The bug is here',
      })
      .expect(201);
    expect(bodyOf<{ key: string }>(create).key).toBe('MYPRJ-3');

    const recent = await request(server)
      .get('/api/app/jira/tickets/recent?project_key=MYPRJ')
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .expect(502);
    const body = bodyOf<{ error: string; detail: string }>(recent);
    expect(body.error).toBe('UPSTREAM_ERROR');
    expect(body.detail).toContain("'labels'");
    resetFetch();
  });

  it('disconnects and clears the stored connection', async () => {
    const res = await request(server)
      .delete('/api/app/jira/connect')
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .expect(200);
    expect(bodyOf<StatusBody>(res).status).toBe('disconnected');

    const status = await request(server)
      .get('/api/app/jira/status')
      .set('Cookie', authedJar)
      .set('x-csrf-token', csrfTokenValue)
      .expect(200);
    expect(bodyOf<{ connected: boolean }>(status).connected).toBe(false);
  });
});
