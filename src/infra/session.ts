import { Injectable } from '@nestjs/common';
import type { CookieOptions } from 'express';
import { PrismaService } from './db';
import { randomBytes, sha256Hex } from './crypto';
import { getSessionConfig, SESSION_TOKEN_BYTES } from '../config/session';

export interface SessionUser {
  id: string;
  email: string;
  tenantId: string;
  tenantName: string;
}

export function toSessionUser(
  user: { id: string; email: string; tenant_id: string },
  tenantName?: string,
): SessionUser {
  return {
    id: user.id,
    email: user.email,
    tenantId: user.tenant_id,
    tenantName: tenantName ?? '',
  };
}

export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  };
}

export interface ResolvedSession {
  id: string;
  user: SessionUser;
}

@Injectable()
export class SessionManager {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    userId: string;
    currentToken?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<string> {
    const { userId, currentToken, ip, userAgent } = params;
    const { idleTtlMs, absoluteTtlMs } = getSessionConfig();
    const now = new Date();

    let rotatedFromId: string | null = null;
    if (currentToken) {
      const existing = await this.prisma.sessions.findUnique({
        where: { token_hash: sha256Hex(currentToken) },
      });
      if (existing && existing.user_id === userId) {
        rotatedFromId = existing.id;
      }
    }

    await this.prisma.sessions.deleteMany({ where: { user_id: userId } });

    const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
    await this.prisma.sessions.create({
      data: {
        user_id: userId,
        token_hash: sha256Hex(token),
        ip: ip ?? null,
        user_agent: userAgent ?? null,
        last_seen_at: now,
        expires_idle_at: new Date(now.getTime() + idleTtlMs),
        expires_absolute_at: new Date(now.getTime() + absoluteTtlMs),
        rotated_from_id: rotatedFromId,
      },
    });

    return token;
  }

  async resolve(token: string): Promise<ResolvedSession | null> {
    const { idleTtlMs } = getSessionConfig();
    const session = await this.prisma.sessions.findUnique({
      where: { token_hash: sha256Hex(token) },
    });

    if (!session) {
      return null;
    }

    const now = new Date();
    if (now >= session.expires_absolute_at || now >= session.expires_idle_at) {
      await this.prisma.sessions.delete({ where: { id: session.id } });
      return null;
    }

    const user = await this.prisma.users.findUnique({
      where: { id: session.user_id },
    });
    if (!user) {
      await this.prisma.sessions.delete({ where: { id: session.id } });
      return null;
    }

    const tenant = await this.prisma.tenants.findUnique({
      where: { id: user.tenant_id },
    });

    await this.prisma.sessions.update({
      where: { id: session.id },
      data: {
        last_seen_at: now,
        expires_idle_at: new Date(now.getTime() + idleTtlMs),
      },
    });

    return { id: session.id, user: toSessionUser(user, tenant?.name) };
  }

  async peek(
    token: string,
  ): Promise<{ sessionId: string; userId: string } | null> {
    const session = await this.prisma.sessions.findUnique({
      where: { token_hash: sha256Hex(token) },
    });
    if (!session) {
      return null;
    }
    return { sessionId: session.id, userId: session.user_id };
  }

  async destroy(token: string): Promise<void> {
    await this.prisma.sessions.deleteMany({
      where: { token_hash: sha256Hex(token) },
    });
  }
}
