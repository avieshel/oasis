import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/db';

export type JiraConnectionMode = 'api_token' | 'oauth';

export type JiraPrincipal =
  { kind: 'user'; userId: string } | { kind: 'api_key'; apiKeyId: string };

function principalScope(principal: JiraPrincipal): {
  user_id?: string;
  api_key_id?: string;
} {
  return principal.kind === 'user'
    ? { user_id: principal.userId }
    : { api_key_id: principal.apiKeyId };
}

function principalUnique(
  principal: JiraPrincipal,
): { user_id: string } | { api_key_id: string } {
  return principal.kind === 'user'
    ? { user_id: principal.userId }
    : { api_key_id: principal.apiKeyId };
}

function principalWrite(
  principal: JiraPrincipal,
): { user_id: string } | { api_key_id: string } {
  return principalUnique(principal);
}

@Injectable()
export class JiraRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findConnection(tenantId: string, principal: JiraPrincipal) {
    return this.prisma.jira_connections.findFirst({
      where: {
        tenant_id: tenantId,
        ...principalScope(principal),
      },
    });
  }

  async deleteConnection(tenantId: string, principal: JiraPrincipal) {
    return this.prisma.jira_connections.deleteMany({
      where: {
        tenant_id: tenantId,
        ...principalScope(principal),
      },
    });
  }

  async upsertApiTokenConnection(
    tenantId: string,
    principal: JiraPrincipal,
    data: {
      siteUrl: string;
      email: string;
      apiTokenCipher: string;
      apiTokenNonce: string;
      cloudId: string | null;
    },
  ) {
    const where = principalUnique(principal);
    return this.prisma.jira_connections.upsert({
      where,
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
        ...principalWrite(principal),
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
    principal: JiraPrincipal,
    projectKey: string,
    limit: number,
  ) {
    return this.prisma.tickets_cache.findMany({
      where: {
        tenant_id: tenantId,
        ...principalScope(principal),
        project_key: projectKey,
      },
      orderBy: { jira_created_at: 'desc' },
      take: limit,
    });
  }

  async lastReconciledAt(
    tenantId: string,
    principal: JiraPrincipal,
    projectKey: string,
  ): Promise<Date | null> {
    const result = await this.prisma.tickets_cache.aggregate({
      where: {
        tenant_id: tenantId,
        ...principalScope(principal),
        project_key: projectKey,
      },
      _max: { reconciled_at: true },
    });
    return result._max.reconciled_at;
  }

  async upsertRecentTicket(
    tenantId: string,
    principal: JiraPrincipal,
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
    const base = {
      tenant_id: tenantId,
      ...principalWrite(principal),
      jira_site: data.jiraSite,
      project_key: data.projectKey,
      issue_key: data.issueKey,
    };
    const unique =
      principal.kind === 'user'
        ? {
            user_id_jira_site_project_key_issue_key: {
              user_id: principal.userId,
              jira_site: data.jiraSite,
              project_key: data.projectKey,
              issue_key: data.issueKey,
            },
          }
        : {
            api_key_id_jira_site_project_key_issue_key: {
              api_key_id: principal.apiKeyId,
              jira_site: data.jiraSite,
              project_key: data.projectKey,
              issue_key: data.issueKey,
            },
          };
    return this.prisma.tickets_cache.upsert({
      where: unique,
      create: {
        ...base,
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
    principal: JiraPrincipal,
    data: {
      jiraSite: string;
      projectKey: string;
      reconciledAt: Date;
      issues: { key: string; title: string; createdAt: Date }[];
    },
  ) {
    const whereScope = {
      tenant_id: tenantId,
      ...principalScope(principal),
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
    const upserts = data.issues.map((issue) => {
      const unique =
        principal.kind === 'user'
          ? {
              user_id_jira_site_project_key_issue_key: {
                user_id: principal.userId,
                jira_site: data.jiraSite,
                project_key: data.projectKey,
                issue_key: issue.key,
              },
            }
          : {
              api_key_id_jira_site_project_key_issue_key: {
                api_key_id: principal.apiKeyId,
                jira_site: data.jiraSite,
                project_key: data.projectKey,
                issue_key: issue.key,
              },
            };
      return this.prisma.tickets_cache.upsert({
        where: unique,
        create: {
          tenant_id: tenantId,
          ...principalWrite(principal),
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
      });
    });
    await this.prisma.$transaction([...upserts, deleteStale]);
    return data.issues.length;
  }
}
