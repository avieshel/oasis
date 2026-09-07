import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { CsrfInvalidError } from '../../app/errors';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../config/session';
import { csrfOriginAllowed, csrfTokensMatch } from '../../infra/csrf';
import { readCookie } from './request.types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (SAFE_METHODS.has(request.method)) {
      return true;
    }
    if (request.header('Authorization')?.startsWith('Bearer ')) {
      return true;
    }
    if (!csrfOriginAllowed(request.header('Origin'))) {
      throw new CsrfInvalidError();
    }

    const cookieValue = readCookie(request, CSRF_COOKIE_NAME);
    const headerValue = request.header(CSRF_HEADER_NAME);
    if (!csrfTokensMatch(cookieValue, headerValue)) {
      throw new CsrfInvalidError();
    }

    return true;
  }
}
