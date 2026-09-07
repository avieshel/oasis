import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  itemParamSchema,
  itemTicketCreateSchema,
  itemsQuerySchema,
  itemUpdateSchema,
} from '../../app/validation';
import { getRateLimitConfig } from '../../config/rate-limits';
import { SessionUser } from '../../infra/session';
import { CurrentTenantId, CurrentUser } from '../auth/auth.decorator';
import { RequestWithSession } from '../auth/request.types';
import { SessionGuard } from '../auth/session.guard';
import { ItemService, type ItemAuditContext } from './item.service';

const ITEM_CREATE_RATE_LIMIT = getRateLimitConfig().itemCreate;
const TICKET_CREATE_RATE_LIMIT = getRateLimitConfig().ticketCreateUi;

function auditContext(
  user: SessionUser,
  req: RequestWithSession,
): ItemAuditContext {
  return {
    userId: user.id,
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

@Controller('app/items')
@UseGuards(SessionGuard)
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @Get()
  async list(
    @CurrentTenantId() tenantId: string,
    @Req() req: RequestWithSession,
  ) {
    const query = itemsQuerySchema.parse(req.query);
    return this.itemService.list(tenantId, query);
  }

  @Get('summary')
  async summary(@CurrentTenantId() tenantId: string) {
    return this.itemService.summary(tenantId);
  }

  @Post('random')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: ITEM_CREATE_RATE_LIMIT })
  async generate(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: SessionUser,
    @Req() req: RequestWithSession,
  ) {
    return this.itemService.generateRandom(tenantId, auditContext(user, req));
  }

  @Patch(':id')
  async update(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @Req() req: RequestWithSession,
  ) {
    const params = itemParamSchema.parse({ id });
    const body = itemUpdateSchema.parse(rawBody);
    return this.itemService.updateStatus(
      tenantId,
      params.id,
      body.status,
      auditContext(user, req),
    );
  }

  @Post(':id/ticket')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: TICKET_CREATE_RATE_LIMIT })
  async createTicket(
    @CurrentTenantId() tenantId: string,
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @Req() req: RequestWithSession,
  ) {
    const params = itemParamSchema.parse({ id });
    const body = itemTicketCreateSchema.parse(rawBody);
    return this.itemService.createTicket(
      tenantId,
      auditContext(user, req),
      params.id,
      body.project_key,
    );
  }
}
