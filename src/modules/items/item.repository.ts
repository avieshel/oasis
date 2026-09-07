import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/db';
import type { ITEM_STATUSES, ITEM_SEVERITIES } from '../../app/validation';

export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type ItemSeverity = (typeof ITEM_SEVERITIES)[number];

export interface ItemFilters {
  status?: ItemStatus;
  severity?: ItemSeverity;
  itemType?: string;
  limit?: number;
}

export interface NewItem {
  scanner: string;
  itemType: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  jiraKey: string | null;
  jiraUrl: string | null;
}

export interface ItemRecord extends NewItem {
  id: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    tenantId: string,
    filters: ItemFilters,
  ): Promise<ItemRecord[]> {
    const rows = await this.prisma.oasis_items.findMany({
      where: {
        tenant_id: tenantId,
        ...(filters.status !== undefined ? { status: filters.status } : {}),
        ...(filters.severity !== undefined
          ? { severity: filters.severity }
          : {}),
        ...(filters.itemType !== undefined
          ? { item_type: filters.itemType }
          : {}),
      },
      orderBy: { created_at: 'desc' },
      take: filters.limit,
    });
    return rows.map(toRecord);
  }

  async countByTenant(tenantId: string): Promise<number> {
    return this.prisma.oasis_items.count({
      where: { tenant_id: tenantId },
    });
  }

  async countByStatus(
    tenantId: string,
  ): Promise<Array<{ status: string; count: number }>> {
    const rows = await this.prisma.oasis_items.groupBy({
      by: ['status'],
      where: { tenant_id: tenantId },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      status: row.status,
      count: row._count._all,
    }));
  }

  async create(tenantId: string, item: NewItem): Promise<ItemRecord> {
    const row = await this.prisma.oasis_items.create({
      data: {
        tenant_id: tenantId,
        scanner: item.scanner,
        item_type: item.itemType,
        title: item.title,
        description: item.description,
        severity: item.severity,
        status: item.status,
        jira_key: item.jiraKey,
        jira_url: item.jiraUrl,
      },
    });
    return toRecord(row);
  }

  async createMany(tenantId: string, items: NewItem[]): Promise<void> {
    await this.prisma.oasis_items.createMany({
      data: items.map((item) => ({
        tenant_id: tenantId,
        scanner: item.scanner,
        item_type: item.itemType,
        title: item.title,
        description: item.description,
        severity: item.severity,
        status: item.status,
        jira_key: item.jiraKey,
        jira_url: item.jiraUrl,
      })),
    });
  }

  async findById(tenantId: string, id: string): Promise<ItemRecord | null> {
    const row = await this.prisma.oasis_items.findFirst({
      where: { tenant_id: tenantId, id },
    });
    return row === null ? null : toRecord(row);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: ItemStatus,
  ): Promise<ItemRecord | null> {
    const row = await this.prisma.oasis_items.updateMany({
      where: { tenant_id: tenantId, id },
      data: { status },
    });
    if (row.count === 0) {
      return null;
    }
    return this.findById(tenantId, id);
  }

  async linkTicket(
    tenantId: string,
    id: string,
    ticket: { jiraKey: string; jiraUrl: string },
  ): Promise<ItemRecord | null> {
    const row = await this.prisma.oasis_items.updateMany({
      where: { tenant_id: tenantId, id },
      data: {
        status: 'jira-ticket',
        jira_key: ticket.jiraKey,
        jira_url: ticket.jiraUrl,
      },
    });
    if (row.count === 0) {
      return null;
    }
    return this.findById(tenantId, id);
  }
}

function toRecord(row: {
  id: string;
  tenant_id: string;
  scanner: string;
  item_type: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  jira_key: string | null;
  jira_url: string | null;
  created_at: Date;
  updated_at: Date;
}): ItemRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    scanner: row.scanner,
    itemType: row.item_type,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    jiraKey: row.jira_key,
    jiraUrl: row.jira_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
