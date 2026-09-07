import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, AuditService } from '../../infra/audit';
import { openSecret, sealSecret } from '../../infra/crypto';
import { JiraNotConnectedError, ProjectNotFoundError } from '../../app/errors';
import { buildAdfDocument } from './jira.adf';
import { JiraClient, type JiraProjectSummary } from './jira.client';
import { JiraRepository, type JiraPrincipal } from './jira.repository';
import {
  JIRA_ISSUE_TYPE_TASK,
  JIRA_LABEL_FINDING,
  JIRA_RECENT_TICKETS_LIMIT,
} from './jira.constants';

export interface JiraConnectionState {
  connected: boolean;
  siteUrl?: string;
  email?: string;
  accountId?: string;
  displayName?: string;
  mode?: string;
}

export interface JiraRecentTicket {
  key: string;
  title: string;
  url: string;
  createdAt: string | null;
}

export interface JiraCreateResult {
  key: string;
  url: string;
}

export interface JiraAuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

const JIRA_PROJECTS_CACHE_TTL_MS = 60_000;

interface ProjectsCacheEntry {
  expiresAt: number;
  projects: JiraProjectSummary[];
}

@Injectable()
export class JiraService {
  private readonly logger = new Logger(JiraService.name);
  private readonly projectsCache = new Map<string, ProjectsCacheEntry>();

