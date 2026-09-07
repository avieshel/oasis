import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
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
import { z } from 'zod';
import {
  jiraRecentTicketsQuerySchema,
  ticketCreateSchema,
} from '../../app/validation';
import { ApiKeyProjectForbiddenError } from '../../app/errors';
import { getRateLimitConfig } from '../../config/rate-limits';
import { zodSchemaObject } from '../../swagger';
import { CurrentApiKey } from './api-keys.decorator';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyThrottleGuard } from './api-key.throttle.guard';
import type { ApiKeyIdentity } from './request.types';
import { JiraService, type JiraAuditContext } from '../jira/jira.service';

const TICKET_CREATE_API_RATE_LIMIT = getRateLimitConfig().ticketCreateApi;
const API_KEY_USE_RATE_LIMIT = getRateLimitConfig().apiKeyUse;

const PROJECT_KEY_JSON_SCHEMA = zodSchemaObject(
  z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z][A-Z0-9]{1,9}$/),
);

const CREATE_RESPONSE: SchemaObject = {
  type: 'object',
  required: ['key', 'url'],
  properties: {
    key: { type: 'string', example: 'OASIS-42' },
    url: {
      type: 'string',
      format: 'uri',
      example: 'https://acme.atlassian.net/browse/OASIS-42',
    },
  },
};

const RECENT_RESPONSE: SchemaObject = {
  type: 'array',
  items: {
    type: 'object',
    required: ['key', 'title', 'url', 'createdAt'],
    properties: {
      key: { type: 'string', example: 'OASIS-42' },
      title: { type: 'string', example: 'Certificate expiring soon' },
      url: {
        type: 'string',
        format: 'uri',
        example: 'https://acme.atlassian.net/browse/OASIS-42',
      },
      createdAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        example: '2026-09-07T08:00:00.000Z',
      },
    },
  },
};

function auditContext(req: Request): JiraAuditContext {
  return {
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

@ApiTags('tickets (machine API)')
@ApiBearerAuth('api-key')
@Controller('v1/tickets')
@UseGuards(ApiKeyGuard, ApiKeyThrottleGuard)
export class TicketsRestController {
  constructor(private readonly jiraService: JiraService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: TICKET_CREATE_API_RATE_LIMIT })
  @ApiOperation({
    summary: 'Create a Jira ticket',
    description:
      'Creates an Oasis finding ticket in the configured Jira project using ' +
      'the API key’s service-account connection. The key must be scoped for ' +
      'the project (allowed_project_keys) unless unscoped.',
  })
  @ApiBody({
    schema: zodSchemaObject(ticketCreateSchema),
    description: 'Ticket payload',
    examples: {
      ticket: {
        value: {
          project_key: 'OASIS',
          title: 'Certificate expiring in 14 days',
          description: 'TLS certificate CN=*.acme.io rotates on 2026-09-21.',
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Ticket created',
    schema: CREATE_RESPONSE,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation error — `{ "error": "validation", "fields": {} }`',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing, invalid, or revoked API key',
    schema: {
      type: 'object',
      properties: { error: { type: 'string', example: 'API_KEY_INVALID' } },
    },
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description:
      'Key not scoped for the project (`API_KEY_PROJECT_FORBIDDEN`) or key has no Jira connection',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Jira rejected the project key',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Rate limited',
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'Upstream Jira failure',
  })
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
  @ApiOperation({
    summary: 'List recent tickets',
    description:
      'Most recent tickets (up to 10) created for the project via this API ' +
      'key, newest first. Serves from the cache and refreshes in the background ' +
      'when stale; `refresh=true` forces a live Jira round-trip.',
  })
  @ApiQuery({
    name: 'project_key',
    required: true,
    schema: PROJECT_KEY_JSON_SCHEMA,
  })
  @ApiQuery({
    name: 'refresh',
    required: false,
    schema: { type: 'string', enum: ['true', 'false'] },
    description: 'Force a live Jira refresh (default `false`)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Recent tickets, newest first',
    schema: RECENT_RESPONSE,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation error',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing, invalid, or revoked API key',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Key not scoped for the project',
  })
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
