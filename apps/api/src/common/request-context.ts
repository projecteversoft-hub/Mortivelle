import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

/** Assigns a correlation ID (accepting a well-formed inbound one) and echoes it back. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header(REQUEST_ID_HEADER);
  const requestId = inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
