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
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { CurrentPrincipal } from '../authorization/authorization.decorator';
import { Principal } from '../authorization/models';
import { RequestWithSession } from '../auth/request.types';
import { ItemService, type ItemAuditContext } from './item.service';

const ITEM_CREATE_RATE_LIMIT = getRateLimitConfig().itemCreate;
const TICKET_CREATE_RATE_LIMIT = getRateLimitConfig().ticketCreateUi;

function auditContext(
  principal: Principal,
  req: RequestWithSession,
): ItemAuditContext {
  return {
    userId: principal.id,
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

@Controller('app/items')
@UseGuards(AuthorizationGuard)
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @Get()
  async list(
    @CurrentPrincipal() principal: Principal,
    @Req() req: RequestWithSession,
  ) {
    const query = itemsQuerySchema.parse(req.query);
    return this.itemService.list(principal.tenantId, query);
  }

  @Get('summary')
  async summary(@CurrentPrincipal() principal: Principal) {
    return this.itemService.summary(principal.tenantId);
  }

  @Post('random')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: ITEM_CREATE_RATE_LIMIT })
  async generate(
    @CurrentPrincipal() principal: Principal,
    @Req() req: RequestWithSession,
  ) {
    return this.itemService.generateRandom(
      principal.tenantId,
      auditContext(principal, req),
    );
  }

  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @Req() req: RequestWithSession,
  ) {
    const params = itemParamSchema.parse({ id });
    const body = itemUpdateSchema.parse(rawBody);
    return this.itemService.updateStatus(
      principal.tenantId,
      params.id,
      body.status,
      auditContext(principal, req),
    );
  }

  @Post(':id/ticket')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: TICKET_CREATE_RATE_LIMIT })
  async createTicket(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @Req() req: RequestWithSession,
  ) {
    const params = itemParamSchema.parse({ id });
    const body = itemTicketCreateSchema.parse(rawBody);
    return this.itemService.createTicket(
      principal.tenantId,
      auditContext(principal, req),
      params.id,
      body.project_key,
    );
  }
}
