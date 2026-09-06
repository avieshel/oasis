import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SessionManager } from '../../infra/session';
import { SESSION_COOKIE_NAME } from '../../config/session';
import { SessionExpiredError, UnauthorizedError } from '../../app/errors';
import { readCookie, RequestWithSession } from './request.types';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionManager) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const token = readCookie(request, SESSION_COOKIE_NAME);

    if (!token) {
      throw new UnauthorizedError();
    }

    const session = await this.sessions.resolve(token);
    if (!session) {
      throw new SessionExpiredError();
    }

    request.user = session.user;
    request.sessionId = session.id;
    request.tenantId = session.user.tenantId;
    return true;
  }
}
