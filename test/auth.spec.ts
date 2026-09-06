import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

const PASSWORD = 'password123';
const CSRF_COOKIE = 'csrf_token';
const SESSION_COOKIE = 'sid';

interface CsrfBody {
  token: string;
}

interface UserBody {
  user: { id: string; email: string; tenantId: string };
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
  email: string,
  csrfJar: string,
  csrfToken: string,
): Promise<string> {
  const res = await request(server)
    .post('/api/app/signup')
    .set('Cookie', csrfJar)
    .set('x-csrf-token', csrfToken)
    .send({ email, password: PASSWORD });
  return bodyOf<UserBody>(res).user.id;
}

describe('auth :: csrf handshake', () => {
  let server: Server;
  const email = `csrf${Date.now()}@example.com`;

  beforeAll(async () => {
    server = await boot();
  });

  afterAll(() => {
    server.close();
  });

  it('GET /api/app/csrf-token returns a token and sets a non-HttpOnly cookie', async () => {
    const res = await request(server).get('/api/app/csrf-token').expect(200);
    const { token } = bodyOf<CsrfBody>(res);
    expect(token).toEqual(expect.any(String));
    expect(token.length).toBeGreaterThan(0);

    const firstCookie = setCookiesOf(res)[0] ?? '';
    expect(firstCookie).toContain(`${CSRF_COOKIE}=`);
    expect(firstCookie.toLowerCase()).not.toContain('httponly');
  });

  it('rejects signup without a CSRF token', async () => {
    const res = await request(server)
      .post('/api/app/signup')
      .send({ email: `noc${Date.now()}@example.com`, password: PASSWORD })
      .expect(403);
    expect(bodyOf<ErrorBody>(res).error).toBe('CSRF_INVALID');
  });

  it('rejects signup with a mismatched CSRF token', async () => {
    const { jar } = await fetchCsrf(server);
    const res = await request(server)
      .post('/api/app/signup')
      .set('Cookie', jar)
      .set('x-csrf-token', 'definitely-wrong-token')
      .send({ email: `mis${Date.now()}@example.com`, password: PASSWORD })
      .expect(403);
    expect(bodyOf<ErrorBody>(res).error).toBe('CSRF_INVALID');
  });

  it('accepts signup with a valid CSRF token', async () => {
    const { jar, token } = await fetchCsrf(server);
    const res = await request(server)
      .post('/api/app/signup')
      .set('Cookie', jar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD })
      .expect(201);
    const { user } = bodyOf<UserBody>(res);
    expect(user.email).toBe(email);
    expect(user.tenantId).toEqual(expect.any(String));
  });
});

