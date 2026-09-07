import { apiRequest } from './client';

export interface AppUser {
  id: string;
  email: string;
  tenantId: string;
  tenantName: string;
}

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
}

interface UserResponse {
  user: AppUser;
}

export async function me(): Promise<AppUser> {
  const res = await apiRequest<UserResponse>('GET', '/auth/me');
  return res.user;
}

export async function login(email: string, password: string): Promise<AppUser> {
  const res = await apiRequest<UserResponse>('POST', '/auth/login', {
    email,
    password,
  });
  return res.user;
}

export async function listTenants(): Promise<TenantSummary[]> {
  const res = await apiRequest<{ tenants: TenantSummary[] }>('GET', '/tenants');
  return res.tenants;
}

export interface SignupTenantSelection {
  tenant_id?: string;
  new_tenant?: { slug: string; name: string };
}

export async function signup(
  email: string,
  password: string,
  selection?: SignupTenantSelection,
): Promise<AppUser> {
  const res = await apiRequest<UserResponse>('POST', '/signup', {
    email,
    password,
    ...selection,
  });
  return res.user;
}

export async function logout(): Promise<void> {
  await apiRequest<{ status: string }>('POST', '/auth/logout');
}
