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
} from '@nestjs/common';
import {
  adminParamSchema,
  adminUsersQuerySchema,
  tenantCreateSchema,
  tenantUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
} from '../../app/validation';
import { AdminExtService } from './admin-ext.service';

@Controller('app/admin')
export class AdminExtController {
  constructor(private readonly adminService: AdminExtService) {}

  @Get('status')
  async status() {
    return this.adminService.status();
  }

  @Get('tenants')
  async listTenants() {
    return { tenants: await this.adminService.listTenants() };
  }

  @Post('tenants')
  @HttpCode(HttpStatus.CREATED)
  async createTenant(@Body() rawBody: unknown) {
    const body = tenantCreateSchema.parse(rawBody);
    const tenant = await this.adminService.createTenant(body.slug, body.name);
    return { tenant };
  }

  @Patch('tenants/:id')
  async updateTenant(@Param('id') id: string, @Body() rawBody: unknown) {
    const params = adminParamSchema.parse({ id });
    const body = tenantUpdateSchema.parse(rawBody);
    const tenant = await this.adminService.updateTenant(params.id, body);
    return { tenant };
  }

  @Delete('tenants/:id')
  async deleteTenant(@Param('id') id: string) {
    const params = adminParamSchema.parse({ id });
    await this.adminService.deleteTenant(params.id);
    return { deleted: true };
  }

  @Get('users')
  async listUsers(@Query() rawQuery: unknown) {
    const query = adminUsersQuerySchema.parse(rawQuery ?? {});
    return { users: await this.adminService.listUsers(query.tenant_id) };
  }

  @Post('users')
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() rawBody: unknown) {
    const body = userCreateSchema.parse(rawBody);
    const created = await this.adminService.createUser(
      body.tenant_id,
      body.email,
      body.password,
      body.name ?? null,
    );
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
  async updateUser(@Param('id') id: string, @Body() rawBody: unknown) {
    const params = adminParamSchema.parse({ id });
    const body = userUpdateSchema.parse(rawBody);
    const updated = await this.adminService.updateUser(params.id, body);
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
  async deleteUser(@Param('id') id: string) {
    const params = adminParamSchema.parse({ id });
    await this.adminService.deleteUser(params.id);
    return { deleted: true };
  }
}
