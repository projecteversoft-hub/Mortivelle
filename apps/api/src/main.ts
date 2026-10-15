import 'reflect-metadata';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
// Root-level .env (synthetic local values); real environments inject variables directly.
loadDotenv({ path: resolve(__dirname, '../../../.env') });

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './app.factory';
import { APP_CONFIG, type AppConfig } from './config/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  configureApp(app);
  app.enableShutdownHooks();
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.API_PORT);
  new Logger('bootstrap').log(`API listening on port ${config.API_PORT}`);
}

bootstrap().catch((error: unknown) => {
  // Config errors list variable names only; never print values.
  console.error(error instanceof Error ? error.message : 'Failed to start API');
  process.exit(1);
});
