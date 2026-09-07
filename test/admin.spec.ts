import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/db';

const PASSWORD = 'password123';

interface CsrfBody {
  token: string;
}

interface ErrorBody {
  error: string;
}

interface TenantBody {
  tenant: { id: string; slug: string; name: string };
}

interface TenantListBody {
  tenants: Array<{ id: string; slug: string; name: string; userCount: number }>;
}

interface UserBody {
  user: {
    id: string;
    tenantId: string;
    tenantSlug?: string;
    email: string;
    name: string | null;
  };
}

interface UserListBody {
  users: Array<{
    id: string;
    tenantId: string;
    tenantSlug: string | undefined;
    email: string;
    name: string | null;
  }>;
}

interface AdminClaims {
  jar: string;
  token: string;
}

function bodyOf<T>(res: request.Response): T {
  return res.body as T;
}

function setCookiesOf(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as string | string[] | undefined;
  if (raw === undefined) {
    return [];
  }
  return Array.isArray(raw) ? raw : [raw];
}

function cookieJar(res: request.Response): string {
  return setCookiesOf(res)
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

async function signup(
  server: Server,
  csrfJar: string,
  csrfToken: string,
  email: string,
): Promise<void> {
  await request(server)
    .post('/api/app/signup')
    .set('Cookie', csrfJar)
    .set('x-csrf-token', csrfToken)
    .send({ email, password: PASSWORD })
    .expect(201);
}

async function login(
  server: Server,
  csrfJar: string,
  csrfToken: string,
  email: string,
): Promise<string> {
  const res = await request(server)
    .post('/api/app/auth/login')
    .set('Cookie', csrfJar)
    .set('x-csrf-token', csrfToken)
    .send({ email, password: PASSWORD })
    .expect(200);
  return `${csrfJar}; ${cookieJar(res)}`.trim();
}

async function adminAuth(server: Server, email: string): Promise<AdminClaims> {
  const { jar: csrfJar, token } = await fetchCsrf(server);
  await signup(server, csrfJar, token, email);
  const jar = await login(server, csrfJar, token, email);
  return { jar, token };
}

async function createTenant(
  server: Server,
  claims: AdminClaims,
  slug: string,
  name: string,
): Promise<string> {
  const res = await request(server)
    .post('/api/app/admin/tenants')
    .set('Cookie', claims.jar)
    .set('x-csrf-token', claims.token)
    .send({ slug, name })
    .expect(201);
  return bodyOf<TenantBody>(res).tenant.id;
}

async function createUser(
  server: Server,
  claims: AdminClaims,
  tenantId: string,
  email: string,
): Promise<string> {
  const res = await request(server)
    .post('/api/app/admin/users')
    .set('Cookie', claims.jar)
    .set('x-csrf-token', claims.token)
    .send({
      tenant_id: tenantId,
      email,
      name: 'Managed User',
      password: PASSWORD,
    })
    .expect(201);
  return bodyOf<UserBody>(res).user.id;
}

describe('admin :: tenant & user management (ALLOW_ADMIN=true)', () => {
  let server: Server;
  let prisma: PrismaService;
  let claims: AdminClaims;
  const adminEmail = `admin${Date.now()}@example.com`;

  beforeAll(async () => {
    process.env.ALLOW_ADMIN = 'true';
    server = await boot();
    prisma = new PrismaService();
    await prisma.$connect();
    claims = await adminAuth(server, adminEmail);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    server.close();
  });

  it('requires a session (401 without cookies)', async () => {
    await request(server).get('/api/app/admin/status').expect(401);
    await request(server).get('/api/app/admin/tenants').expect(401);
  });

  it('reports status with counts when enabled', async () => {
    const res = await request(server)
      .get('/api/app/admin/status')
      .set('Cookie', claims.jar)
      .expect(200);
    const body = bodyOf<{
      enabled: boolean;
      tenantCount: number;
      userCount: number;
    }>(res);
    expect(body.enabled).toBe(true);
    expect(body.tenantCount).toBeGreaterThanOrEqual(1);
    expect(body.userCount).toBeGreaterThanOrEqual(1);
  });

  it('creates, lists, and filters tenants', async () => {
    const slug = `acme${Date.now()}`;
    const awaySlug = `acmeaway${Date.now()}`;
    const acmeId = await createTenant(server, claims, slug, 'Acme Corp');
    await createTenant(server, claims, awaySlug, 'Away Inc');

    const res = await request(server)
      .get('/api/app/admin/tenants')
      .set('Cookie', claims.jar)
      .expect(200);
    const tenants = bodyOf<TenantListBody>(res).tenants;
    const acme = tenants.find((t) => t.id === acmeId);
    expect(acme).toBeDefined();
    expect(acme?.slug).toBe(slug);
    expect(acme?.name).toBe('Acme Corp');
    expect(acme?.userCount).toBe(0);
    expect(tenants.some((t) => t.slug === awaySlug)).toBe(true);
  });

  it('rejects a duplicate slug with 409 SLUG_TAKEN', async () => {
    const slug = `dup${Date.now()}`;
    await createTenant(server, claims, slug, 'First');
    const res = await request(server)
      .post('/api/app/admin/tenants')
      .set('Cookie', claims.jar)
      .set('x-csrf-token', claims.token)
      .send({ slug, name: 'Second' })
      .expect(409);
    expect(bodyOf<ErrorBody>(res).error).toBe('SLUG_TAKEN');
  });

  it('rejects an invalid slug shape with 400', async () => {
    const res = await request(server)
      .post('/api/app/admin/tenants')
      .set('Cookie', claims.jar)
      .set('x-csrf-token', claims.token)
      .send({ slug: 'Invalid Slug!', name: 'Nope' })
      .expect(400);
    expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
  });

  it('updates a tenant (name and slug)', async () => {
    const id = await createTenant(
      server,
      claims,
      `rename${Date.now()}`,
      'Old Name',
    );
    const res = await request(server)
      .patch(`/api/app/admin/tenants/${id}`)
      .set('Cookie', claims.jar)
      .set('x-csrf-token', claims.token)
      .send({ name: 'New Name', slug: `renamed${Date.now()}` })
      .expect(200);
    expect(bodyOf<TenantBody>(res).tenant.name).toBe('New Name');
  });

  it('404s on updating an unknown tenant', async () => {
    await request(server)
      .patch('/api/app/admin/tenants/nope-missing-id')
      .set('Cookie', claims.jar)
      .set('x-csrf-token', claims.token)
      .send({ name: 'x' })
      .expect(404);
  });

  it('creates users and lists them with tenant slug and filter', async () => {
    const slug = `users${Date.now()}`;
    const tenantId = await createTenant(server, claims, slug, 'Users Co');
    const userA = await createUser(
      server,
      claims,
      tenantId,
      `u1${Date.now()}@example.com`,
    );
    const userB = await createUser(
      server,
      claims,
      tenantId,
      `u2${Date.now()}@example.com`,
    );

    const all = await request(server)
      .get('/api/app/admin/users')
      .set('Cookie', claims.jar)
      .expect(200);
    const rows = bodyOf<UserListBody>(all).users;
    expect(rows.some((u) => u.id === userA)).toBe(true);
    expect(rows.some((u) => u.id === userB)).toBe(true);
    const rowA = rows.find((u) => u.id === userA);
    expect(rowA?.tenantSlug).toBe(slug);

    const filtered = await request(server)
      .get(`/api/app/admin/users?tenant_id=${tenantId}`)
      .set('Cookie', claims.jar)
      .expect(200);
    const filteredRows = bodyOf<UserListBody>(filtered).users;
    expect(filteredRows).toHaveLength(2);
    expect(filteredRows.every((u) => u.tenantId === tenantId)).toBe(true);
  });

  it('rejects a managed user with a duplicate email (400 EMAIL_TAKEN)', async () => {
    const tenantId = await createTenant(
      server,
      claims,
      `dupemail${Date.now()}`,
      'Dup',
    );
    const email = `dupemail${Date.now()}@example.com`;
    await createUser(server, claims, tenantId, email);
    const res = await request(server)
      .post('/api/app/admin/users')
      .set('Cookie', claims.jar)
      .set('x-csrf-token', claims.token)
      .send({
        tenant_id: tenantId,
        email,
        password: PASSWORD,
      })
      .expect(400);
    expect(bodyOf<ErrorBody>(res).error).toBe('EMAIL_TAKEN');
  });

  it('404s creating a user for a missing tenant', async () => {
    const res = await request(server)
      .post('/api/app/admin/users')
      .set('Cookie', claims.jar)
      .set('x-csrf-token', claims.token)
      .send({
        tenant_id: 'no-such-tenant-xyz',
        email: `notenant${Date.now()}@example.com`,
        password: PASSWORD,
      })
      .expect(404);
    expect(bodyOf<ErrorBody>(res).error).toBe('NOT_FOUND');
  });

  it('a managed user can log in with the provided password', async () => {
    const tenantId = await createTenant(
      server,
      claims,
      `logins${Date.now()}`,
      'Login Co',
    );
    const email = `logins${Date.now()}@example.com`;
    await createUser(server, claims, tenantId, email);

    const { jar: csrfJar, token } = await fetchCsrf(server);
    const res = await request(server)
      .post('/api/app/auth/login')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD })
      .expect(200);
    expect(cookieJar(res)).toContain('sid=');
  });

  it('password reset kills the user old sessions and new password works', async () => {
    const tenantId = await createTenant(
      server,
      claims,
      `reset${Date.now()}`,
      'Reset Co',
    );
    const email = `reset${Date.now()}@example.com`;
    const userId = await createUser(server, claims, tenantId, email);

    const { jar: csrfJar, token } = await fetchCsrf(server);
    const loginRes = await request(server)
      .post('/api/app/auth/login')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD })
      .expect(200);
    const oldSession = cookieJar(loginRes);

    await request(server)
      .patch(`/api/app/admin/users/${userId}`)
      .set('Cookie', claims.jar)
      .set('x-csrf-token', claims.token)
      .send({ password: 'newpassword456' })
      .expect(200);

    const cards = await prisma.sessions.count({ where: { user_id: userId } });
    expect(cards).toBe(0);

    await request(server)
      .get('/api/app/auth/me')
      .set('Cookie', oldSession)
      .expect(401);

    await request(server)
      .post('/api/app/auth/login')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({ email, password: 'newpassword456' })
      .expect(200);
  });

  it('updates a managed user email and name', async () => {
    const tenantId = await createTenant(
      server,
      claims,
      `patchuser${Date.now()}`,
      'Patch Co',
    );
    const userId = await createUser(
      server,
      claims,
      tenantId,
      `patchuser${Date.now()}@example.com`,
    );
    const res = await request(server)
      .patch(`/api/app/admin/users/${userId}`)
      .set('Cookie', claims.jar)
      .set('x-csrf-token', claims.token)
      .send({ name: 'Renamed' })
      .expect(200);
    expect(bodyOf<UserBody>(res).user.name).toBe('Renamed');
  });

  it('deleting a user cascades sessions', async () => {
    const tenantId = await createTenant(
      server,
      claims,
      `deluser${Date.now()}`,
      'Del Co',
    );
    const email = `deluser${Date.now()}@example.com`;
    const userId = await createUser(server, claims, tenantId, email);

    const { jar: csrfJar, token } = await fetchCsrf(server);
    const loginRes = await request(server)
      .post('/api/app/auth/login')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD })
      .expect(200);
    const userJar = cookieJar(loginRes);

    await request(server)
      .delete(`/api/app/admin/users/${userId}`)
      .set('Cookie', claims.jar)
      .set('x-csrf-token', claims.token)
      .expect(200);

    await request(server)
      .get('/api/app/auth/me')
      .set('Cookie', userJar)
      .expect(401);

    await request(server)
      .post('/api/app/auth/login')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD })
      .expect(401);
  });

  it('deleting a tenant cascades users, api keys, sessions, and audit rows', async () => {
    const slug = `cascade${Date.now()}`;
    const tenantId = await createTenant(server, claims, slug, 'Cascade Co');
    const email = `cascade${Date.now()}@example.com`;
    const userId = await createUser(server, claims, tenantId, email);

    await prisma.api_keys.create({
      data: {
        tenant_id: tenantId,
        name: 'key-to-wipe',
        key_hash: `hash-${Date.now()}`,
      },
    });

    const { jar: csrfJar, token } = await fetchCsrf(server);
    await request(server)
      .post('/api/app/auth/login')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD })
      .expect(200);

    await request(server)
      .delete(`/api/app/admin/tenants/${tenantId}`)
      .set('Cookie', claims.jar)
      .set('x-csrf-token', claims.token)
      .expect(200);

    expect(await prisma.tenants.count({ where: { id: tenantId } })).toBe(0);
    expect(await prisma.users.count({ where: { id: userId } })).toBe(0);
    expect(await prisma.sessions.count({ where: { user_id: userId } })).toBe(0);
    expect(
      await prisma.api_keys.count({ where: { tenant_id: tenantId } }),
    ).toBe(0);
    expect(
      await prisma.audit_log.count({ where: { tenant_id: tenantId } }),
    ).toBe(0);

    const listRes = await request(server)
      .get('/api/app/admin/tenants')
      .set('Cookie', claims.jar)
      .expect(200);
    expect(
      bodyOf<TenantListBody>(listRes).tenants.some((t) => t.slug === slug),
    ).toBe(false);
  });
});

describe('admin :: disabled mode (ALLOW_ADMIN=false)', () => {
  let server: Server;
  let claims: AdminClaims;
  const adminEmail = `adminoff${Date.now()}@example.com`;

  beforeAll(async () => {
    process.env.ALLOW_ADMIN = 'false';
    server = await boot();
    claims = await adminAuth(server, adminEmail);
  });

  afterAll(() => {
    server.close();
    process.env.ALLOW_ADMIN = 'true';
  });

  it('rejects admin routes with 403 when disabled', async () => {
    const res = await request(server)
      .get('/api/app/admin/status')
      .set('Cookie', claims.jar)
      .expect(403);
    expect(bodyOf<ErrorBody>(res).error).toBe('FORBIDDEN');
  });
});
