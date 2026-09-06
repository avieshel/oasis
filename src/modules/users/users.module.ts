import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/db';
import { TenantsModule } from '../tenants/tenants.module';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  imports: [TenantsModule],
  providers: [UserRepository, UserService, PrismaService],
  controllers: [UserController],
  exports: [UserRepository, UserService],
})
export class UsersModule {}
