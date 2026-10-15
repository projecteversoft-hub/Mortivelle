import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '../../src/app.factory';
import { APP_CONFIG, loadConfig } from '../../src/config/config';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EMAIL_PROVIDER, type EmailProvider } from '../../src/auth/providers/email-provider';
import { FakePrisma } from './fake-prisma';

export const SYNTHETIC_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://synthetic:synthetic@localhost:5432/synthetic',
  WEB_ORIGINS: 'http://localhost:5173',
  AUTH_JWT_SECRET: 'test-only-synthetic-jwt-secret-not-a-real-secret-0000000000',
  // Generous so ordinary flow tests never hit the limiter; a dedicated rate-limit test
  // overrides this to a small value.
  AUTH_RATE_LIMIT_MAX: '1000',
  AUTH_RATE_LIMIT_TTL_SECONDS: '60',
  ARGON2_MEMORY_COST_KB: '8192', // Minimum viable cost so Argon2id hashing is fast in tests.
  ARGON2_TIME_COST: '1',
};

export class FakeEmailProvider implements EmailProvider {
  verificationTokensByEmail = new Map<string, string>();
  resetTokensByEmail = new Map<string, string>();

  sendVerificationEmail({
    toEmail,
    verificationToken,
  }: {
    toEmail: string;
    verificationToken: string;
  }): Promise<void> {
    this.verificationTokensByEmail.set(toEmail, verificationToken);
    return Promise.resolve();
  }

  sendPasswordResetEmail({
    toEmail,
    resetToken,
  }: {
    toEmail: string;
    resetToken: string;
  }): Promise<void> {
    this.resetTokensByEmail.set(toEmail, resetToken);
    return Promise.resolve();
  }
}

export interface TestApp {
  app: INestApplication;
  prisma: FakePrisma;
  emailProvider: FakeEmailProvider;
}

export async function buildTestApp(envOverrides: Record<string, string> = {}): Promise<TestApp> {
  const prisma = new FakePrisma();
  const emailProvider = new FakeEmailProvider();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(loadConfig({ ...SYNTHETIC_ENV, ...envOverrides }))
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(EMAIL_PROVIDER)
    .useValue(emailProvider)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, prisma, emailProvider };
}
