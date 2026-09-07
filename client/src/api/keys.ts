import { apiRequest } from './client';
import type { JiraConnectionState } from './jira';

export interface ApiKeyMeta {
  id: string;
  name: string;
  allowedProjectKeys: string[] | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ApiKeyCreated {
  key: ApiKeyMeta;
  rawKey: string;
}

export async function createApiKey(
  name: string,
  allowedProjectKeys: string[] | null,
): Promise<ApiKeyCreated> {
  return apiRequest<ApiKeyCreated>('POST', '/api-keys', {
    name,
    ...(allowedProjectKeys === null
      ? {}
      : { allowed_project_keys: allowedProjectKeys }),
  });
}

export async function listApiKeys(): Promise<ApiKeyMeta[]> {
  return apiRequest<ApiKeyMeta[]>('GET', '/api-keys');
}

export async function revokeApiKey(id: string): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('DELETE', `/api-keys/${id}`);
}

export async function connectKeyJira(
  id: string,
  siteUrl: string,
  email: string,
  apiToken: string,
): Promise<JiraConnectionState> {
  return apiRequest<JiraConnectionState>(
    'POST',
    `/api-keys/${id}/jira/connect`,
    { site_url: siteUrl, email, api_token: apiToken },
  );
}

export async function disconnectKeyJira(
  id: string,
): Promise<{ status: string }> {
  return apiRequest<{ status: string }>(
    'DELETE',
    `/api-keys/${id}/jira/connect`,
  );
}

export async function keyJiraStatus(id: string): Promise<JiraConnectionState> {
  return apiRequest<JiraConnectionState>('GET', `/api-keys/${id}/jira/status`);
}
