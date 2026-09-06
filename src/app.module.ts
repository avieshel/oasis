import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { appConfigSchema, validateConfig } from './config';
import { getRateLimitConfig } from './config/rate-limits';
import { PrismaService } from './infra/db';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AppExceptionFilter } from './app/errors';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
          options: { singleLine: true },
        },
      },
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const rateLimits = getRateLimitConfig();
        return [
          {
            ttl: rateLimits.global.ttlMs,
            limit: rateLimits.global.limit,
          },
        ];
      },
    }),
    HealthModule,
    UsersModule,
  ],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AppExceptionFilter,
    },
  ],
})
export class AppModule {}

export type AppConfig = typeof appConfigSchema;
