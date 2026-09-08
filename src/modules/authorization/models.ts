export type Principal =
  | {
      type: 'user';
      id: string;
      tenantId: string;
      email: string;
      name?: string | null;
    }
  | {
      type: 'api_key';
      id: string;
      tenantId: string;
      allowedProjectKeys?: string[] | null;
    };

export interface AuthContext {
  principal: Principal;
  ip?: string | null;
  userAgent?: string | null;
}
