import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { PrismaService } from './db';

export const AuditAction = {
  SIGNUP: 'signup',
  LOGIN: 'login',
  LOGOUT: 'logout',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEvent {
  tenantId: string;
  userId: string;
  action: AuditAction;
  target: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(event: AuditEvent): Promise<void> {
    await this.prisma.audit_log.create({
      data: {
        tenant_id: event.tenantId,
        user_id: event.userId,
        action: event.action,
        target: event.target,
        ip: event.ip ?? null,
        user_agent: event.userAgent ?? null,
      },
    });
    this.logger.log(
      `audit ${event.action} user=${event.userId} target=${event.target}`,
    );
  }
}
