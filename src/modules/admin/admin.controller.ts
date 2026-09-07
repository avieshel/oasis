import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { getRateLimitConfig } from '../../config/rate-limits';
import {
  adminConnectionCreateSchema,
  adminConnectionDetailQuerySchema,
  adminConnectionsQuerySchema,
  adminParamSchema,
  adminUsersQuerySchema,
  jiraConnectSchema,
  tenantCreateSchema,
  tenantUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
} from '../../app/validation';
import { AuditAction, AuditService } from '../../infra/audit';
import { NotFoundError } from '../../app/errors';
import { SessionUser } from '../../infra/session';
import { CurrentTenantId, CurrentUser } from '../auth/auth.decorator';
import { SessionGuard } from '../auth/session.guard';
import { RequestWithSession } from '../auth/request.types';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

const CONNECT_RATE_LIMIT = getRateLimitConfig().jiraConnect;

function actor(ctx: { ip?: string | null; userAgent?: string | null }) {
  return {
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
  };
}

@Controller('app/admin')
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('status')
  async status() {
    const status = await this.adminService.status();
    return { enabled: true, ...status };
  }

  @Get('tenants')
  async listTenants() {
    return { tenants: await this.adminService.listTenants() };
  }

  @Post('tenants')
  @HttpCode(HttpStatus.CREATED)
  async createTenant(
    @Body() rawBody: unknown,
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    const body = tenantCreateSchema.parse(rawBody);
    const tenant = await this.adminService.createTenant(body.slug, body.name);
    await this.audit.write({
      tenantId,
      userId: user.id,
      action: AuditAction.ADMIN_TENANT_CREATE,
      target: tenant.id,
      ...actor(req),
    });
    return { tenant };
  }

  @Patch('tenants/:id')
  async updateTenant(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    const params = adminParamSchema.parse({ id });
    const body = tenantUpdateSchema.parse(rawBody);
    const tenant = await this.adminService.updateTenant(params.id, body);
    await this.audit.write({
      tenantId,
      userId: user.id,
      action: AuditAction.ADMIN_TENANT_UPDATE,
      target: tenant.id,
      ...actor(req),
    });
    return { tenant };
  }

  @Delete('tenants/:id')
  async deleteTenant(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    const params = adminParamSchema.parse({ id });
    await this.adminService.deleteTenant(params.id);
    await this.audit.write({
      tenantId,
      userId: user.id,
      action: AuditAction.ADMIN_TENANT_DELETE,
      target: params.id,
      ...actor(req),
    });
    return { deleted: true };
  }

  @Get('users')
  async listUsers(@Query() rawQuery: unknown) {
    const query = adminUsersQuerySchema.parse(rawQuery ?? {});
    return { users: await this.adminService.listUsers(query.tenant_id) };
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  async createUser(
    @Body() rawBody: unknown,
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    const body = userCreateSchema.parse(rawBody);
    const created = await this.adminService.createUser(
      body.tenant_id,
      body.email,
      body.password,
      body.name ?? null,
    );
    await this.audit.write({
      tenantId,
      userId: user.id,
      action: AuditAction.ADMIN_USER_CREATE,
      target: created.id,
      ...actor(req),
    });
    return {
      user: {
        id: created.id,
        tenantId: created.tenant_id,
        email: created.email,
        name: created.name,
      },
    };
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    const params = adminParamSchema.parse({ id });
    const body = userUpdateSchema.parse(rawBody);
    const updated = await this.adminService.updateUser(params.id, body);
    await this.audit.write({
      tenantId,
      userId: user.id,
      action: AuditAction.ADMIN_USER_UPDATE,
      target: updated.id,
      ...actor(req),
    });
    return {
      user: {
        id: updated.id,
        tenantId: updated.tenant_id,
        email: updated.email,
        name: updated.name,
      },
    };
  }

  @Delete('users/:id')
  async deleteUser(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    const params = adminParamSchema.parse({ id });
    await this.adminService.deleteUser(params.id);
    await this.audit.write({
      tenantId,
      userId: user.id,
      action: AuditAction.ADMIN_USER_DELETE,
      target: params.id,
      ...actor(req),
    });
    return { deleted: true };
  }

  @Get('connections')
  async listConnections(@Query() rawQuery: unknown) {
    const query = adminConnectionsQuerySchema.parse(rawQuery ?? {});
    return {
      connections: await this.adminService.listConnections({
        userId: query.user_id,
        tenantId: query.tenant_id,
      }),
    };
  }

  @Post('connections')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: CONNECT_RATE_LIMIT })
  async createConnection(
    @Body() rawBody: unknown,
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    const body = adminConnectionCreateSchema.parse(rawBody);
    const connection = await this.adminService.createConnection(
      body.user_id,
      {
        siteUrl: body.site_url,
        email: body.email,
        apiToken: body.api_token,
      },
      actor(req),
    );
    await this.audit.write({
      tenantId,
      userId: user.id,
      action: AuditAction.ADMIN_CONNECTION_CREATE,
      target: body.user_id,
      ...actor(req),
    });
    return { connection };
  }

  @Get('connections/:id')
  async connectionDetail(@Param('id') id: string, @Query() rawQuery: unknown) {
    const params = adminParamSchema.parse({ id });
    const query = adminConnectionDetailQuerySchema.parse(rawQuery ?? {});
    return {
      connection: await this.adminService.connectionDetail(
        params.id,
        query.reveal_token,
      ),
    };
  }

  @Patch('connections/:id')
  @Throttle({ default: CONNECT_RATE_LIMIT })
  async updateConnection(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    const params = adminParamSchema.parse({ id });
    const body = jiraConnectSchema.parse(rawBody);
    const connection = await this.adminService.updateConnection(
      params.id,
      {
        siteUrl: body.site_url,
        email: body.email,
        apiToken: body.api_token,
      },
      actor(req),
    );
    await this.audit.write({
      tenantId,
      userId: user.id,
      action: AuditAction.ADMIN_CONNECTION_UPDATE,
      target: params.id,
      ...actor(req),
    });
    return { connection };
  }

  @Delete('connections/:id')
  async deleteConnection(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    const params = adminParamSchema.parse({ id });
    const deleted = await this.adminService.deleteConnection(params.id);
    if (!deleted) {
      throw new NotFoundError('Connection');
    }
    await this.audit.write({
      tenantId,
      userId: user.id,
      action: AuditAction.ADMIN_CONNECTION_DELETE,
      target: params.id,
      ...actor(req),
    });
    return { deleted: true };
  }

  @Post('connections/:id/test')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: CONNECT_RATE_LIMIT })
  async testConnection(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    const params = adminParamSchema.parse({ id });
    const state = await this.adminService.testConnection(params.id, actor(req));
    await this.audit.write({
      tenantId,
      userId: user.id,
      action: AuditAction.ADMIN_CONNECTION_TEST,
      target: params.id,
      ...actor(req),
    });
    return state;
  }
}
