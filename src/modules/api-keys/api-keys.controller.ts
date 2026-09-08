import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import { zodSchemaObject } from '../../swagger';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentPrincipal } from '../authorization/authorization.decorator';
import { Principal } from '../authorization/models';
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

@ApiTags('api keys (session-authed management)')
@Controller('app/api-keys')
@UseGuards(AuthorizationGuard)
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly jiraService: JiraService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: API_KEY_CREATE_RATE_LIMIT })
  @ApiOperation({
    summary: 'Mint an API key',
    description:
      'Creates a new API key. The raw key value is returned exactly once; ' +
      'only its SHA-256 hash is stored. Optional `allowed_project_keys` ' +
      'restricts the projects the key may create tickets for.',
  })
  @ApiBody({
    schema: zodSchemaObject(apiKeyCreateSchema),
    description: 'Key details',
    examples: {
      unscoped: { value: { name: 'vuln-scanner' } },
      scoped: {
        value: { name: 'tls-scanner', allowed_project_keys: ['OASIS', 'SEC'] },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Key minted; rawKey returned once',
    schema: {
      type: 'object',
      properties: {
        key: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            allowedProjectKeys: {
              type: 'array',
              items: { type: 'string' },
              nullable: true,
            },
          },
        },
        rawKey: { type: 'string', example: 'ident_oas_…' },
      },
    },
  })
  async createKey(
    @CurrentPrincipal() principal: Principal,
    @Body() rawBody: unknown,
    @Req() req: RequestWithSession,
  ) {
    const body = apiKeyCreateSchema.parse(rawBody);
    const created = await this.apiKeysService.createKey(principal.tenantId, {
      name: body.name,
      allowedProjectKeys: body.allowed_project_keys,
    });
    await this.audit.write({
      tenantId: principal.tenantId,
      userId: principal.id,
      action: AuditAction.API_KEY_CREATE,
      target: created.key.id,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    return created;
  }

  @Get()
  @ApiOperation({
    summary: 'List API keys',
    description:
      'Metadata for all tenant API keys; never the hash or raw value.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Key metadata list' })
  async listKeys(@CurrentPrincipal() principal: Principal) {
    return this.apiKeysService.listKeys(principal.tenantId);
  }

  @Delete(':id')
  @Throttle({ default: API_KEY_CREATE_RATE_LIMIT })
  @ApiOperation({
    summary: 'Revoke an API key',
    description:
      'Revokes the key (sets revoked_at). Revoked keys can no longer ' +
      'authenticate; their Jira connection row is left inert.',
  })
  @ApiParam({ name: 'id', schema: { type: 'string' }, description: 'Key id' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: '`{ "status": "revoked" }`',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Unknown key id' })
  async revokeKey(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Req() req: RequestWithSession,
  ) {
    await this.apiKeysService.revokeKey(principal.tenantId, id);
    await this.audit.write({
      tenantId: principal.tenantId,
      userId: principal.id,
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
  @ApiOperation({
    summary: 'Tie a Jira service account to an API key',
    description:
      'Stores the API-token credentials the key will use when creating ' +
      'tickets. Validation performs a live `myself`/`serverInfo` round-trip.',
  })
  @ApiParam({ name: 'id', schema: { type: 'string' }, description: 'Key id' })
  @ApiBody({
    schema: zodSchemaObject(jiraConnectSchema),
    description: 'Jira service-account credentials',
    examples: {
      account: {
        value: {
          site_url: 'https://acme.atlassian.net',
          email: '[EMAIL]',
          api_token: '••••••••',
        },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Connection established' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Unknown key id' })
  async connectKeyJira(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @Req() req: RequestWithSession,
  ) {
    const body = jiraConnectSchema.parse(rawBody);
    return this.jiraService.connect(
      principal.tenantId,
      { type: 'api_key', id, tenantId: principal.tenantId },
      {
        siteUrl: body.site_url,
        email: body.email,
        apiToken: body.api_token,
      },
      auditContext(req),
    );
  }

  @Post(':id/jira/test')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: CONNECT_RATE_LIMIT })
  @ApiOperation({
    summary: 'Test an API key’s live Jira connection',
    description:
      'Performs a live `myself` round-trip with the stored credentials to ' +
      'confirm the connection still works. Emits a jira_connection_test ' +
      'audit event.',
  })
  @ApiParam({ name: 'id', schema: { type: 'string' }, description: 'Key id' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Connection state' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Unknown key id' })
  async testKeyJira(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Req() req: RequestWithSession,
  ) {
    return this.jiraService.testConnection(
      principal.tenantId,
      { type: 'api_key', id, tenantId: principal.tenantId },
      auditContext(req),
    );
  }

  @Get(':id/jira/status')
  @ApiOperation({
    summary: 'Jira connection status for an API key',
  })
  @ApiParam({ name: 'id', schema: { type: 'string' }, description: 'Key id' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Connection state' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Unknown key id' })
  async keyJiraStatus(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    return this.jiraService.status(principal.tenantId, {
      type: 'api_key',
      id,
      tenantId: principal.tenantId,
    });
  }

  @Delete(':id/jira/connect')
  @Throttle({ default: CONNECT_RATE_LIMIT })
  @ApiOperation({
    summary: 'Disconnect an API key’s Jira account',
  })
  @ApiParam({ name: 'id', schema: { type: 'string' }, description: 'Key id' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Disconnected' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Unknown key id' })
  async disconnectKeyJira(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Req() req: RequestWithSession,
  ) {
    return this.jiraService.disconnect(
      principal.tenantId,
      { type: 'api_key', id, tenantId: principal.tenantId },
      auditContext(req),
    );
  }
}
