import 'reflect-metadata';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadConfig } from './config';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const corsOrigin =
    config.NODE_ENV === 'production'
      ? config.CORS_ORIGIN
      : 'http://localhost:5173';
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin,
    credentials: true,
  });

  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz'] });

  await app.listen(config.PORT);
}

void bootstrap();
