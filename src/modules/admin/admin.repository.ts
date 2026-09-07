import { Injectable } from '@nestjs/common';
import { AuditAction } from '../../infra/audit';
import { PrismaService } from '../../infra/db';

export interface AdminTenantRow {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  userCount: number;
}

export interface AdminUserRow {
  id: string;
  tenantId: string;
  tenantSlug: string | undefined;
  email: string;
  name: string | null;
  createdAt: Date;
}

export interface AdminConnectionRow {
  id: string;
  userId: string | null;
  apiKeyId: string | null;
  apiKeyName: string | null;
  tenantId: string;
  tenantSlug: string | undefined;
  userEmail: string | null;
  mode: string;
  siteUrl: string | null;
  email: string | null;
  hasApiToken: boolean;
  hasOauthTokens: boolean;
  createdAt: Date;
  lastTestedAt: Date | null;
}

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countTenants(): Promise<number> {
    return this.prisma.tenants.count();
  }

  async countUsers(): Promise<number> {
    return this.prisma.users.count();
  }

  async countConnections(): Promise<number> {
    return this.prisma.jira_connections.count();
  }

  async countApiKeys(): Promise<number> {
    return this.prisma.api_keys.count({ where: { revoked_at: null } });
  }

  async countItems(): Promise<number> {
    return this.prisma.oasis_items.count();
  }

  async countTickets(): Promise<number> {
    return this.prisma.audit_log.count({
      where: { action: AuditAction.JIRA_TICKET_CREATE },
    });
  }

  async findTenantById(id: string) {
    return this.prisma.tenants.findUnique({ where: { id } });
  }

  async findTenantBySlug(slug: string) {
    return this.prisma.tenants.findUnique({ where: { slug } });
  }

  async listTenants(): Promise<AdminTenantRow[]> {
    const tenants = await this.prisma.tenants.findMany({
      orderBy: { created_at: 'asc' },
    });
    const counts = await this.prisma.users.groupBy({
      by: ['tenant_id'],
      _count: { _all: true },
    });
    const countByTenant = new Map(
      counts.map((c) => [c.tenant_id, c._count._all]),
    );
    return tenants.map((tenant) => ({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      createdAt: tenant.created_at,
      userCount: countByTenant.get(tenant.id) ?? 0,
    }));
  }

  async createTenant(slug: string, name: string) {
    return this.prisma.tenants.create({ data: { slug, name } });
  }

  async updateTenant(id: string, data: { slug?: string; name?: string }) {
    return this.prisma.tenants.update({
      where: { id },
      data,
    });
  }

  async deleteTenantCascaded(id: string): Promise<void> {
    const users = await this.prisma.users.findMany({
      where: { tenant_id: id },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await this.prisma.$transaction([
      this.prisma.sessions.deleteMany({
        where: { user_id: { in: userIds } },
      }),
      this.prisma.api_keys.deleteMany({ where: { tenant_id: id } }),
      this.prisma.jira_connections.deleteMany({ where: { tenant_id: id } }),
      this.prisma.tickets_cache.deleteMany({ where: { tenant_id: id } }),
      this.prisma.audit_log.deleteMany({ where: { tenant_id: id } }),
      this.prisma.users.deleteMany({ where: { tenant_id: id } }),
      this.prisma.tenants.delete({ where: { id } }),
    ]);
  }

  async findUserById(id: string) {
    return this.prisma.users.findUnique({ where: { id } });
  }

  async findUserByEmail(email: string) {
    return this.prisma.users.findUnique({ where: { email } });
  }

  async listUsers(tenantId?: string): Promise<AdminUserRow[]> {
    const users = await this.prisma.users.findMany({
      where: tenantId === undefined ? undefined : { tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });
    const tenantIds = [...new Set(users.map((u) => u.tenant_id))];
    const tenants =
      tenantIds.length === 0
        ? []
        : await this.prisma.tenants.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, slug: true },
          });
    const slugById = new Map(tenants.map((t) => [t.id, t.slug]));
    return users.map((user) => ({
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      name: user.name,
      createdAt: user.created_at,
      tenantSlug: slugById.get(user.tenant_id),
    }));
  }

  async createUser(
    tenantId: string,
    email: string,
    passwordHash: string,
    name: string | null,
  ) {
    return this.prisma.users.create({
      data: { tenant_id: tenantId, email, password_hash: passwordHash, name },
    });
  }

  async updateUser(
    id: string,
    data: {
      email?: string;
      name?: string;
      password_hash?: string;
    },
  ) {
    return this.prisma.users.update({ where: { id }, data });
  }

  async kickUserSessions(userId: string): Promise<void> {
    await this.prisma.sessions.deleteMany({ where: { user_id: userId } });
  }

  async deleteUserCascaded(id: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.sessions.deleteMany({ where: { user_id: id } }),
      this.prisma.jira_connections.deleteMany({ where: { user_id: id } }),
      this.prisma.tickets_cache.deleteMany({ where: { user_id: id } }),
      this.prisma.users.delete({ where: { id } }),
    ]);
  }

  async findConnectionById(id: string) {
    return this.prisma.jira_connections.findUnique({ where: { id } });
  }

  async listConnections(filter?: {
    userId?: string;
    tenantId?: string;
  }): Promise<AdminConnectionRow[]> {
    const where = {
      ...(filter?.userId === undefined ? {} : { user_id: filter.userId }),
      ...(filter?.tenantId === undefined ? {} : { tenant_id: filter.tenantId }),
    };
    const connections = await this.prisma.jira_connections.findMany({
      where,
      orderBy: { created_at: 'asc' },
    });

    const userIds = connections
      .map((c) => c.user_id)
      .filter((id): id is string => id !== null);
    const apiKeyIds = connections
      .map((c) => c.api_key_id)
      .filter((id): id is string => id !== null);

    const [users, apiKeys, tenants] = await Promise.all([
      userIds.length === 0
        ? []
        : this.prisma.users.findMany({
            where: { id: { in: userIds } },
            select: { id: true, email: true, tenant_id: true },
          }),
      apiKeyIds.length === 0
        ? []
        : this.prisma.api_keys.findMany({
            where: { id: { in: apiKeyIds } },
            select: { id: true, name: true, tenant_id: true },
          }),
      [...new Set(connections.map((c) => c.tenant_id))].length === 0
        ? []
        : this.prisma.tenants.findMany({
            where: {
              id: { in: [...new Set(connections.map((c) => c.tenant_id))] },
            },
            select: { id: true, slug: true },
          }),
    ]);

    const userEmailById = new Map(users.map((u) => [u.id, u.email]));
    const apiKeyNameById = new Map(apiKeys.map((k) => [k.id, k.name]));
    const tenantSlugById = new Map(tenants.map((t) => [t.id, t.slug]));

    const lastTestedAt = await this.lastTestedAtByPrincipal([
      ...userIds,
      ...apiKeyIds,
    ]);

    return connections.map((connection) => ({
      id: connection.id,
      userId: connection.user_id,
      apiKeyId: connection.api_key_id,
      apiKeyName:
        connection.api_key_id === null
          ? null
          : (apiKeyNameById.get(connection.api_key_id) ?? null),
      tenantId: connection.tenant_id,
      tenantSlug: tenantSlugById.get(connection.tenant_id),
      userEmail:
        connection.user_id === null
          ? null
          : (userEmailById.get(connection.user_id) ?? null),
      mode: connection.mode,
      siteUrl: connection.site_url,
      email: connection.email,
      hasApiToken: connection.api_token_cipher !== null,
      hasOauthTokens: connection.access_token_cipher !== null,
      createdAt: connection.created_at,
      lastTestedAt:
        lastTestedAt.get(connection.user_id ?? connection.api_key_id ?? '') ??
        null,
    }));
  }

  async lastTestedAtByPrincipal(
    principalIds: string[],
  ): Promise<Map<string, Date>> {
    if (principalIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.audit_log.groupBy({
      by: ['user_id'],
      where: {
        user_id: { in: principalIds },
        action: AuditAction.JIRA_CONNECTION_TEST,
      },
      _max: { at: true },
    });
    return new Map(rows.map((row) => [row.user_id, row._max.at!]));
  }

  async deleteConnectionCascaded(id: string): Promise<boolean> {
    const connection = await this.prisma.jira_connections.findUnique({
      where: { id },
    });
    if (!connection) {
      return false;
    }
    const ops = [
      ...(connection.user_id === null
        ? []
        : [
            this.prisma.tickets_cache.deleteMany({
              where: { user_id: connection.user_id },
            }),
          ]),
      ...(connection.api_key_id === null
        ? []
        : [
            this.prisma.tickets_cache.deleteMany({
              where: { api_key_id: connection.api_key_id },
            }),
          ]),
      this.prisma.jira_connections.delete({ where: { id } }),
    ];
    await this.prisma.$transaction(ops);
    return true;
  }
}
