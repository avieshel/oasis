import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/db';

export type JiraConnectionMode = 'api_token' | 'oauth';

@Injectable()
export class JiraRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(tenantId: string, userId: string) {
    return this.prisma.jira_connections.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
      },
    });
  }

  async deleteByUser(tenantId: string, userId: string) {
    return this.prisma.jira_connections.deleteMany({
      where: {
        tenant_id: tenantId,
        user_id: userId,
      },
    });
  }

  async upsertApiTokenConnection(
    tenantId: string,
    userId: string,
    data: {
      siteUrl: string;
      email: string;
      apiTokenCipher: string;
      apiTokenNonce: string;
      cloudId: string | null;
    },
  ) {
    return this.prisma.jira_connections.upsert({
      where: { user_id: userId },
      update: {
        tenant_id: tenantId,
        mode: 'api_token',
        site_url: data.siteUrl,
        email: data.email,
        cloud_id: data.cloudId,
        api_token_cipher: data.apiTokenCipher,
        api_token_nonce: data.apiTokenNonce,
        access_token_cipher: null,
        access_token_nonce: null,
        refresh_token_cipher: null,
        refresh_token_nonce: null,
        oauth_expires_at: null,
        oauth_scopes: null,
      },
      create: {
        tenant_id: tenantId,
        user_id: userId,
        mode: 'api_token',
        site_url: data.siteUrl,
        email: data.email,
        cloud_id: data.cloudId,
        api_token_cipher: data.apiTokenCipher,
        api_token_nonce: data.apiTokenNonce,
      },
    });
  }

  async findRecentTickets(
    tenantId: string,
    userId: string,
    projectKey: string,
    limit: number,
  ) {
    return this.prisma.tickets_cache.findMany({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        project_key: projectKey,
      },
      orderBy: { jira_created_at: 'desc' },
      take: limit,
    });
  }

  async lastReconciledAt(
    tenantId: string,
    userId: string,
    projectKey: string,
  ): Promise<Date | null> {
    const result = await this.prisma.tickets_cache.aggregate({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        project_key: projectKey,
      },
      _max: { reconciled_at: true },
    });
    return result._max.reconciled_at;
  }

  async upsertRecentTicket(
    tenantId: string,
    userId: string,
    data: {
      jiraSite: string;
      projectKey: string;
      issueKey: string;
      title: string;
      url: string;
      jiraCreatedAt: Date;
      reconciledAt: Date;
    },
  ) {
    return this.prisma.tickets_cache.upsert({
      where: {
        user_id_jira_site_project_key_issue_key: {
          user_id: userId,
          jira_site: data.jiraSite,
          project_key: data.projectKey,
          issue_key: data.issueKey,
        },
      },
      create: {
        tenant_id: tenantId,
        user_id: userId,
        jira_site: data.jiraSite,
        project_key: data.projectKey,
        issue_key: data.issueKey,
        title: data.title,
        url: data.url,
        jira_created_at: data.jiraCreatedAt,
        reconciled_at: data.reconciledAt,
      },
      update: {
        title: data.title,
        url: data.url,
        jira_created_at: data.jiraCreatedAt,
        reconciled_at: data.reconciledAt,
      },
    });
  }

  async syncRecentTickets(
    tenantId: string,
    userId: string,
    data: {
      jiraSite: string;
      projectKey: string;
      reconciledAt: Date;
      issues: { key: string; title: string; createdAt: Date }[];
    },
  ) {
    const whereScope = {
      tenant_id: tenantId,
      user_id: userId,
      jira_site: data.jiraSite,
      project_key: data.projectKey,
    };
    const deleteStale =
      data.issues.length === 0
        ? this.prisma.tickets_cache.deleteMany({ where: whereScope })
        : this.prisma.tickets_cache.deleteMany({
            where: {
              ...whereScope,
              issue_key: {
                notIn: data.issues.map((issue) => issue.key),
              },
            },
          });
    await this.prisma.$transaction([
      ...data.issues.map((issue) =>
        this.prisma.tickets_cache.upsert({
          where: {
            user_id_jira_site_project_key_issue_key: {
              user_id: userId,
              jira_site: data.jiraSite,
              project_key: data.projectKey,
              issue_key: issue.key,
            },
          },
          create: {
            tenant_id: tenantId,
            user_id: userId,
            jira_site: data.jiraSite,
            project_key: data.projectKey,
            issue_key: issue.key,
            title: issue.title,
            url: `${data.jiraSite}/browse/${issue.key}`,
            jira_created_at: issue.createdAt,
            reconciled_at: data.reconciledAt,
          },
          update: {
            title: issue.title,
            url: `${data.jiraSite}/browse/${issue.key}`,
            jira_created_at: issue.createdAt,
            reconciled_at: data.reconciledAt,
          },
        }),
      ),
      deleteStale,
    ]);
    return data.issues.length;
  }
}
