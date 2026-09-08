import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import {
  ApiKeyInvalidError,
  ApiKeyRevokedError,
  SessionExpiredError,
  UnauthorizedError,
} from '../../app/errors';
import { sha256Hex } from '../../infra/crypto';
import { SessionManager } from '../../infra/session';
import {
  ApiKeyRepository,
  parseAllowedProjectKeys,
} from '../api-keys/api-keys.repository';
import { Principal } from './models';
import { SESSION_COOKIE_NAME } from '../../config/session';

interface RequestWithPrincipal extends Request {
  principal?: Principal;
  tenantId?: string;
  user?: { id: string; tenantId: string; email: string; name?: string | null };
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly apiKeyRepo: ApiKeyRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();

    const cookies = request.cookies as
      Record<string, string | undefined> | undefined;
    const sessionToken = cookies?.[SESSION_COOKIE_NAME];
    if (sessionToken) {
      const session = await this.sessionManager.resolve(sessionToken);
      if (session) {
        request.principal = {
          type: 'user',
          id: session.user.id,
          tenantId: session.user.tenantId,
          email: session.user.email,
          name: undefined,
        };
        request.tenantId = session.user.tenantId;
        request.user = session.user;
        return true;
      }
      throw new SessionExpiredError();
    }

    const authHeader: string | undefined = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const rawKey = authHeader.slice(7).trim();
      if (rawKey.length > 0) {
        const keyHash = sha256Hex(rawKey);
        const row = await this.apiKeyRepo.findByKeyHash(keyHash);
        if (row === null) {
          throw new ApiKeyInvalidError();
        }
        if (row.revoked_at !== null) {
          throw new ApiKeyRevokedError();
        }
        request.principal = {
          type: 'api_key',
          id: row.id,
          tenantId: row.tenant_id,
          allowedProjectKeys: parseAllowedProjectKeys(row.allowed_project_keys),
        };
        request.tenantId = row.tenant_id;
        void this.apiKeyRepo.touchLastUsed(row.id).catch(() => {});
        return true;
      }
      throw new ApiKeyInvalidError();
    }

    throw new UnauthorizedError();
  }
}
