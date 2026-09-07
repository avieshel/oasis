import { apiRequest } from './client';

export interface JiraConnectionState {
  connected: boolean;
  siteUrl?: string;
  email?: string;
  accountId?: string;
  displayName?: string;
  mode?: string;
}

export interface JiraProjectSummary {
  key: string;
  name: string;
  projectTypeKey: string;
  style?: string;
}

export interface JiraRecentTicket {
  key: string;
  title: string;
  url: string;
  createdAt: string | null;
  projectKey: string;
}

export interface JiraCreateResult {
  key: string;
  url: string;
}

export async function connectJira(
  siteUrl: string,
  email: string,
  apiToken: string,
): Promise<JiraConnectionState> {
  return apiRequest<JiraConnectionState>('POST', '/jira/connect', {
    site_url: siteUrl,
    email,
    api_token: apiToken,
  });
}

export async function disconnectJira(): Promise<{ status: string }> {
  return apiRequest<{ status: string }>('DELETE', '/jira/connect');
}

export async function jiraStatus(): Promise<JiraConnectionState> {
  return apiRequest<JiraConnectionState>('GET', '/jira/status');
}

export async function listProjects(): Promise<JiraProjectSummary[]> {
  return apiRequest<JiraProjectSummary[]>('GET', '/jira/projects');
}

export async function createTicket(
  projectKey: string,
  title: string,
  description: string,
): Promise<JiraCreateResult> {
  return apiRequest<JiraCreateResult>('POST', '/jira/tickets', {
    project_key: projectKey,
    title,
    description,
  });
}

export async function listRecentTickets(
  projectKey: string | null,
  refresh = false,
): Promise<JiraRecentTicket[]> {
  const params = new URLSearchParams();
  if (projectKey !== null) {
    params.set('project_key', projectKey);
  }
  if (refresh) {
    params.set('refresh', 'true');
  }
  const query = params.toString();
  return apiRequest<JiraRecentTicket[]>(
    'GET',
    `/jira/tickets/recent${query === '' ? '' : `?${query}`}`,
  );
}
