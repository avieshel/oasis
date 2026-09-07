import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    // WAL lets external tools (e.g. DataGrip) read the SQLite file while the
    // app is writing, instead of blocking on the writer's lock. PRAGMA
    // journal_mode returns a row (the new mode), so use $queryRawUnsafe.
    await this.$queryRawUnsafe('PRAGMA journal_mode=WAL');
    await this.$queryRawUnsafe('PRAGMA synchronous=NORMAL');
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
