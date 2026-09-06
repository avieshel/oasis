import { Injectable, Logger } from '@nestjs/common';
import { SessionManager, toSessionUser } from '../../infra/session';
import { AuditAction, AuditService } from '../../infra/audit';
import { UserRepository } from '../users/user.repository';
import { verifyPassword } from '../../infra/crypto';
import { InvalidCredentialsError, UnauthorizedError } from '../../app/errors';

const DUMMY_PASSWORD_HASH =
  '$2b$12$Kpxd2Z4nbixmWrC5LuggE.yvZfHtDPWNDyaaKZVNO1dJCCHhB38.u';

export interface LoginContext {
  currentToken?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionManager,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, ctx: LoginContext) {
    const user = await this.users.findByEmail(email);
    const hash = user?.password_hash ?? DUMMY_PASSWORD_HASH;
    const valid = await verifyPassword(password, hash);

    if (!user || !valid) {
      this.logger.log(`login failed for email=${email}`);
      throw new InvalidCredentialsError();
    }

    const token = await this.sessions.create({
      userId: user.id,
      currentToken: ctx.currentToken,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    await this.audit.write({
      tenantId: user.tenant_id,
      userId: user.id,
      action: AuditAction.LOGIN,
      target: user.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      sessionToken: token,
      user: toSessionUser(user),
    };
  }

  async logout(token: string | undefined, ctx: LoginContext): Promise<void> {
    if (!token) {
      throw new UnauthorizedError();
    }

    const existing = await this.sessions.peek(token);
    await this.sessions.destroy(token);

    if (existing) {
      const user = await this.users.findById(existing.userId);
      if (user) {
        await this.audit.write({
          tenantId: user.tenant_id,
          userId: user.id,
          action: AuditAction.LOGOUT,
          target: user.email,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
      }
    }
  }
}
