import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { sha256Hex } from '../../infra/crypto';
import { ApiKeyInvalidError, ApiKeyRevokedError } from '../../app/errors';
import {
  ApiKeyRepository,
  parseAllowedProjectKeys,
} from './api-keys.repository';
import type { RequestWithApiKey } from './request.types';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly apiKeys: ApiKeyRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithApiKey>();
    const header = request.headers.authorization;

    if (header === undefined || !header.startsWith('Bearer ')) {
      throw new ApiKeyInvalidError();
    }
    const raw = header.slice('Bearer '.length).trim();
    if (raw.length === 0) {
      throw new ApiKeyInvalidError();
    }

    const row = await this.apiKeys.findByKeyHash(sha256Hex(raw));
    if (row === null) {
      throw new ApiKeyInvalidError();
    }
    if (row.revoked_at !== null) {
      throw new ApiKeyRevokedError();
    }

    request.apiKey = {
      id: row.id,
      tenantId: row.tenant_id,
      allowedProjectKeys: parseAllowedProjectKeys(row.allowed_project_keys),
    };

    void this.apiKeys.touchLastUsed(row.id).catch((error: unknown) => {
      this.logger.warn(
        `failed to record api key usage: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return true;
  }
}
