import { Injectable } from '@nestjs/common';
import { hashPassword } from '../../infra/crypto';
import { TenantRepository } from '../tenants/tenant.repository';
import { UserRepository } from './user.repository';
import {
  EmailTakenError,
  NotFoundError,
  SlugTakenError,
} from '../../app/errors';

export interface SignupTenantSelection {
  tenant_id?: string;
  new_tenant?: { slug: string; name: string };
}

@Injectable()
export class UserService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly users: UserRepository,
  ) {}

  async signup(
    email: string,
    password: string,
    selection?: SignupTenantSelection,
  ) {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new EmailTakenError();
    }

    let tenant;
    if (selection?.tenant_id) {
      tenant = await this.tenants.findById(selection.tenant_id);
      if (!tenant) {
        throw new NotFoundError('Tenant');
      }
    } else if (selection?.new_tenant) {
      const taken = await this.tenants.findBySlug(selection.new_tenant.slug);
      if (taken) {
        throw new SlugTakenError();
      }
      tenant = await this.tenants.createWithSlug(
        selection.new_tenant.slug,
        selection.new_tenant.name,
      );
    } else {
      tenant = await this.tenants.create(email.split('@')[0]);
    }

    const passwordHash = await hashPassword(password);
    const user = await this.users.create(tenant.id, email, passwordHash);

    return { user, tenant };
  }

  async listTenants() {
    return this.tenants.listAll();
  }
}
