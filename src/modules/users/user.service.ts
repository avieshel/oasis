import { Injectable } from '@nestjs/common';
import { hashPassword } from '../../infra/crypto';
import { TenantRepository } from '../tenants/tenant.repository';
import { UserRepository } from './user.repository';
import { EmailTakenError } from '../../app/errors';

@Injectable()
export class UserService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly users: UserRepository,
  ) {}

  async signup(email: string, password: string) {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new EmailTakenError();
    }

    const tenant = await this.tenants.create(email.split('@')[0]);
    const passwordHash = await hashPassword(password);
    const user = await this.users.create(tenant.id, email, passwordHash);

    return { user, tenant };
  }
}
