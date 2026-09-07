import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/db';
import { AuditService } from '../../infra/audit';
import { AuthModule } from '../auth/auth.module';
import { JiraModule } from '../jira/jira.module';
import { ApiKeysController } from './api-keys.controller';
import { TicketsRestController } from './tickets.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyRepository } from './api-keys.repository';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyThrottleGuard } from './api-key.throttle.guard';

@Module({
  imports: [AuthModule, JiraModule],
  controllers: [ApiKeysController, TicketsRestController],
  providers: [
    ApiKeysService,
    ApiKeyRepository,
    ApiKeyGuard,
    ApiKeyThrottleGuard,
    PrismaService,
    AuditService,
  ],
  exports: [ApiKeyGuard, ApiKeyRepository],
})
export class ApiKeysModule {}