  constructor(
    private readonly jiraRepository: JiraRepository,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private appSecret(): string {
    return this.config.getOrThrow<string>('APP_SECRET');
  }

  private cacheTtlMs(): number {
    return this.config.get<number>('JIRA_CACHE_TTL_MS') ?? 60_000;
  }

  private async clientFor(
    tenantId: string,
    principal: JiraPrincipal,
  ): Promise<JiraClient> {
    const connection = await this.jiraRepository.findConnection(
      tenantId,
      principal,
    );
    if (
      !connection ||
      connection.mode !== 'api_token' ||
      !connection.site_url ||
      !connection.email ||
      !connection.api_token_cipher ||
      !connection.api_token_nonce
    ) {
      throw new JiraNotConnectedError();
    }
    const apiToken = openSecret(
      connection.api_token_cipher,
      connection.api_token_nonce,
      this.appSecret(),
    );
    return new JiraClient({
      siteUrl: connection.site_url,
      email: connection.email,
      apiToken,
    });
  }

  private principalId(principal: JiraPrincipal): string {
    return principal.kind === 'user' ? principal.userId : principal.apiKeyId;
  }

  async connect(
    tenantId: string,
    principal: JiraPrincipal,
    input: { siteUrl: string; email: string; apiToken: string },
    ctx: JiraAuditContext,
  ): Promise<JiraConnectionState> {
    const probe = new JiraClient(input);
    const myself = await probe.getMyself();

    let cloudId: string | null = null;
    try {
      const info = await probe.serverInfo();
      cloudId = info.cloudId || null;
    } catch (error) {
      this.logger.warn(
        `unable to read cloud id for ${probe.origin}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    const sealed = sealSecret(input.apiToken, this.appSecret());
    await this.jiraRepository.upsertApiTokenConnection(tenantId, principal, {
      siteUrl: probe.origin,
      email: input.email,
      apiTokenCipher: sealed.cipher,
      apiTokenNonce: sealed.nonce,
      cloudId,
    });
    this.projectsCache.delete(this.cacheKey(tenantId, principal));

    await this.audit.write({
      tenantId,
      userId: this.principalId(principal),
      action: AuditAction.JIRA_CONNECT,
      target: probe.origin,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return {
      connected: true,
      siteUrl: probe.origin,
      email: input.email,
      accountId: myself.accountId,
      displayName: myself.displayName,
      mode: 'api_token',
    };
  }

  async disconnect(
    tenantId: string,
    principal: JiraPrincipal,
    ctx: JiraAuditContext,
  ): Promise<{ status: string }> {
    await this.jiraRepository.deleteConnection(tenantId, principal);
    this.projectsCache.delete(this.cacheKey(tenantId, principal));
    await this.audit.write({
      tenantId,
      userId: this.principalId(principal),
      action: AuditAction.JIRA_DISCONNECT,
      target: 'jira_connection',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return { status: 'disconnected' };
  }

  async status(
    tenantId: string,
    principal: JiraPrincipal,
  ): Promise<JiraConnectionState> {
    const connection = await this.jiraRepository.findConnection(
      tenantId,
      principal,
    );
    if (
      !connection ||
      connection.mode !== 'api_token' ||
      !connection.site_url ||
      !connection.email
    ) {
      return { connected: false };
    }
    return {
      connected: true,
      siteUrl: connection.site_url,
      email: connection.email,
      mode: connection.mode,
    };
  }

  async listProjects(
    tenantId: string,
    principal: JiraPrincipal,
  ): Promise<JiraProjectSummary[]> {
    const key = this.cacheKey(tenantId, principal);
    const cached = this.projectsCache.get(key);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return cached.projects;
    }

    const client = await this.clientFor(tenantId, principal);
    const projects = await client.listProjects();
    this.projectsCache.set(key, {
      expiresAt: Date.now() + JIRA_PROJECTS_CACHE_TTL_MS,
      projects,
    });
    return projects;
  }

  private cacheKey(tenantId: string, principal: JiraPrincipal): string {
    return principal.kind === 'user'
      ? `${tenantId}:user:${principal.userId}`
      : `${tenantId}:key:${principal.apiKeyId}`;
  }

  async createTicket(
    tenantId: string,
    principal: JiraPrincipal,
    input: { projectKey: string; title: string; description: string },
    ctx: JiraAuditContext,
  ): Promise<JiraCreateResult> {
    const client = await this.clientFor(tenantId, principal);

    const projects = await client.listProjects();
    const projectKnown = projects.some((p) => p.key === input.projectKey);
    if (!projectKnown) {
      throw new ProjectNotFoundError(input.projectKey);
    }

    const description = buildAdfDocument(input.description);
    const created = await client.createIssue({
      projectKey: input.projectKey,
      summary: input.title,
      description,
      issueType: JIRA_ISSUE_TYPE_TASK,
      labels: [JIRA_LABEL_FINDING],
    });

    const now = new Date();
    await this.jiraRepository.upsertRecentTicket(tenantId, principal, {
      jiraSite: client.origin,
      projectKey: input.projectKey,
      issueKey: created.key,
      title: input.title,
      url: `${client.origin}/browse/${created.key}`,
      jiraCreatedAt: now,
      reconciledAt: now,
    });

    await this.audit.write({
      tenantId,
      userId: this.principalId(principal),
      action: AuditAction.JIRA_TICKET_CREATE,
      target: created.key,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return {
      key: created.key,
      url: `${client.origin}/browse/${created.key}`,
    };
  }

  async listRecentTickets(
    tenantId: string,
    principal: JiraPrincipal,
    projectKey: string,
    forcedRefresh = false,
  ): Promise<JiraRecentTicket[]> {
    const cached = await this.jiraRepository.findRecentTickets(
      tenantId,
      principal,
      projectKey,
      JIRA_RECENT_TICKETS_LIMIT,
    );
    const reconciledAt = await this.jiraRepository.lastReconciledAt(
      tenantId,
      principal,
      projectKey,
    );

    if (forcedRefresh) {
      return this.refreshFromJira(tenantId, principal, projectKey);
    }

    if (cached.length === 0) {
      return this.refreshFromJira(tenantId, principal, projectKey);
    }

    const isFresh =
      reconciledAt !== null &&
      Date.now() - reconciledAt.getTime() < this.cacheTtlMs();
    if (!isFresh) {
      void this.refreshFromJira(tenantId, principal, projectKey).catch(
        (error) =>
          this.logger.warn('background recent-tickets refresh failed', error),
      );
    }

    return cached.map(toRecentTicket);
  }

  private async refreshFromJira(
    tenantId: string,
    principal: JiraPrincipal,
    projectKey: string,
  ): Promise<JiraRecentTicket[]> {
    const client = await this.clientFor(tenantId, principal);
    const jql =
      `project = "${projectKey}" AND labels = "${JIRA_LABEL_FINDING}" ` +
      `ORDER BY created DESC`;

    const issues = await client.searchByJql(jql, JIRA_RECENT_TICKETS_LIMIT);
    const now = new Date();
    await this.jiraRepository.syncRecentTickets(tenantId, principal, {
      jiraSite: client.origin,
      projectKey,
      reconciledAt: now,
      issues: issues.map((issue) => ({
        key: issue.key,
        title: issue.fields.summary ?? '',
        createdAt: jiraDateToDate(issue.fields.created) ?? now,
      })),
    });

    return issues.map((issue) => ({
      key: issue.key,
      title: issue.fields.summary ?? '',
      url: `${client.origin}/browse/${issue.key}`,
      createdAt: normalizeJiraDate(issue.fields.created),
    }));
  }
}

function jiraDateToDate(value: string | undefined): Date | null {
  if (value === undefined) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeJiraDate(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toRecentTicket(
  ticket: Awaited<ReturnType<JiraRepository['findRecentTickets']>>[number],
): JiraRecentTicket {
  return {
    key: ticket.issue_key,
    title: ticket.title,
    url: ticket.url,
    createdAt: ticket.jira_created_at.toISOString(),
  };
}
