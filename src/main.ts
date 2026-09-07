import 'reflect-metadata';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger';
import { loadConfig } from './config';
import { PrismaService } from './infra/db';

const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
const CLIENT_INDEX = path.join(CLIENT_DIST, 'index.html');

// Routes handled by the backend; everything else that isn't a static file
// falls through to the SPA index so deep links (/login, /settings) work.
const RESERVED_PREFIXES = [
  '/api',
  '/swagger',
  '/swagger-json',
  '/healthz',
  '/readyz',
];

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
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
          // React/Vite inject inline scripts and styles in dev mode via its
          // HMR client; in prod the built bundle still emits some inline
          // style tags. 'unsafe-inline' keeps both modes working without a
          // per-build nonce.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz'] });
  setupSwagger(app);

  const serveClient = existsSync(CLIENT_INDEX);
  if (serveClient) {
    app.useStaticAssets(CLIENT_DIST);
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const url = req.path;
      if (
        RESERVED_PREFIXES.some(
          (prefix) => url === prefix || url.startsWith(`${prefix}/`),
        )
      ) {
        return next();
      }
      if (path.extname(url) !== '') return next();
      res.sendFile(CLIENT_INDEX);
    });
  }

  await app.init();

  if (config.PURGE_SESSIONS_ON_STARTUP) {
    const prisma: PrismaService = app.get(PrismaService);
    const { count } = await prisma.sessions.deleteMany({});
    const logger = app.get<Logger>(Logger);
    logger.log({ purged: count }, 'invalidated sessions on startup');
  }

  await app.listen(config.PORT);
}

void bootstrap();
