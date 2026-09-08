import { Injectable } from '@nestjs/common';
import { Principal } from './models';

@Injectable()
export class PermissionService {
  check({ principal }: { principal: Principal }): { permitted: boolean } {
    return { permitted: !!principal };
  }
}
