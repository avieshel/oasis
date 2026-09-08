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
  jiraRecentTicketsQuerySchema,
  ticketCreateSchema,
} from '../../app/validation';
import { getRateLimitConfig } from '../../config/rate-limits';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentPrincipal } from '../authorization/authorization.decorator';
import { Principal } from '../authorization/models';
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
@UseGuards(AuthorizationGuard)
export class JiraController {
  constructor(private readonly jiraService: JiraService) {}

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: CONNECT_RATE_LIMIT })
  async connect(
    @CurrentPrincipal() principal: Principal,
    @Body() rawBody: unknown,
    @Req() req: Request,
  ) {
    const body = jiraConnectSchema.parse(rawBody);
    return this.jiraService.connect(
      principal.tenantId,
      principal,
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
    @CurrentPrincipal() principal: Principal,
    @Req() req: Request,
  ) {
    return this.jiraService.disconnect(
      principal.tenantId,
      principal,
      auditContext(req),
    );
  }

  @Get('status')
  async status(@CurrentPrincipal() principal: Principal) {
    return this.jiraService.status(principal.tenantId, principal);
  }

  @Get('projects')
  @Throttle({ default: PROJECTS_RATE_LIMIT })
  async projects(@CurrentPrincipal() principal: Principal) {
    return this.jiraService.listProjects(principal.tenantId, principal);
  }

  @Post('tickets')
  async createTicket(
    @CurrentPrincipal() principal: Principal,
    @Body() rawBody: unknown,
    @Req() req: Request,
  ) {
    const body = ticketCreateSchema.parse(rawBody);
    return this.jiraService.createTicket(
      principal.tenantId,
      principal,
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
    @CurrentPrincipal() principal: Principal,
    @Req() req: Request,
  ) {
    const query = jiraRecentTicketsQuerySchema.parse(req.query);
    return this.jiraService.listRecentTickets(
      principal.tenantId,
      principal,
      query.project_key ?? null,
      query.refresh,
    );
  }
}
