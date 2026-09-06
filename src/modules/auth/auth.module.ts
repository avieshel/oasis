import { Module } from '@nestjs/common';
import { PrismaService } from '../../infra/db';
import { AuditService } from '../../infra/audit';
import { SessionManager } from '../../infra/session';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionManager,
    AuditService,
    SessionGuard,
    PrismaService,
  ],
  exports: [SessionGuard, SessionManager],
})
export class AuthModule {}
