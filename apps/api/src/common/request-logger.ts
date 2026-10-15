import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('http');

/**
 * Structured access log. Deliberately logs the route path only: no query string, headers,
 * cookies, or bodies, so contact details and financial inputs can never reach logs.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const path = req.originalUrl.split('?')[0];
    logger.log(
      JSON.stringify({
        requestId: req.requestId,
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Math.round(durationMs),
      }),
    );
  });
  next();
}
