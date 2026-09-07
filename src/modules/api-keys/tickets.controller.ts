import {
  Body,
  Controller,
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
  jiraRecentTicketsQuerySchema,
  ticketCreateSchema,
} from '../../app/validation';
import { ApiKeyProjectForbiddenError } from '../../app/errors';
import { getRateLimitConfig } from '../../config/rate-limits';
import { CurrentApiKey } from './api-keys.decorator';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyThrottleGuard } from './api-key.throttle.guard';
import type { ApiKeyIdentity } from './request.types';
import { JiraService, type JiraAuditContext } from '../jira/jira.service';

const TICKET_CREATE_API_RATE_LIMIT = getRateLimitConfig().ticketCreateApi;
const API_KEY_USE_RATE_LIMIT = getRateLimitConfig().apiKeyUse;

function auditContext(req: Request): JiraAuditContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

@Controller('v1/tickets')
@UseGuards(ApiKeyGuard, ApiKeyThrottleGuard)
export class TicketsRestController {
  constructor(private readonly jiraService: JiraService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: TICKET_CREATE_API_RATE_LIMIT })
  async create(
    @CurrentApiKey() key: ApiKeyIdentity,
    @Body() rawBody: unknown,
    @Req() req: Request,
  ) {
    const body = ticketCreateSchema.parse(rawBody);
    assertProjectAllowed(key, body.project_key);
    return this.jiraService.createTicket(
      key.tenantId,
      { kind: 'api_key', apiKeyId: key.id },
      {
        projectKey: body.project_key,
        title: body.title,
        description: body.description,
      },
      auditContext(req),
    );
  }

  @Get('recent')
  @Throttle({ default: API_KEY_USE_RATE_LIMIT })
  async recent(@CurrentApiKey() key: ApiKeyIdentity, @Req() req: Request) {
    const query = jiraRecentTicketsQuerySchema.parse(req.query);
    assertProjectAllowed(key, query.project_key);
    return this.jiraService.listRecentTickets(
      key.tenantId,
      { kind: 'api_key', apiKeyId: key.id },
      query.project_key,
      query.refresh,
    );
  }
}

function assertProjectAllowed(key: ApiKeyIdentity, projectKey: string): void {
  if (
    key.allowedProjectKeys !== null &&
    !key.allowedProjectKeys.includes(projectKey)
  ) {
    throw new ApiKeyProjectForbiddenError(projectKey);
  }
}
