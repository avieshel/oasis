import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  jiraConnectSchema,
  projectKeySchema,
  ticketCreateSchema,
} from '../../app/validation';
import { getRateLimitConfig } from '../../config/rate-limits';
import { SessionUser } from '../../infra/session';
import { CurrentTenantId, CurrentUser } from '../auth/auth.decorator';
import { SessionGuard } from '../auth/session.guard';
import { RequestWithSession } from '../auth/request.types';
import { JiraService, type JiraAuditContext } from './jira.service';

const CONNECT_RATE_LIMIT = getRateLimitConfig().jiraConnect;
const PROJECTS_RATE_LIMIT = getRateLimitConfig().jiraProjects;

function auditContext(req: Request): JiraAuditContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

@Controller('app/jira')
@UseGuards(SessionGuard)
export class JiraController {
  constructor(private readonly jiraService: JiraService) {}

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: CONNECT_RATE_LIMIT })
  async connect(
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Body() rawBody: unknown,
    @Req() req: RequestWithSession,
  ) {
    const body = jiraConnectSchema.parse(rawBody);
    return this.jiraService.connect(
      tenantId,
      user.id,
      {
        siteUrl: body.site_url,
        email: body.email,
        apiToken: body.api_token,
      },
      auditContext(req),
    );
  }

  @Delete('connect')
  @Throttle({ default: CONNECT_RATE_LIMIT })
  async disconnect(
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    return this.jiraService.disconnect(tenantId, user.id, auditContext(req));
  }

  @Get('status')
  async status(
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
  ) {
    return this.jiraService.status(tenantId, user.id);
  }

  @Get('projects')
  @Throttle({ default: PROJECTS_RATE_LIMIT })
  async projects(
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
  ) {
    return this.jiraService.listProjects(tenantId, user.id);
  }

  @Post('tickets')
  async createTicket(
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Body() rawBody: unknown,
    @Req() req: RequestWithSession,
  ) {
    const body = ticketCreateSchema.parse(rawBody);
    return this.jiraService.createTicket(
      tenantId,
      user.id,
      {
        projectKey: body.project_key,
        title: body.title,
        description: body.description,
      },
      auditContext(req),
    );
  }

  @Get('tickets/recent')
  async listRecentTickets(
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    const projectKey = projectKeySchema.parse(req.query.project_key);
    return this.jiraService.listRecentTickets(tenantId, user.id, projectKey);
  }
}
