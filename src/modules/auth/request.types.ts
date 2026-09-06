import type { Request } from 'express';
import type { SessionUser } from '../../infra/session';

export interface RequestWithSession extends Request {
  user: SessionUser;
  tenantId: string;
  sessionId: string;
}

export function readCookie(req: Request, name: string): string | undefined {
  const cookies = (req as { cookies?: Record<string, string> }).cookies;
  if (!cookies) {
    return undefined;
  }
  // eslint-disable-next-line security/detect-object-injection -- name is a constant cookie name from config, not user input
  return cookies[name];
}
