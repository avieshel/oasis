import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { UserService } from './user.service';
import { SignupDisabledError } from '../../app/errors';
import { signupSchema } from '../../app/validation';
import { getRateLimitConfig } from '../../config/rate-limits';

const SIGNUP_RATE_LIMIT = getRateLimitConfig().signup;

@Controller('app')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: SIGNUP_RATE_LIMIT })
  async signup(@Body() rawBody: unknown) {
    const body = signupSchema.parse(rawBody);

    const allowOpenSignup = this.config.get<boolean>('ALLOW_OPEN_SIGNUP');
    if (!allowOpenSignup) {
      throw new SignupDisabledError();
    }

    const { user, tenant } = await this.userService.signup(
      body.email,
      body.password,
    );
    return {
      user: { id: user.id, email: user.email, tenantId: tenant.id },
    };
  }
}
