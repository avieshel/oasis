import type { Request } from 'express';

export interface ApiKeyIdentity {
  id: string;
  tenantId: string;
  allowedProjectKeys: string[] | null;
}

export interface RequestWithApiKey extends Request {
  apiKey: ApiKeyIdentity;
}
