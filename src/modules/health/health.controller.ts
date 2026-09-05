import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../infra/db';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('healthz')
  healthz(): { status: string } {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readyz(): Promise<{ status: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