describe('auth :: login, logout, me', () => {
  let server: Server;
  const email = `login${Date.now()}@example.com`;

  async function login(
    loginEmail: string,
    password: string,
  ): Promise<{ jar: string; res: request.Response; csrfToken: string }> {
    const { jar, token } = await fetchCsrf(server);
    const res = await request(server)
      .post('/api/app/auth/login')
      .set('Cookie', jar)
      .set('x-csrf-token', token)
      .send({ email: loginEmail, password });
    return { jar: cookieJar(res), res, csrfToken: token };
  }

  beforeAll(async () => {
    server = await boot();
    const { jar, token } = await fetchCsrf(server);
    await signup(server, email, jar, token);
  });

  afterAll(() => {
    server.close();
  });

  it('rejects login without CSRF token', async () => {
    const res = await request(server)
      .post('/api/app/auth/login')
      .send({ email, password: PASSWORD })
      .expect(403);
    expect(bodyOf<ErrorBody>(res).error).toBe('CSRF_INVALID');
  });

  it('rejects wrong password with the same generic error as unknown email', async () => {
    const wrong = await login(email, 'wrong-password');
    expect(wrong.res.status).toBe(401);
    expect(bodyOf<ErrorBody>(wrong.res).error).toBe('INVALID_CREDENTIALS');

    const unknown = await login(`ghost${Date.now()}@example.com`, PASSWORD);
    expect(unknown.res.status).toBe(401);
    expect(bodyOf<ErrorBody>(unknown.res).error).toBe('INVALID_CREDENTIALS');
  });

  it('logs in, sets an HttpOnly session cookie, and returns the user', async () => {
    const { res } = await login(email, PASSWORD);
    expect(res.status).toBe(200);
    const { user } = bodyOf<UserBody>(res);
    expect(user.email).toBe(email);
    expect(user.tenantId).toEqual(expect.any(String));

    const sessionCookie = setCookiesOf(res)[0] ?? '';
    expect(sessionCookie).toContain(`${SESSION_COOKIE}=`);
    expect(sessionCookie.toLowerCase()).toContain('httponly');
  });

  it('GET /api/app/auth/me returns the user with the session cookie', async () => {
    const { jar } = await login(email, PASSWORD);
    const res = await request(server)
      .get('/api/app/auth/me')
      .set('Cookie', jar)
      .expect(200);
    expect(bodyOf<UserBody>(res).user.email).toBe(email);
  });

  it('GET /api/app/auth/me without a session returns 401 UNAUTHORIZED', async () => {
    const res = await request(server).get('/api/app/auth/me').expect(401);
    expect(bodyOf<ErrorBody>(res).error).toBe('UNAUTHORIZED');
  });

  it('rotates the session on login: old session dies, csrf cookie survives', async () => {
    const { jar, token } = await fetchCsrf(server);

    const first = await request(server)
      .post('/api/app/auth/login')
      .set('Cookie', jar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD })
      .expect(200);
    const firstSessionJar = cookieJar(first);

    const second = await request(server)
      .post('/api/app/auth/login')
      .set('Cookie', jar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD })
      .expect(200);
    const secondSessionJar = cookieJar(second);

    expect(secondSessionJar).not.toBe(firstSessionJar);

    const stale = await request(server)
      .get('/api/app/auth/me')
      .set('Cookie', firstSessionJar)
      .expect(401);
    expect(bodyOf<ErrorBody>(stale).error).toBe('SESSION_EXPIRED');

    const logoutWithOldCsrf = await request(server)
      .post('/api/app/auth/logout')
      .set('Cookie', `${jar}; ${secondSessionJar}`)
      .set('x-csrf-token', token)
      .expect(200);
    expect(bodyOf<StatusBody>(logoutWithOldCsrf).status).toBe('logged_out');
  });

  it('kills a second browser session when the user logs in again', async () => {
    const browserA = await login(email, PASSWORD);
    const browserB = await login(email, PASSWORD);

    await request(server)
      .get('/api/app/auth/me')
      .set('Cookie', browserA.jar)
      .expect(401);
    await request(server)
      .get('/api/app/auth/me')
      .set('Cookie', browserB.jar)
      .expect(200);
  });

  it('logout clears the session; a replayed old cookie is rejected', async () => {
    const { jar } = await login(email, PASSWORD);

    const { jar: csrfJar, token } = await fetchCsrf(server);
    await request(server)
      .post('/api/app/auth/logout')
      .set('Cookie', `${csrfJar}; ${jar}`)
      .set('x-csrf-token', token)
      .expect(200);

    const replayed = await request(server)
      .get('/api/app/auth/me')
      .set('Cookie', jar)
      .expect(401);
    expect(bodyOf<ErrorBody>(replayed).error).toBe('SESSION_EXPIRED');
  });
});

describe('auth :: idle expiry', () => {
  let server: Server;
  const email = `idle${Date.now()}@example.com`;

  beforeAll(async () => {
    process.env.SESSION_IDLE_TTL_MS = '100';
    process.env.SESSION_ABSOLUTE_TTL_MS = '60000';
    server = await boot();
    const { jar, token } = await fetchCsrf(server);
    await signup(server, email, jar, token);
  });

  afterAll(() => {
    server.close();
    delete process.env.SESSION_IDLE_TTL_MS;
    delete process.env.SESSION_ABSOLUTE_TTL_MS;
  });

  it('expires an idle session after the idle window passes', async () => {
    const { jar: csrfJar, token } = await fetchCsrf(server);
    const loginRes = await request(server)
      .post('/api/app/auth/login')
      .set('Cookie', csrfJar)
      .set('x-csrf-token', token)
      .send({ email, password: PASSWORD })
      .expect(200);
    const sessionJar = cookieJar(loginRes);

    await new Promise((resolve) => setTimeout(resolve, 250));

    const res = await request(server)
      .get('/api/app/auth/me')
      .set('Cookie', `${csrfJar}; ${sessionJar}`)
      .expect(401);
    expect(bodyOf<ErrorBody>(res).error).toBe('SESSION_EXPIRED');
  });
});

describe('auth :: login rate limit', () => {
  let server: Server;

  beforeAll(async () => {
    server = await boot();
  });

  afterAll(() => {
    server.close();
  });

  it('returns 429 once the login budget is exhausted', async () => {
    const { jar, token } = await fetchCsrf(server);
    let rateLimited = false;
    for (let i = 0; i < 105 && !rateLimited; i++) {
      const res = await request(server)
        .post('/api/app/auth/login')
        .set('Cookie', jar)
        .set('x-csrf-token', token)
        .send({ email: `nope${i}@example.com` });
      if (res.status === 429) {
        rateLimited = true;
        break;
      }
      expect([400, 401]).toContain(res.status);
    }
    expect(rateLimited).toBe(true);
  });
});
