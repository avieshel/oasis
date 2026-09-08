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
import { AuthModule } from './modules/auth/auth.module';
import { CsrfGuard } from './modules/auth/csrf.guard';
import { JiraModule } from './modules/jira/jira.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AdminExtModule } from './modules/admin-ext/admin-ext.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { ItemsModule } from './modules/items/item.module';
import { AppExceptionFilter } from './app/errors';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
    }),
    LoggerModule.forRoot({
      pinoHttp:
        process.env.NODE_ENV === 'production'
          ? {}
          : {
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
    AuthModule,
    JiraModule,
    ApiKeysModule,
    AdminExtModule,
    AuthorizationModule,
    ItemsModule,
  ],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AppExceptionFilter,
    },
  ],
})
export class AppModule {}

export type AppConfig = typeof appConfigSchema;
