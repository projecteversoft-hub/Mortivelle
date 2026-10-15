import type { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { APP_CONFIG, type AppConfig } from './config/config';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { requestIdMiddleware } from './common/request-context';
import { requestLoggerMiddleware } from './common/request-logger';
import { PrismaService } from './prisma/prisma.service';
import { buildCorsOptionsDelegate } from './widgets/public-widget-cors';

export const API_PREFIX = 'api/v1';
const BODY_LIMIT = '100kb';

/** Shared by main.ts and tests so e2e tests exercise the real HTTP pipeline. */
export function configureApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  const prisma = app.get(PrismaService);
  app.setGlobalPrefix(API_PREFIX);
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: false, limit: BODY_LIMIT }));
  // Phase 4 (docs/06 §3-4): the two public widget endpoints need per-widget dynamic CORS,
  // not the app's static WEB_ORIGINS allowlist below -- see widgets/public-widget-cors.ts
  // for the full design rationale. Every other route's behavior is unchanged.
  app.enableCors(buildCorsOptionsDelegate(config, prisma));
  app.useGlobalFilters(new ApiExceptionFilter());
}
