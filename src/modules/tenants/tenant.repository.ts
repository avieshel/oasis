import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/db';

export const MAX_TENANT_SLUG_LENGTH = 50;

@Injectable()
export class TenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(name: string) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .substring(0, MAX_TENANT_SLUG_LENGTH);

    return this.prisma.tenants.create({
      data: { name, slug },
    });
  }

  async findById(id: string) {
    return this.prisma.tenants.findUnique({ where: { id } });
  }

  async findBySlug(slug: string) {
    return this.prisma.tenants.findUnique({ where: { slug } });
  }
}
