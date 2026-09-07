import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, AuditService } from '../../infra/audit';
import { openSecret, sealSecret } from '../../infra/crypto';
import { JiraNotConnectedError, ProjectNotFoundError } from '../../app/errors';
import { buildAdfDocument } from './jira.adf';
import { JiraClient, type JiraProjectSummary } from './jira.client';
import {
  JIRA_ISSUE_TYPE_TASK,
  JIRA_LABEL_FINDING,
  JIRA_RECENT_TICKETS_LIMIT,
} from './jira.constants';
import { JiraRepository } from './jira.repository';

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

@Injectable()
export class JiraService {
  constructor(
    private readonly jiraRepository: JiraRepository,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private appSecret(): string {
    return this.config.getOrThrow<string>('APP_SECRET');
  }

  private async clientFor(
    tenantId: string,
    userId: string,
  ): Promise<JiraClient> {
    const connection = await this.jiraRepository.findByUser(tenantId, userId);
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

  async connect(
    tenantId: string,
    userId: string,
    input: { siteUrl: string; email: string; apiToken: string },
    ctx: JiraAuditContext,
  ): Promise<JiraConnectionState> {
    const probe = new JiraClient(input);
    const myself = await probe.getMyself();

    const sealed = sealSecret(input.apiToken, this.appSecret());
    await this.jiraRepository.upsertApiTokenConnection(tenantId, userId, {
      siteUrl: probe.origin,
      email: input.email,
      apiTokenCipher: sealed.cipher,
      apiTokenNonce: sealed.nonce,
    });

    await this.audit.write({
      tenantId,
      userId,
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
    userId: string,
    ctx: JiraAuditContext,
  ): Promise<{ status: string }> {
    await this.jiraRepository.deleteByUser(tenantId, userId);
    await this.audit.write({
      tenantId,
      userId,
      action: AuditAction.JIRA_DISCONNECT,
      target: 'jira_connection',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return { status: 'disconnected' };
  }

  async status(tenantId: string, userId: string): Promise<JiraConnectionState> {
    const connection = await this.jiraRepository.findByUser(tenantId, userId);
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
    userId: string,
  ): Promise<JiraProjectSummary[]> {
    const client = await this.clientFor(tenantId, userId);
    return client.listProjects();
  }

  async createTicket(
    tenantId: string,
    userId: string,
    input: { projectKey: string; title: string; description: string },
    ctx: JiraAuditContext,
  ): Promise<JiraCreateResult> {
    const client = await this.clientFor(tenantId, userId);

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

    await this.audit.write({
      tenantId,
      userId,
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
    userId: string,
    projectKey: string,
  ): Promise<JiraRecentTicket[]> {
    const client = await this.clientFor(tenantId, userId);
    const jql =
      `project = "${projectKey}" AND labels = "${JIRA_LABEL_FINDING}" ` +
      `ORDER BY created DESC`;

    const issues = await client.searchByJql(jql, JIRA_RECENT_TICKETS_LIMIT);

    return issues.map((issue) => ({
      key: issue.key,
      title: issue.fields.summary ?? '',
      url: `${client.origin}/browse/${issue.key}`,
      createdAt: issue.fields.created ?? null,
    }));
  }
}
