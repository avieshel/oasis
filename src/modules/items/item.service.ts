import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { AuditAction, AuditService } from '../../infra/audit';
import { NotFoundError } from '../../app/errors';
import { ITEM_SEVERITIES, type ItemsQuery } from '../../app/validation';
import { JiraService, type JiraAuditContext } from '../jira/jira.service';
import {
  ItemRepository,
  type ItemRecord,
  type ItemStatus,
  type NewItem,
} from './item.repository';

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

export interface ItemAuditContext {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}

interface RandomTemplate {
  itemType: string;
  title: string;
  description: string;
  severity: (typeof ITEM_SEVERITIES)[number];
}

const SCANNERS = [
  'oasis-iam-scanner',
  'oasis-secret-scanner',
  'oasis-entra-scanner',
  'oasis-github-scanner',
];

const RANDOM_TEMPLATES: RandomTemplate[] = [
  {
    itemType: 'service_identity_unused',
    title: 'Service identity not used in %d days',
    description:
      'The service account has not authenticated within the review window and can likely be deprovisioned.',
    severity: 'medium',
  },
  {
    itemType: 'expired_credentials',
    title: 'Expired credentials on %s',
    description:
      'Credential rotation policy exceeded; the identity can no longer authenticate.',
    severity: 'critical',
  },
  {
    itemType: 'overprivileged_api_key',
    title: 'Service account with admin scope',
    description:
      'The identity holds administrative privileges that exceed its workload requirements.',
    severity: 'high',
  },
  {
    itemType: 'rotated_token',
    title: 'Credential rotated but token still cached',
    description:
      'A rotated credential is still referenced by a cached configuration.',
    severity: 'low',
  },
  {
    itemType: 'weak_credentials',
    title: 'Password reused across %d services',
    description:
      'Shared credential material increases blast radius of a single leak.',
    severity: 'medium',
  },
  {
    itemType: 'sensitive_scope',
    title: 'App registration requests %s scopes',
    description:
      'The application identity requests more permissions than its integration uses.',
    severity: 'high',
  },
  {
    itemType: 'idle_cli_token',
    title: 'CLI token last used %d days ago',
    description:
      'A long-lived developer credential has been idle and should be revoked.',
    severity: 'low',
  },
  {
    itemType: 'public_repo_secret',
    title: 'Secret exposed in a public repository',
    description:
      'Credential material was detected in repository history; rotate immediately.',
    severity: 'critical',
  },
];

const SEED_ITEMS: NewItem[] = [
  {
    scanner: 'oasis-iam-scanner',
    itemType: 'service_identity_unused',
    title: 'Service identity not used in 90 days',
    description:
      'The service account svc-deploy has not authenticated since June.',
    severity: 'high',
    status: 'new',
    jiraKey: null,
    jiraUrl: null,
  },
  {
    scanner: 'oasis-secret-scanner',
    itemType: 'expired_credentials',
    title: 'Expired credentials on CI user',
    description: 'ci-build credentials exceeded the 90-day rotation policy.',
    severity: 'critical',
    status: 'new',
    jiraKey: null,
    jiraUrl: null,
  },
  {
    scanner: 'oasis-iam-scanner',
    itemType: 'overprivileged_api_key',
    title: 'Service account with admin scope',
    description:
      'svc-reports holds admin rights; least-privilege review recommended.',
    severity: 'high',
    status: 'new',
    jiraKey: null,
    jiraUrl: null,
  },
  {
    scanner: 'oasis-entra-scanner',
    itemType: 'rotated_token',
    title: 'Credential rotated but token still cached',
    description:
      'HSM keyset rekeyed; the old token is still cached by a cron job.',
    severity: 'low',
    status: 'closed',
    jiraKey: null,
    jiraUrl: null,
  },
  {
    scanner: 'oasis-iam-scanner',
    itemType: 'unattended_service_identity',
    title: 'Unused identity tracked in Jira',
    description:
      'Self-service identity flagged for removal is tracked as a ticket.',
    severity: 'medium',
    status: 'jira-ticket',
    jiraKey: 'OASIS-1',
    jiraUrl: 'https://demo.atlassian.net/browse/OASIS-1',
  },
];

function pick<T>(values: readonly T[]): T {
  return values[randomInt(values.length)];
}

function pickSeverity(): (typeof ITEM_SEVERITIES)[number] {
  const weighted: Array<(typeof ITEM_SEVERITIES)[number]> = [
    'low',
    'low',
    'medium',
    'medium',
    'medium',
    'high',
    'high',
    'critical',
  ];
  return pick(weighted);
}

