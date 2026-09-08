import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { Principal } from './models';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { principal?: Principal }>();
    if (!request.principal) {
      throw new Error('Principal not found on request');
    }
    return request.principal;
  },
);
