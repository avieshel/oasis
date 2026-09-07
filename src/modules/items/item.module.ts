import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/db';
import { AuthModule } from '../auth/auth.module';
import { JiraModule } from '../jira/jira.module';
import { ItemController } from './item.controller';
import { ItemRepository } from './item.repository';
import { ItemService } from './item.service';

@Module({
  imports: [AuthModule, JiraModule],
  controllers: [ItemController],
  providers: [ItemRepository, ItemService, PrismaService],
  exports: [ItemService],
})
export class ItemsModule {}
