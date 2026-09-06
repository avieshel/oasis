import { apiRequest } from './client';

export interface AppUser {
  id: string;
  email: string;
  tenantId: string;
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

export async function signup(
  email: string,
  password: string,
): Promise<AppUser> {
  const res = await apiRequest<UserResponse>('POST', '/signup', {
    email,
    password,
  });
  return res.user;
}

export async function logout(): Promise<void> {
  await apiRequest<{ status: string }>('POST', '/auth/logout');
}
