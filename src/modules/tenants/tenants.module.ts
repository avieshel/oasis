import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/db';
import { TenantRepository } from './tenant.repository';

@Module({
  providers: [TenantRepository, PrismaService],
  exports: [TenantRepository],
})
export class TenantsModule {}
