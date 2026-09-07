import { apiRequest } from './client';

export interface AdminStatus {
  enabled: boolean;
  tenantCount: number;
  userCount: number;
  connectionCount: number;
  apiKeyCount: number;
  itemCount: number;
  ticketCount: number;
}

export interface AdminTenant {
  id: string;
  slug: string;
  name: string;
  createdAt: string;
  userCount: number;
}

export interface AdminUser {
  id: string;
  tenantId: string;
  tenantSlug: string | undefined;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface AdminConnection {
  id: string;
  userId: string | null;
  apiKeyId: string | null;
  apiKeyName: string | null;
  tenantId: string;
  tenantSlug: string | undefined;
  userEmail: string | null;
  mode: string;
  siteUrl: string | null;
  email: string | null;
  hasApiToken: boolean;
  hasOauthTokens: boolean;
  createdAt: string;
  lastTestedAt: string | null;
}

export interface AdminConnectionDetail {
  id: string;
  userId: string | null;
  apiKeyId: string | null;
  mode: string;
  siteUrl: string | null;
  email: string | null;
  hasApiToken: boolean;
  hasOauthTokens: boolean;
  createdAt: string;
  tokenRevealed: boolean;
  apiToken?: string;
}

export interface JiraConnectionState {
  connected: boolean;
  siteUrl?: string;
  email?: string;
  accountId?: string;
  displayName?: string;
  mode?: string;
}

export async function adminStatus(): Promise<AdminStatus> {
  return apiRequest<AdminStatus>('GET', '/admin/status');
}

export async function listAdminTenants(): Promise<AdminTenant[]> {
  const body = await apiRequest<{ tenants: AdminTenant[] }>(
    'GET',
    '/admin/tenants',
  );
  return body.tenants;
}

export async function createAdminTenant(
  slug: string,
  name: string,
): Promise<AdminTenant> {
  const body = await apiRequest<{ tenant: AdminTenant }>(
    'POST',
    '/admin/tenants',
    { slug, name },
  );
  return body.tenant;
}

export async function updateAdminTenant(
  id: string,
  data: { slug?: string; name?: string },
): Promise<AdminTenant> {
  const body = await apiRequest<{ tenant: AdminTenant }>(
    'PATCH',
    `/admin/tenants/${id}`,
    data,
  );
  return body.tenant;
}

export async function deleteAdminTenant(id: string): Promise<void> {
  await apiRequest<{ deleted: boolean }>('DELETE', `/admin/tenants/${id}`);
}

export async function listAdminUsers(tenantId?: string): Promise<AdminUser[]> {
  const query =
    tenantId === undefined ? '' : `?tenant_id=${encodeURIComponent(tenantId)}`;
  const body = await apiRequest<{ users: AdminUser[] }>(
    'GET',
    `/admin/users${query}`,
  );
  return body.users;
}

export async function createAdminUser(data: {
  tenant_id: string;
  email: string;
  name?: string;
  password: string;
}): Promise<AdminUser> {
  const body = await apiRequest<{ user: AdminUser }>(
    'POST',
    '/admin/users',
    data,
  );
  return body.user;
}

export async function updateAdminUser(
  id: string,
  data: {
    email?: string;
    name?: string;
    password?: string;
  },
): Promise<AdminUser> {
  const body = await apiRequest<{ user: AdminUser }>(
    'PATCH',
    `/admin/users/${id}`,
    data,
  );
  return body.user;
}

export async function deleteAdminUser(id: string): Promise<void> {
  await apiRequest<{ deleted: boolean }>('DELETE', `/admin/users/${id}`);
}

export async function listAdminConnections(params?: {
  tenantId?: string;
  userId?: string;
}): Promise<AdminConnection[]> {
  const query = new URLSearchParams();
  if (params?.tenantId !== undefined) {
    query.set('tenant_id', params.tenantId);
  }
  if (params?.userId !== undefined) {
    query.set('user_id', params.userId);
  }
  const suffix = query.toString() === '' ? '' : `?${query.toString()}`;
  const body = await apiRequest<{ connections: AdminConnection[] }>(
    'GET',
    `/admin/connections${suffix}`,
  );
  return body.connections;
}

export async function createAdminConnection(data: {
  user_id: string;
  site_url: string;
  email: string;
  api_token: string;
}): Promise<JiraConnectionState> {
  const body = await apiRequest<{ connection: JiraConnectionState }>(
    'POST',
    '/admin/connections',
    data,
  );
  return body.connection;
}

export async function getAdminConnection(
  id: string,
  revealToken = false,
): Promise<AdminConnectionDetail> {
  const query = revealToken ? '?reveal_token=true' : '';
  const body = await apiRequest<{ connection: AdminConnectionDetail }>(
    'GET',
    `/admin/connections/${id}${query}`,
  );
  return body.connection;
}

export async function updateAdminConnection(
  id: string,
  data: { site_url: string; email: string; api_token: string },
): Promise<JiraConnectionState> {
  const body = await apiRequest<{ connection: JiraConnectionState }>(
    'PATCH',
    `/admin/connections/${id}`,
    data,
  );
  return body.connection;
}

export async function testAdminConnection(
  id: string,
): Promise<JiraConnectionState> {
  return apiRequest<JiraConnectionState>(
    'POST',
    `/admin/connections/${id}/test`,
  );
}

export async function deleteAdminConnection(id: string): Promise<void> {
  await apiRequest<{ deleted: boolean }>('DELETE', `/admin/connections/${id}`);
}
