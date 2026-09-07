import { Injectable } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { PrismaService } from './db';

export const AuditAction = {
  SIGNUP: 'signup',
  LOGIN: 'login',
  LOGOUT: 'logout',
  JIRA_CONNECT: 'jira_connect',
  JIRA_DISCONNECT: 'jira_disconnect',
  JIRA_TICKET_CREATE: 'jira_ticket_create',
  API_KEY_CREATE: 'api_key_create',
  API_KEY_REVOKE: 'api_key_revoke',
  ADMIN_TENANT_CREATE: 'admin_tenant_create',
  ADMIN_TENANT_UPDATE: 'admin_tenant_update',
  ADMIN_TENANT_DELETE: 'admin_tenant_delete',
  ADMIN_USER_CREATE: 'admin_user_create',
  ADMIN_USER_UPDATE: 'admin_user_update',
  ADMIN_USER_DELETE: 'admin_user_delete',
  ITEM_GENERATE: 'item_generate',
  ITEM_STATUS_UPDATE: 'item_status_update',
  ITEM_TICKET_CREATE: 'item_ticket_create',
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
