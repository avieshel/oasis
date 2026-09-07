import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ForbiddenError, UnauthorizedError } from '../../app/errors';
import { RequestWithSession } from '../auth/request.types';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const allowAdmin = process.env.ALLOW_ADMIN !== 'false';
    if (!allowAdmin) {
      throw new ForbiddenError('Admin mode is disabled');
    }
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    if (request.user === undefined) {
      throw new UnauthorizedError();
    }
    return true;
  }
}
