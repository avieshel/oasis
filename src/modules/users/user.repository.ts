import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/db';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, email: string, passwordHash: string) {
    return this.prisma.users.create({
      data: { tenant_id: tenantId, email, password_hash: passwordHash },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.users.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.users.findUnique({ where: { id } });
  }
}
