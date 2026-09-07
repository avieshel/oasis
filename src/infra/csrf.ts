import type { CookieOptions } from 'express';
import type { Request } from 'express';
import { randomBytes, safeEqual } from './crypto';
import { CSRF_TOKEN_BYTES } from '../config/session';

export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString('base64url');
}

export function csrfTokensMatch(a?: string, b?: string): boolean {
  if (!a || !b) {
    return false;
  }
  return safeEqual(a, b);
}

export function csrfCookieOptions(
  token: string,
  secure: boolean,
): CookieOptions {
  return {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
  };
}

// Same-origin requests are always allowed — the SPA is served from this same
// process, so its origin is the request's own protocol + host. The dev proxy
// origin (:5173) is also allowed for `npm run dev`; CORS_ORIGIN covers any
// split-deployment where the SPA is hosted separately.
export function csrfOriginAllowed(req: Request): boolean {
  const origin = req.header('Origin');
  if (!origin) {
    return true;
  }
  const ownOrigin = `${req.protocol}://${req.headers.host}`;
  if (origin === ownOrigin) {
    return true;
  }
  if (origin === 'http://localhost:5173') {
    return true;
  }
  const configured = process.env.CORS_ORIGIN;
  return Boolean(configured && origin === configured);
}
