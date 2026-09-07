import { apiRequest } from './client';

export interface AdminStatus {
  enabled: boolean;
  tenantCount: number;
  userCount: number;
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
