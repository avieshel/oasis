import type { AdfDocument } from './jira.adf';
import {
  NotFoundError,
  PermissionDeniedError,
  RateLimitedError,
  UnauthorizedError,
  UpstreamError,
} from '../../app/errors/error-classes';

export interface JiraUserSelf {
  accountId: string;
  accountType: string;
  active: boolean;
  displayName: string;
  timeZone?: string;
  locale?: string;
}

export interface JiraProjectSummary {
  key: string;
  name: string;
  projectTypeKey: string;
  style?: string;
}

export interface JiraCreatedIssue {
  id: string;
  key: string;
  self: string;
}

export interface JiraIssueSearchResult {
  key: string;
  fields: {
    summary?: string;
    created?: string;
  };
}

export interface JiraClientOptions {
  siteUrl: string;
  email: string;
  apiToken: string;
}

export const JIRA_REQUEST_TIMEOUT_MS = 10_000;

function normalizeSiteUrl(siteUrl: string): string {
  const url = new URL(siteUrl);
  if (url.protocol !== 'https:') {
    throw new UpstreamError('Jira site must be reached over https');
  }
  return url.origin;
}

export class JiraClient {
  private readonly siteUrl: string;
  private readonly authHeader: string;

  constructor(options: JiraClientOptions) {
    this.siteUrl = normalizeSiteUrl(options.siteUrl);
    const encoded = Buffer.from(
      `${options.email}:${options.apiToken}`,
      'utf8',
    ).toString('base64');
    this.authHeader = `Basic ${encoded}`;
  }

  get origin(): string {
    return this.siteUrl;
  }

  private async request<T>(
    path: string,
    method: string = 'GET',
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      JIRA_REQUEST_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await fetch(`${this.siteUrl}${path}`, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new UpstreamError('Jira request timed out');
      }
      throw new UpstreamError('Jira request failed');
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429) {
      const raw = response.headers.get('retry-after');
      const retryAfter = raw === null ? 0 : Number(raw);
      throw new RateLimitedError(
        Number.isFinite(retryAfter) ? retryAfter : 0,
        'Jira rate limit hit',
      );
    }
    if (response.status === 401) {
      throw new UnauthorizedError('Jira rejected the credentials');
    }
    if (response.status === 403) {
      throw new PermissionDeniedError('Jira denied access');
    }
    if (response.status === 404) {
      throw new NotFoundError('Jira resource', 'Jira resource not found');
    }
    if (!response.ok) {
      throw new UpstreamError(`Jira API error (HTTP ${response.status})`);
    }

    return (await response.json()) as T;
  }

  async getMyself(): Promise<JiraUserSelf> {
    return this.request<JiraUserSelf>('/rest/api/3/myself');
  }

  async listProjects(maxResults = 100): Promise<JiraProjectSummary[]> {
    const data = await this.request<{ values: JiraProjectSummary[] }>(
      `/rest/api/3/project/search?maxResults=${maxResults}`,
    );
    return data.values;
  }

  async createIssue(input: {
    projectKey: string;
    summary: string;
    description: AdfDocument;
    issueType: string;
    labels: string[];
  }): Promise<JiraCreatedIssue> {
    return this.request<JiraCreatedIssue>('/rest/api/3/issue', 'POST', {
      fields: {
        project: { key: input.projectKey },
        summary: input.summary,
        issuetype: { name: input.issueType },
        description: input.description,
        labels: input.labels,
      },
    });
  }

  async searchByJql(
    jql: string,
    maxResults: number,
  ): Promise<JiraIssueSearchResult[]> {
    const params = new URLSearchParams({
      jql,
      maxResults: String(maxResults),
      fields: 'summary,created',
    });
    const data = await this.request<{
      issues: JiraIssueSearchResult[];
    }>(`/rest/api/3/search?${params.toString()}`);
    return data.issues;
  }
}
