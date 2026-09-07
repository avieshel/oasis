import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/db';

export interface ApiKeyRow {
  id: string;
  tenant_id: string;
  name: string;
  key_hash: string;
  allowed_project_keys: string | null;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

export function parseAllowedProjectKeys(raw: string | null): string[] | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === 'string')
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function serializeAllowedProjectKeys(keys: string[] | null): string | null {
  return keys === null ? null : JSON.stringify(keys);
}

@Injectable()
export class ApiKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    data: {
      name: string;
      keyHash: string;
      allowedProjectKeys: string[] | null;
    },
  ): Promise<ApiKeyRow> {
    return this.prisma.api_keys.create({
      data: {
        tenant_id: tenantId,
        name: data.name,
        key_hash: data.keyHash,
        allowed_project_keys: serializeAllowedProjectKeys(
          data.allowedProjectKeys,
        ),
      },
    });
  }

  async findById(tenantId: string, id: string): Promise<ApiKeyRow | null> {
    return this.prisma.api_keys.findFirst({
      where: { tenant_id: tenantId, id },
    });
  }

  async list(tenantId: string): Promise<ApiKeyRow[]> {
    return this.prisma.api_keys.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
    });
  }

  async revoke(tenantId: string, id: string): Promise<boolean> {
    const result = await this.prisma.api_keys.updateMany({
      where: { tenant_id: tenantId, id },
      data: { revoked_at: new Date() },
    });
    return result.count === 1;
  }

  async findByKeyHash(keyHash: string): Promise<ApiKeyRow | null> {
    return this.prisma.api_keys.findUnique({ where: { key_hash: keyHash } });
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.prisma.api_keys.update({
      where: { id },
      data: { last_used_at: new Date() },
    });
  }
}
