import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '../../infra/session';
import type { RequestWithSession } from './request.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser => {
    return context.switchToHttp().getRequest<RequestWithSession>().user;
  },
);

export const CurrentTenantId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    return context.switchToHttp().getRequest<RequestWithSession>().tenantId;
  },
);
