import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/db';
import { AuditService } from '../../infra/audit';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminRepository } from './admin.repository';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminRepository,
    AdminGuard,
    AuditService,
    PrismaService,
  ],
})
export class AdminModule {}
