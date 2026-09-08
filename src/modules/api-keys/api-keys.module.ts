import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../infra/db';
import { AuditService } from '../../infra/audit';
import { JiraModule } from '../jira/jira.module';
import { ApiKeysController } from './api-keys.controller';
import { TicketsRestController } from './tickets.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyRepository } from './api-keys.repository';

@Global()
@Module({
  imports: [JiraModule],
  controllers: [ApiKeysController, TicketsRestController],
  providers: [ApiKeysService, ApiKeyRepository, PrismaService, AuditService],
  exports: [ApiKeyRepository],
})
export class ApiKeysModule {}
