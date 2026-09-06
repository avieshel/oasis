import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { loginSchema } from '../../app/validation';
import { getRateLimitConfig } from '../../config/rate-limits';
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from '../../config/session';
import { sessionCookieOptions, SessionUser } from '../../infra/session';
import { csrfCookieOptions, generateCsrfToken } from '../../infra/csrf';
import { AuthService, LoginContext } from './auth.service';
import { CurrentUser } from './auth.decorator';
import { SessionGuard } from './session.guard';
import { readCookie, RequestWithSession } from './request.types';

const LOGIN_RATE_LIMIT = getRateLimitConfig().login;

@Controller('app')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private secureCookies(): boolean {
    return this.config.get<boolean>('COOKIE_SECURE') === true;
  }

  @Get('csrf-token')
  @HttpCode(HttpStatus.OK)
  csrfToken(
    @Req() req: RequestWithSession,
    @Res({ passthrough: true }) res: Response,
  ) {
    const existing = readCookie(req, CSRF_COOKIE_NAME);
    const token =
      typeof existing === 'string' && existing.length > 0
        ? existing
        : generateCsrfToken();
    res.cookie(
      CSRF_COOKIE_NAME,
      token,
      csrfCookieOptions(token, this.secureCookies()),
    );
    return { token };
  }

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: LOGIN_RATE_LIMIT })
  async login(
    @Body() rawBody: unknown,
    @Req() req: RequestWithSession,
    @Res({ passthrough: true }) res: Response,
  ) {
    const body = loginSchema.parse(rawBody);
    const ctx: LoginContext = {
      currentToken: readCookie(req, SESSION_COOKIE_NAME) ?? null,
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };
    const result = await this.authService.login(body.email, body.password, ctx);
    res.cookie(
      SESSION_COOKIE_NAME,
      result.sessionToken,
      sessionCookieOptions(this.secureCookies()),
    );
    return { user: result.user };
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: RequestWithSession,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(readCookie(req, SESSION_COOKIE_NAME), {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    res.clearCookie(
      SESSION_COOKIE_NAME,
      sessionCookieOptions(this.secureCookies()),
    );
    return { status: 'logged_out' };
  }

  @Get('auth/me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: SessionUser) {
    return { user };
  }
}
