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

export interface JiraServerInfo {
  cloudId: string;
  deploymentType: string;
  version: string;
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
    project?: { key?: string };
  };
}

export interface JiraClientOptions {
  siteUrl: string;
  email: string;
  apiToken: string;
}

const JIRA_CONNECT_TIMEOUT_MS = 10_000;
const JIRA_RESPONSE_TIMEOUT_MS = 30_000;
const JIRA_MAX_RETRIES = 2;
const JIRA_RETRY_BASE_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class JiraRetryableUpstreamError extends UpstreamError {
  constructor(detail: string) {
    super(detail);
    this.name = 'JiraRetryableUpstreamError';
  }
}

function isRetryableError(error: unknown): error is JiraRetryableUpstreamError {
  return error instanceof JiraRetryableUpstreamError;
}

function jiraNetworkError(error: unknown): JiraRetryableUpstreamError {
  if (error instanceof Error && error.name === 'AbortError') {
    return new JiraRetryableUpstreamError('Jira request timed out');
  }
  return new JiraRetryableUpstreamError('Jira request failed');
}

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
    const retryable = method === 'GET';
    const attempts = retryable ? 1 + JIRA_MAX_RETRIES : 1;
    let lastError: UpstreamError | undefined;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(JIRA_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
      try {
        return await this.attemptCall<T>(path, method, body);
      } catch (error) {
        if (!retryable || !isRetryableError(error)) {
          throw error;
        }
        lastError = error;
      }
    }
    throw lastError ?? new UpstreamError('Jira request failed');
  }

  private async attemptCall<T>(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
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
        signal: AbortSignal.timeout(JIRA_CONNECT_TIMEOUT_MS),
      });
    } catch (error) {
      throw jiraNetworkError(error);
    }
    return this.handleResponse<T>(response);
  }

  private async bodyText(response: Response): Promise<string> {
    const timer = setTimeout(() => {
      void response.body?.cancel();
    }, JIRA_RESPONSE_TIMEOUT_MS);
    try {
      return await response.text();
    } catch {
      throw new JiraRetryableUpstreamError('Jira response timed out');
    } finally {
      clearTimeout(timer);
    }
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const body = await this.bodyText(response);
    if (response.status === 429) {
      const raw = response.headers.get('retry-after');
      const retryAfter = raw === null ? 0 : Number(raw);
      throw new RateLimitedError(
        Number.isFinite(retryAfter) ? retryAfter : 0,
        'Jira rate limit hit',
      );
    }

    const detail = this.errorDetail(response, body);
    if (response.status === 401) {
      throw new UnauthorizedError(detail ?? 'Jira rejected the credentials');
    }
    if (response.status === 403) {
      throw new PermissionDeniedError(detail ?? 'Jira denied access');
    }
    if (response.status === 404) {
      throw new NotFoundError(
        'Jira resource',
        detail ?? 'Jira resource not found',
      );
    }
    if (
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      throw new JiraRetryableUpstreamError(
        detail ?? `Jira API error (HTTP ${response.status})`,
      );
    }
    if (!response.ok) {
      throw new UpstreamError(
        detail ?? `Jira API error (HTTP ${response.status})`,
      );
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new JiraRetryableUpstreamError('Jira returned an invalid response');
    }
  }

  private errorDetail(response: Response, body: string): string | undefined {
    try {
      const raw = JSON.parse(body) as {
        errorMessages?: unknown;
        errors?: unknown;
        message?: unknown;
      };
      const parts: string[] = [];
      const messages = raw.errorMessages;
      if (Array.isArray(messages)) {
        parts.push(...messages.map((m) => String(m)));
      }
      const fields = raw.errors;
      if (fields !== null && typeof fields === 'object') {
        for (const [key, value] of Object.entries(fields)) {
          parts.push(`${key}: ${String(value)}`);
        }
      }
      if (raw.message !== undefined && typeof raw.message === 'string') {
        parts.push(raw.message);
      }
      return parts.length > 0 ? parts.join('; ') : undefined;
    } catch {
      return undefined;
    }
  }

  async getMyself(): Promise<JiraUserSelf> {
    return this.request<JiraUserSelf>('/rest/api/3/myself');
  }

  async serverInfo(): Promise<JiraServerInfo> {
    return this.request<JiraServerInfo>('/rest/api/3/serverInfo');
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
      fields: 'summary,created,project',
    });
    const data = await this.request<{
      issues: JiraIssueSearchResult[];
    }>(`/rest/api/3/search/jql?${params.toString()}`);
    return data.issues;
  }
}
