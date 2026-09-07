import { Injectable } from '@nestjs/common';
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

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countTenants(): Promise<number> {
    return this.prisma.tenants.count();
  }

  async countUsers(): Promise<number> {
    return this.prisma.users.count();
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
}
