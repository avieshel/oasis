import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaService } from '../src/infra/db';
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
interface SessionJar {
  jar: string;
  token: string;
}
interface OasisItemLike {
  id: string;
  status: string;
  severity: string;
  itemType: string;
  jiraKey: string | null;
  jiraUrl: string | null;
}
interface ItemsPage {
  items: OasisItemLike[];
  total: number;
}
interface ItemsSummary {
  new: number;
  closed: number;
  jiraTicket: number;
  total: number;
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

async function fetchCsrf(server: Server): Promise<SessionJar> {
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

async function signupLogin(server: Server, email: string): Promise<SessionJar> {
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

async function signupLoginTenant(
  server: Server,
  email: string,
): Promise<{ session: SessionJar; tenantId: string }> {
  const session = await signupLogin(server, email);
  const prisma = new PrismaService();
  const rows = await prisma.users.findMany({
    where: { email },
    select: { tenant_id: true },
  });
  await prisma.$disconnect();
  return { session, tenantId: rows[0]?.tenant_id ?? '' };
}

function listItems(
  server: Server,
  session: SessionJar,
  query = '',
): request.Test {
  return request(server)
    .get(`/api/app/items${query}`)
    .set('Cookie', session.jar)
    .set('x-csrf-token', session.token);
}

function generateItem(server: Server, session: SessionJar): request.Test {
  return request(server)
    .post('/api/app/items/random')
    .set('Cookie', session.jar)
    .set('x-csrf-token', session.token);
}

describe('oasis items :: tenant-scoped findings with triage actions', () => {
  let server: Server;
  let email: string;
  let session: SessionJar;

  beforeAll(async () => {
    server = await boot();
    email = `items${Date.now()}@example.com`;
    session = await signupLogin(server, email);
  });

  afterAll(() => {
    resetFetch();
    server.close();
  });

  it('requires a session to list items', async () => {
    const res = await request(server).get('/api/app/items');
    expect(res.status).toBe(401);
    expect(bodyOf<ErrorBody>(res).error).toBe('UNAUTHORIZED');
  });

  it('seeds 5 items for a fresh tenant on first list, one with a jira link', async () => {
    const res = await listItems(server, session).expect(200);
    const page = bodyOf<ItemsPage>(res);
    expect(page.items.length).toBeGreaterThanOrEqual(5);
    const statuses = new Set(page.items.map((i) => i.status));
    expect(statuses.has('new')).toBe(true);
    expect(statuses.has('closed')).toBe(true);
    expect(statuses.has('jira-ticket')).toBe(true);
    const linked = page.items.find((i) => i.status === 'jira-ticket');
    expect(linked?.jiraUrl).toBeTruthy();
    expect(linked?.jiraKey).toBeTruthy();
  });

  it('filters by status and severity and enforces the limit', async () => {
    const closed = bodyOf<ItemsPage>(
      await listItems(server, session, '?status=closed').expect(200),
    );
    expect(closed.items.length).toBeGreaterThan(0);
    for (const item of closed.items) {
      expect(item.status).toBe('closed');
    }

    const critical = bodyOf<ItemsPage>(
      await listItems(server, session, '?severity=critical').expect(200),
    );
    for (const item of critical.items) {
      expect(item.severity).toBe('critical');
    }

    const limited = bodyOf<ItemsPage>(
      await listItems(server, session, '?limit=2').expect(200),
    );
    expect(limited.items.length).toBe(2);
    expect(limited.total).toBe(2);
  });

  it('rejects invalid filters', async () => {
    const badStatus = await listItems(server, session, '?status=bogus');
    expect(badStatus.status).toBe(400);
    expect(bodyOf<ErrorBody>(badStatus).error).toBe('VALIDATION_ERROR');

    const badLimit = await listItems(server, session, '?limit=999');
    expect(badLimit.status).toBe(400);
    expect(bodyOf<ErrorBody>(badLimit).error).toBe('VALIDATION_ERROR');
  });

  it('reports a status summary', async () => {
    const res = await request(server)
      .get('/api/app/items/summary')
      .set('Cookie', session.jar)
      .expect(200);
    const summary = bodyOf<ItemsSummary>(res);
    expect(summary.new).toBeGreaterThan(0);
    expect(summary.closed).toBeGreaterThan(0);
    expect(summary.jiraTicket).toBeGreaterThan(0);
    expect(summary.total).toBe(
      summary.new + summary.closed + summary.jiraTicket,
    );
  });

  it('generates a random item and audits it', async () => {
    const before = bodyOf<ItemsPage>(
      await listItems(server, session).expect(200),
    );
    const created = bodyOf<OasisItemLike>(
      await generateItem(server, session).expect(201),
    );
    expect(created.id).toBeTruthy();
    expect(['new', 'closed', 'jira-ticket']).toContain(created.status);
    expect(created.severity).toBeTruthy();

    const after = bodyOf<ItemsPage>(
      await listItems(server, session).expect(200),
    );
    expect(after.total).toBe(before.total + 1);

    const prisma = new PrismaService();
    const audit = await prisma.audit_log.count({
      where: { action: 'item_generate', target: created.id },
    });
    await prisma.$disconnect();
    expect(audit).toBe(1);
  });

  it('closes and reopens an item', async () => {
    const list = bodyOf<ItemsPage>(
      await listItems(server, session).expect(200),
    );
    const target = list.items.find((i) => i.status === 'new');
    expect(target).toBeDefined();

    const closed = await request(server)
      .patch(`/api/app/items/${target?.id}`)
      .set('Cookie', session.jar)
      .set('x-csrf-token', session.token)
      .send({ status: 'closed' })
      .expect(200);
    expect(bodyOf<OasisItemLike>(closed).status).toBe('closed');

    const reopened = await request(server)
      .patch(`/api/app/items/${target?.id}`)
      .set('Cookie', session.jar)
      .set('x-csrf-token', session.token)
      .send({ status: 'new' })
      .expect(200);
    expect(bodyOf<OasisItemLike>(reopened).status).toBe('new');

    const invalid = await request(server)
      .patch(`/api/app/items/${target?.id}`)
      .set('Cookie', session.jar)
      .set('x-csrf-token', session.token)
      .send({ status: 'jira-ticket' });
    expect(invalid.status).toBe(400);
    expect(bodyOf<ErrorBody>(invalid).error).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for an unknown item id', async () => {
    const res = await request(server)
      .patch('/api/app/items/nonexistent-id')
      .set('Cookie', session.jar)
      .set('x-csrf-token', session.token)
      .send({ status: 'closed' });
    expect(res.status).toBe(404);
    expect(bodyOf<ErrorBody>(res).error).toBe('NOT_FOUND');
  });

  it('creates a jira ticket for an item, links it, and surfaces the link', async () => {
    mockFetch((url) => {
      if (url === CONNECT_URL) {
        return jsonResponse({
          accountId: 'item-user',
          accountType: 'atlassian',
          active: true,
          displayName: 'Item User',
        });
      }
      if (url === SERVER_INFO_URL) {
        return jsonResponse({
          cloudId: 'cloud-item',
          deploymentType: 'Cloud',
          version: '1001',
        });
      }
      throw new Error(`unexpected url ${url}`);
    });
    await request(server)
      .post('/api/app/jira/connect')
      .set('Cookie', session.jar)
      .set('x-csrf-token', session.token)
      .send({
        site_url: SITE_URL,
        email: 'item@example.com',
        api_token: 'tok',
      })
      .expect(200);
    resetFetch();

    const list = bodyOf<ItemsPage>(
      await listItems(server, session).expect(200),
    );
    const target = list.items.find((i) => i.status === 'new');
    expect(target?.id).toBeTruthy();

    mockFetch((url, init) => {
      if (url === PROJECTS_URL) {
        return jsonResponse({ values: [{ key: 'MYPRJ', name: 'My Project' }] });
      }
      if (url === ISSUE_URL && init?.method === 'POST') {
        return jsonResponse({ id: '20001', key: 'MYPRJ-42', self: 'x' }, 201);
      }
      throw new Error(`unexpected url ${url} ${init?.method ?? ''}`);
    });

    const created = await request(server)
      .post(`/api/app/items/${target?.id}/ticket`)
      .set('Cookie', session.jar)
      .set('x-csrf-token', session.token)
      .send({ project_key: 'MYPRJ' })
      .expect(201);
    const payload = bodyOf<{
      item: OasisItemLike;
      ticket: { key: string; url: string };
    }>(created);
    expect(payload.ticket.key).toBe('MYPRJ-42');
    expect(payload.item.status).toBe('jira-ticket');
    expect(payload.item.jiraKey).toBe('MYPRJ-42');
    expect(payload.item.jiraUrl).toBe(`${SITE_URL}/browse/MYPRJ-42`);
    resetFetch();

    const after = bodyOf<ItemsPage>(
      await listItems(server, session).expect(200),
    );
    const updated = after.items.find((i) => i.id === target?.id);
    expect(updated?.jiraUrl).toBe(`${SITE_URL}/browse/MYPRJ-42`);
  });

  it('scopes items and triage by tenant', async () => {
    const otherEmail = `items-other${Date.now()}@example.com`;
    const other = await signupLoginTenant(server, otherEmail);
    const listA = bodyOf<ItemsPage>(
      await listItems(server, session).expect(200),
    );
    const listB = bodyOf<ItemsPage>(
      await listItems(server, other.session).expect(200),
    );
    expect(listA.items.length).toBeGreaterThan(0);
    expect(listB.items.length).toBeGreaterThan(0);

    const aIds = new Set(listA.items.map((i) => i.id));
    expect(listB.items.some((i) => aIds.has(i.id))).toBe(false);
    expect(listA.items.some((i) => i.id === listB.items[0].id)).toBe(false);

    const prisma = new PrismaService();
    const rowA = await prisma.oasis_items.findFirst({
      where: { id: listA.items[0].id },
    });
    const rowB = await prisma.oasis_items.findFirst({
      where: { id: listB.items[0].id },
    });
    await prisma.$disconnect();
    expect(rowA?.tenant_id).not.toBe(rowB?.tenant_id);
    expect(rowB?.tenant_id).toBe(other.tenantId);

    const crossClose = await request(server)
      .patch(`/api/app/items/${listB.items[0].id}`)
      .set('Cookie', session.jar)
      .set('x-csrf-token', session.token)
      .send({ status: 'closed' });
    expect(crossClose.status).toBe(404);
    expect(bodyOf<ErrorBody>(crossClose).error).toBe('NOT_FOUND');
  });
});
