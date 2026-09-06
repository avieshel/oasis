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
    },
  ) {
    return this.prisma.jira_connections.upsert({
      where: { user_id: userId },
      update: {
        tenant_id: tenantId,
        mode: 'api_token',
        site_url: data.siteUrl,
        email: data.email,
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
        api_token_cipher: data.apiTokenCipher,
        api_token_nonce: data.apiTokenNonce,
      },
    });
  }
}
