import { describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { requestLoggerMiddleware } from './request-logger';

describe('requestLoggerMiddleware', () => {
  it('logs the path without query string, headers, or body', () => {
    const spy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const res = Object.assign(new EventEmitter(), { statusCode: 200 });
    const req = {
      method: 'POST',
      originalUrl: '/api/v1/public/leads?email=jane@example.com&income=90000',
      requestId: 'req-12345678',
      headers: { authorization: 'Bearer secret' },
      body: { email: 'jane@example.com' },
    };
    requestLoggerMiddleware(req as never, res as never, () => undefined);
    res.emit('finish');
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).toContain('/api/v1/public/leads');
    expect(line).not.toMatch(/jane|income|secret|authorization/);
    spy.mockRestore();
  });
});
