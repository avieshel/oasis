import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailTakenError,
  JiraNotConnectedError,
  NotFoundError,
  SlugTakenError,
} from '../../app/errors';
import { hashPassword, openSecret } from '../../infra/crypto';
import { JiraService, type JiraAuditContext } from '../jira/jira.service';
import { AdminRepository } from './admin.repository';

@Injectable()
export class AdminService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly jiraService: JiraService,
    private readonly config: ConfigService,
  ) {}

  async status() {
    const [
      tenantCount,
      userCount,
      connectionCount,
      apiKeyCount,
      itemCount,
      ticketCount,
    ] = await Promise.all([
      this.repository.countTenants(),
      this.repository.countUsers(),
      this.repository.countConnections(),
      this.repository.countApiKeys(),
      this.repository.countItems(),
      this.repository.countTickets(),
    ]);
    return {
      tenantCount,
      userCount,
      connectionCount,
      apiKeyCount,
      itemCount,
      ticketCount,
    };
  }

  async listTenants() {
    return this.repository.listTenants();
  }

  async createTenant(slug: string, name: string) {
    const existing = await this.repository.findTenantBySlug(slug);
    if (existing) {
      throw new SlugTakenError();
    }
    return this.repository.createTenant(slug, name);
  }

  async updateTenant(id: string, data: { slug?: string; name?: string }) {
    const tenant = await this.repository.findTenantById(id);
    if (!tenant) {
      throw new NotFoundError('Tenant');
    }
    if (data.slug !== undefined && data.slug !== tenant.slug) {
      const taken = await this.repository.findTenantBySlug(data.slug);
      if (taken && taken.id !== id) {
        throw new SlugTakenError();
      }
    }
    return this.repository.updateTenant(id, data);
  }

  async deleteTenant(id: string): Promise<void> {
    const tenant = await this.repository.findTenantById(id);
    if (!tenant) {
      throw new NotFoundError('Tenant');
    }
    await this.repository.deleteTenantCascaded(id);
  }

  async listUsers(tenantId?: string) {
    return this.repository.listUsers(tenantId);
  }

  async createUser(
    tenantId: string,
    email: string,
    password: string,
    name: string | null,
  ) {
    const tenant = await this.repository.findTenantById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant');
    }
    const existing = await this.repository.findUserByEmail(email);
    if (existing) {
      throw new EmailTakenError();
    }
    const passwordHash = await hashPassword(password);
    return this.repository.createUser(tenantId, email, passwordHash, name);
  }

  async updateUser(
    id: string,
    data: {
      email?: string;
      name?: string;
      password?: string;
    },
  ) {
    const user = await this.repository.findUserById(id);
    if (!user) {
      throw new NotFoundError('User');
    }
    if (data.email !== undefined && data.email !== user.email) {
      const taken = await this.repository.findUserByEmail(data.email);
      if (taken && taken.id !== id) {
        throw new EmailTakenError();
      }
    }
    const passwordHash =
      data.password === undefined
        ? undefined
        : await hashPassword(data.password);
    if (data.password !== undefined) {
      await this.repository.kickUserSessions(id);
    }
    return this.repository.updateUser(id, {
      email: data.email,
      name: data.name,
      password_hash: passwordHash,
    });
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.repository.findUserById(id);
    if (!user) {
      throw new NotFoundError('User');
    }
    await this.repository.deleteUserCascaded(id);
  }

  async listConnections(filter?: { userId?: string; tenantId?: string }) {
    return this.repository.listConnections(filter);
  }

  async createConnection(
    userId: string,
    input: { siteUrl: string; email: string; apiToken: string },
    ctx: JiraAuditContext,
  ) {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User');
    }
    return this.jiraService.connect(
      user.tenant_id,
      { kind: 'user', userId },
      input,
      ctx,
    );
  }

  async updateConnection(
    id: string,
    input: { siteUrl: string; email: string; apiToken: string },
    ctx: JiraAuditContext,
  ) {
    const connection = await this.repository.findConnectionById(id);
    if (!connection) {
      throw new NotFoundError('Connection');
    }
    if (connection.user_id === null) {
      throw new NotFoundError('Connection');
    }
    const user = await this.repository.findUserById(connection.user_id);
    if (!user) {
      throw new NotFoundError('User');
    }
    return this.jiraService.connect(
      user.tenant_id,
      { kind: 'user', userId: connection.user_id },
      input,
      ctx,
    );
  }

  async deleteConnection(id: string): Promise<boolean> {
    return this.repository.deleteConnectionCascaded(id);
  }

  async connectionDetail(id: string, revealToken: boolean) {
    const connection = await this.repository.findConnectionById(id);
    if (!connection) {
      throw new NotFoundError('Connection');
    }
    const base = {
      id: connection.id,
      userId: connection.user_id,
      apiKeyId: connection.api_key_id,
      mode: connection.mode,
      siteUrl: connection.site_url,
      email: connection.email,
      hasApiToken: connection.api_token_cipher !== null,
      hasOauthTokens: connection.access_token_cipher !== null,
      createdAt: connection.created_at,
    };
    if (!revealToken) {
      return { ...base, tokenRevealed: false };
    }
    if (!connection.api_token_cipher || !connection.api_token_nonce) {
      throw new JiraNotConnectedError();
    }
    const apiToken = openSecret(
      connection.api_token_cipher,
      connection.api_token_nonce,
      this.config.getOrThrow<string>('APP_SECRET'),
    );
    return { ...base, tokenRevealed: true, apiToken };
  }

  async testConnection(id: string, ctx: JiraAuditContext) {
    const connection = await this.repository.findConnectionById(id);
    if (!connection) {
      throw new NotFoundError('Connection');
    }
    const principal =
      connection.user_id !== null
        ? { kind: 'user' as const, userId: connection.user_id }
        : connection.api_key_id !== null
          ? { kind: 'api_key' as const, apiKeyId: connection.api_key_id }
          : null;
    if (principal === null) {
      throw new NotFoundError('Connection');
    }
    return this.jiraService.testConnection(
      connection.tenant_id,
      principal,
      ctx,
    );
  }
}
