import type { CookieOptions } from 'express';
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

export function csrfOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }
  if (origin === 'http://localhost:5173') {
    return true;
  }
  const configured = process.env.CORS_ORIGIN;
  return Boolean(configured && origin === configured);
}
