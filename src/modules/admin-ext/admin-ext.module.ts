import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/db';
import { AdminExtController } from './admin-ext.controller';
import { AdminExtService } from './admin-ext.service';
import { AdminExtRepository } from './admin-ext.repository';

@Module({
  controllers: [AdminExtController],
  providers: [AdminExtService, AdminExtRepository, PrismaService],
})
export class AdminExtModule {}
