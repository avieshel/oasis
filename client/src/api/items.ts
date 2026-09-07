import { apiRequest } from './client';

export type ItemSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type ItemStatus = 'new' | 'closed' | 'jira-ticket';

export interface OasisItem {
  id: string;
  scanner: string;
  itemType: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  jiraKey: string | null;
  jiraUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemsSummary {
  new: number;
  closed: number;
  jiraTicket: number;
  total: number;
}

export interface ItemsFilters {
  status?: ItemStatus;
  severity?: ItemSeverity;
  type?: string;
  limit?: number;
}

export interface ItemsPage {
  items: OasisItem[];
  total: number;
}

export async function listItems(filters?: ItemsFilters): Promise<ItemsPage> {
  const params = new URLSearchParams();
  if (filters?.status !== undefined) {
    params.set('status', filters.status);
  }
  if (filters?.severity !== undefined) {
    params.set('severity', filters.severity);
  }
  if (filters?.type !== undefined) {
    params.set('type', filters.type);
  }
  if (filters?.limit !== undefined) {
    params.set('limit', String(filters.limit));
  }
  const qs = params.toString();
  return apiRequest<ItemsPage>('GET', `/items${qs.length > 0 ? `?${qs}` : ''}`);
}

export async function itemsSummary(): Promise<ItemsSummary> {
  return apiRequest<ItemsSummary>('GET', '/items/summary');
}

export async function generateRandomItem(): Promise<OasisItem> {
  return apiRequest<OasisItem>('POST', '/items/random');
}

export async function updateItemStatus(
  id: string,
  status: 'new' | 'closed',
): Promise<OasisItem> {
  return apiRequest<OasisItem>('PATCH', `/items/${id}`, { status });
}

export async function createItemTicket(
  id: string,
  projectKey: string,
): Promise<{ item: OasisItem; ticket: { key: string; url: string } }> {
  return apiRequest('POST', `/items/${id}/ticket`, {
    project_key: projectKey,
  });
}
