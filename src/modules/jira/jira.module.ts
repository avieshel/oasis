import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/db';
import { AuthModule } from '../auth/auth.module';
import { JiraRepository } from './jira.repository';
import { JiraService } from './jira.service';
import { JiraController } from './jira.controller';

@Module({
  imports: [AuthModule],
  controllers: [JiraController],
  providers: [JiraRepository, JiraService, PrismaService],
  exports: [JiraService],
})
export class JiraModule {}
