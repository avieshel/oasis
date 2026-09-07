import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithApiKey } from './request.types';

@Injectable()
export class ApiKeyThrottleGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const apiKey = (req as Partial<RequestWithApiKey>).apiKey;
    if (apiKey) {
      return Promise.resolve(`api-key:${apiKey.id}`);
    }
    return super.getTracker(req);
  }
}
