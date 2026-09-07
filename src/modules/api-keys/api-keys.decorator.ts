import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ApiKeyIdentity, RequestWithApiKey } from './request.types';

export const CurrentApiKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ApiKeyIdentity => {
    return context.switchToHttp().getRequest<RequestWithApiKey>().apiKey;
  },
);
