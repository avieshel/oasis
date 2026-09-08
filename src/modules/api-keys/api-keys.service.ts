import { Injectable } from '@nestjs/common';
import { randomBytes, sha256Hex } from '../../infra/crypto';
import { NotFoundError } from '../../app/errors';
import {
  ApiKeyRepository,
  parseAllowedProjectKeys,
  type ApiKeyRow,
} from './api-keys.repository';

export interface ApiKeyMeta {
  id: string;
  name: string;
  allowedProjectKeys: string[] | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ApiKeyCreated {
  key: ApiKeyMeta;
  rawKey: string;
}

function toMeta(row: ApiKeyRow): ApiKeyMeta {
  return {
    id: row.id,
    name: row.name,
    allowedProjectKeys: parseAllowedProjectKeys(row.allowed_project_keys),
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
  };
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly repository: ApiKeyRepository) {}

  async createKey(
    tenantId: string,
    input: { name: string; allowedProjectKeys?: string[] },
  ): Promise<ApiKeyCreated> {
    const rawKey = randomBytes(32).toString('base64url');
    const row = await this.repository.create(tenantId, {
      name: input.name,
      keyHash: sha256Hex(rawKey),
      allowedProjectKeys: input.allowedProjectKeys ?? null,
    });
    return { key: toMeta(row), rawKey };
  }

  async listKeys(tenantId: string): Promise<ApiKeyMeta[]> {
    const rows = await this.repository.list(tenantId);
    return rows.map(toMeta);
  }

  async revokeKey(tenantId: string, id: string): Promise<void> {
    const revoked = await this.repository.revoke(tenantId, id);
    if (!revoked) {
      throw new NotFoundError('API key');
    }
  }
}
