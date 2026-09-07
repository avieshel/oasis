import { Injectable } from '@nestjs/common';
import { hashPassword } from '../../infra/crypto';
import {
  EmailTakenError,
  NotFoundError,
  SlugTakenError,
} from '../../app/errors';
import { AdminRepository } from './admin.repository';

@Injectable()
export class AdminService {
  constructor(private readonly repository: AdminRepository) {}

  async status() {
    const [tenantCount, userCount] = await Promise.all([
      this.repository.countTenants(),
      this.repository.countUsers(),
    ]);
    return { tenantCount, userCount };
  }

  async listTenants() {
    return this.repository.listTenants();
  }

  async createTenant(slug: string, name: string) {
    const existing = await this.repository.findTenantBySlug(slug);
    if (existing) {
      throw new SlugTakenError();
    }
    return this.repository.createTenant(slug, name);
  }

  async updateTenant(id: string, data: { slug?: string; name?: string }) {
    const tenant = await this.repository.findTenantById(id);
    if (!tenant) {
      throw new NotFoundError('Tenant');
    }
    if (data.slug !== undefined && data.slug !== tenant.slug) {
      const taken = await this.repository.findTenantBySlug(data.slug);
      if (taken && taken.id !== id) {
        throw new SlugTakenError();
      }
    }
    return this.repository.updateTenant(id, data);
  }

  async deleteTenant(id: string): Promise<void> {
    const tenant = await this.repository.findTenantById(id);
    if (!tenant) {
      throw new NotFoundError('Tenant');
    }
    await this.repository.deleteTenantCascaded(id);
  }

  async listUsers(tenantId?: string) {
    return this.repository.listUsers(tenantId);
  }

  async createUser(
    tenantId: string,
    email: string,
    password: string,
    name: string | null,
  ) {
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant');
    }
    const existing = await this.repository.findUserByEmail(email);
    if (existing) {
      throw new EmailTakenError();
    }
    const passwordHash = await hashPassword(password);
    return this.repository.createUser(tenantId, email, passwordHash, name);
  }

  async updateUser(
    id: string,
    data: {
      email?: string;
      name?: string;
      password?: string;
    },
  ) {
    const user = await this.repository.findUserById(id);
    if (!user) {
      throw new NotFoundError('User');
    }
    if (data.email !== undefined && data.email !== user.email) {
      const taken = await this.repository.findUserByEmail(data.email);
      if (taken && taken.id !== id) {
        throw new EmailTakenError();
      }
    }
    const passwordHash =
      data.password === undefined
        ? undefined
        : await hashPassword(data.password);
    if (data.password !== undefined) {
      await this.repository.kickUserSessions(id);
    }
    return this.repository.updateUser(id, {
      email: data.email,
      name: data.name,
      password_hash: passwordHash,
    });
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.repository.findUserById(id);
    if (!user) {
      throw new NotFoundError('User');
    }
    await this.repository.deleteUserCascaded(id);
  }
}
