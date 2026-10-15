import 'reflect-metadata';
import {
  Controller,
  Get,
  type INestApplication,
  Module,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApp } from '../src/app.factory';
import { APP_CONFIG, loadConfig } from '../src/config/config';
import { ConfigModule } from '../src/config/config.module';
import { HealthModule } from '../src/health/health.module';
import { PrismaService } from '../src/prisma/prisma.service';

const SYNTHETIC_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://synthetic:synthetic@localhost:5432/synthetic',
  WEB_ORIGINS: 'http://localhost:5173',
};

// Test-only controller to exercise the error pipeline without touching production routes.
@Controller('__test')
class ErrorProbeController {
  @Get('boom')
  boom(): never {
    throw new Error('internal detail: password=hunter2 host=db.internal');
  }
  @Get('bad')
  bad(): never {
    throw new BadRequestException('raw message that should not be echoed');
  }
  @Post('echo')
  echo(@Body() body: unknown): unknown {
    return body;
  }
}

@Module({ controllers: [ErrorProbeController] })
class ErrorProbeModule {}

async function createApp(queryRaw: () => Promise<unknown>): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, HealthModule, ErrorProbeModule],
  })
    .overrideProvider(APP_CONFIG)
    .useValue(loadConfig(SYNTHETIC_ENV))
    .useMocker((token) => (token === PrismaService ? { $queryRaw: queryRaw } : undefined))
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('health endpoints', () => {
  let app: INestApplication;
  afterEach(async () => {
    await app?.close();
    vi.restoreAllMocks();
  });

  it('GET /api/v1/health/live returns ok without touching the database', async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error('db down'));
    app = await createApp(queryRaw);
    const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('GET /api/v1/health/ready returns 200 when the database responds', async () => {
    app = await createApp(vi.fn().mockResolvedValue([{ '?column?': 1 }]));
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health/ready returns 503 with no infrastructure detail when the database fails', async () => {
    app = await createApp(
      vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432')),
    );
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(res.body).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
  });

  it('returns 503 when the database check hangs past the timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    app = await createApp(() => new Promise(() => undefined));
    const pending = request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .then((r) => r);
    await vi.advanceTimersByTimeAsync(2500);
    vi.useRealTimers();
    const res = await pending;
    expect(res.status).toBe(503);
  });
});

describe('request pipeline', () => {
  let app: INestApplication;
  beforeEach(async () => {
    app = await createApp(vi.fn().mockResolvedValue([]));
  });
  afterEach(async () => {
    await app.close();
  });

  it('generates a request ID and echoes it on the response', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('accepts a well-formed inbound request ID and rejects a malformed one', async () => {
    const ok = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('x-request-id', 'client-req-12345');
    expect(ok.headers['x-request-id']).toBe('client-req-12345');
    const bad = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('x-request-id', 'bad id with spaces <script>');
    expect(bad.headers['x-request-id']).not.toContain('<script>');
  });

  it('returns the consistent error shape for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(res.body).toMatchObject({
      code: 'NOT_FOUND',
      message: expect.any(String),
      requestId: expect.any(String),
    });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('does not leak internal error details on unhandled exceptions', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/__test/boom').expect(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|db\.internal|stack/i);
  });

  it('does not echo raw exception messages for HTTP exceptions', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/__test/bad').expect(400);
    expect(res.body.message).toBe('The request is invalid.');
  });

  it('rejects oversized request bodies with a safe 413', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/__test/echo')
      .send({ blob: 'x'.repeat(200_000) })
      .expect(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and restricts CORS to configured origins', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    const denied = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