function pickStatus(): ItemStatus {
  const roll = randomInt(10);
  if (roll < 6) {
    return 'new';
  }
  if (roll < 8) {
    return 'closed';
  }
  return 'jira-ticket';
}

function buildRandomItem(): NewItem {
  const template = pick(RANDOM_TEMPLATES);
  const filled = template.title
    .replace(/%d/g, () => String(pick([30, 60, 90, 120, 180, 365])))
    .replace(/%s/g, () =>
      pick(['svc-deploy', 'ci-build', 'reporting', 'cron']),
    );
  const status = pickStatus();
  const demoKey =
    status === 'jira-ticket' ? `OASIS-${randomInt(100, 9999)}` : null;
  return {
    scanner: pick(SCANNERS),
    itemType: template.itemType,
    title: filled,
    description: pick([
      template.description,
      'Generated by an Oasis scanner for triage.',
    ]),
    severity: pickSeverity(),
    status,
    jiraKey: demoKey,
    jiraUrl:
      demoKey === null ? null : `https://demo.atlassian.net/browse/${demoKey}`,
  };
}

@Injectable()
export class ItemService {
  constructor(
    private readonly repository: ItemRepository,
    private readonly jiraService: JiraService,
    private readonly audit: AuditService,
  ) {}

  async list(
    tenantId: string,
    query: ItemsQuery,
  ): Promise<{ items: OasisItem[]; total: number }> {
    await this.ensureSeed(tenantId);
    const rows = await this.repository.findMany(tenantId, {
      status: query.status,
      severity: query.severity,
      itemType: query.type,
      limit: query.limit ?? 10,
    });
    return { items: rows.map(toOasisItem), total: rows.length };
  }

  async summary(tenantId: string): Promise<ItemsSummary> {
    await this.ensureSeed(tenantId);
    const rows = await this.repository.countByStatus(tenantId);
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return {
      new: counts['new'] ?? 0,
      closed: counts['closed'] ?? 0,
      jiraTicket: counts['jira-ticket'] ?? 0,
      total: rows.reduce((sum, row) => sum + row.count, 0),
    };
  }

  async generateRandom(
    tenantId: string,
    ctx: ItemAuditContext,
  ): Promise<OasisItem> {
    const row = await this.repository.create(tenantId, buildRandomItem());
    await this.audit.write({
      tenantId,
      userId: ctx.userId,
      action: AuditAction.ITEM_GENERATE,
      target: row.id,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return toOasisItem(row);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: ItemStatus,
    ctx: ItemAuditContext,
  ): Promise<OasisItem> {
    const row = await this.repository.updateStatus(tenantId, id, status);
    if (row === null) {
      throw new NotFoundError('item');
    }
    await this.audit.write({
      tenantId,
      userId: ctx.userId,
      action: AuditAction.ITEM_STATUS_UPDATE,
      target: `${row.id}:${status}`,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    return toOasisItem(row);
  }

  async createTicket(
    tenantId: string,
    ctx: ItemAuditContext,
    id: string,
    projectKey: string,
  ): Promise<{ item: OasisItem; ticket: { key: string; url: string } }> {
    const item = await this.repository.findById(tenantId, id);
    if (item === null) {
      throw new NotFoundError('item');
    }
    const jiraCtx: JiraAuditContext = {
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    };
    const ticket = await this.jiraService.createTicket(
      tenantId,
      { type: 'user', id: ctx.userId, tenantId, email: '' },
      {
        projectKey,
        title: item.title,
        description: item.description ?? item.title,
      },
      jiraCtx,
    );
    const updated = await this.repository.linkTicket(tenantId, id, {
      jiraKey: ticket.key,
      jiraUrl: ticket.url,
    });
    await this.audit.write({
      tenantId,
      userId: ctx.userId,
      action: AuditAction.ITEM_TICKET_CREATE,
      target: `${item.id}::${ticket.key}`,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
    if (updated === null) {
      throw new NotFoundError('item');
    }
    return { item: toOasisItem(updated), ticket };
  }

  private async ensureSeed(tenantId: string): Promise<void> {
    const count = await this.repository.countByTenant(tenantId);
    if (count > 0) {
      return;
    }
    await this.repository.createMany(tenantId, SEED_ITEMS);
  }
}

function toOasisItem(row: ItemRecord): OasisItem {
  return {
    id: row.id,
    scanner: row.scanner,
    itemType: row.itemType,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    jiraKey: row.jiraKey,
    jiraUrl: row.jiraUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
