import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/db';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [PrismaService],
})
export class HealthModule {}
