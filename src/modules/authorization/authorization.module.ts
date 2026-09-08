import { Global, Module } from '@nestjs/common';
import { AuthorizationGuard } from './authorization.guard';
import { PermissionService } from './permission.service';

@Global()
@Module({
  providers: [AuthorizationGuard, PermissionService],
  exports: [AuthorizationGuard, PermissionService],
})
export class AuthorizationModule {}
