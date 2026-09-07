import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuditAction, AuditService } from '../../infra/audit';
import { apiKeyCreateSchema, jiraConnectSchema } from '../../app/validation';
import { getRateLimitConfig } from '../../config/rate-limits';
import { SessionUser } from '../../infra/session';
import { CurrentTenantId, CurrentUser } from '../auth/auth.decorator';
import { SessionGuard } from '../auth/session.guard';
import type { RequestWithSession } from '../auth/request.types';
import { JiraService, type JiraAuditContext } from '../jira/jira.service';
import { ApiKeysService } from './api-keys.service';

const API_KEY_CREATE_RATE_LIMIT = getRateLimitConfig().apiKeyCreate;
const CONNECT_RATE_LIMIT = getRateLimitConfig().jiraConnect;

function auditContext(req: RequestWithSession): JiraAuditContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

@Controller('app/api-keys')
@UseGuards(SessionGuard)
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly jiraService: JiraService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: API_KEY_CREATE_RATE_LIMIT })
  async createKey(
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Body() rawBody: unknown,
    @Req() req: RequestWithSession,
  ) {
    const body = apiKeyCreateSchema.parse(rawBody);
    const created = await this.apiKeysService.createKey(tenantId, {
      name: body.name,
      allowedProjectKeys: body.allowed_project_keys,
    });
    await this.audit.write({
      tenantId,
      userId: user.id,
      action: AuditAction.API_KEY_CREATE,
      target: created.key.id,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return created;
  }

  @Get()
  async listKeys(@CurrentTenantId() tenantId: string) {
    return this.apiKeysService.listKeys(tenantId);
  }

  @Delete(':id')
  @Throttle({ default: API_KEY_CREATE_RATE_LIMIT })
  async revokeKey(
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
    @Req() req: RequestWithSession,
  ) {
    await this.apiKeysService.revokeKey(tenantId, id);
    await this.audit.write({
      tenantId,
      userId: user.id,
      action: AuditAction.API_KEY_REVOKE,
      target: id,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return { status: 'revoked' };
  }

  @Post(':id/jira/connect')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: CONNECT_RATE_LIMIT })
  async connectKeyJira(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @Req() req: RequestWithSession,
  ) {
    await this.apiKeysService.assertOwned(tenantId, id);
    const body = jiraConnectSchema.parse(rawBody);
    return this.jiraService.connect(
      tenantId,
      { kind: 'api_key', apiKeyId: id },
      {
        siteUrl: body.site_url,
        email: body.email,
        apiToken: body.api_token,
      },
      auditContext(req),
    );
  }

  @Get(':id/jira/status')
  async keyJiraStatus(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
  ) {
    await this.apiKeysService.assertOwned(tenantId, id);
    return this.jiraService.status(tenantId, { kind: 'api_key', apiKeyId: id });
  }

  @Delete(':id/jira/connect')
  @Throttle({ default: CONNECT_RATE_LIMIT })
  async disconnectKeyJira(
    @CurrentTenantId() tenantId: string,
    @Param('id') id: string,
    @Req() req: RequestWithSession,
  ) {
    await this.apiKeysService.assertOwned(tenantId, id);
    return this.jiraService.disconnect(
      tenantId,
      { kind: 'api_key', apiKeyId: id },
      auditContext(req),
    );
  }
}
