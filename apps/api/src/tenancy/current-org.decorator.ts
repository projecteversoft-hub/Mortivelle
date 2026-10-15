import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { TenantContext } from './types';

/** Requires TenantGuard to have run first. */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.tenant) {
      throw new Error('CurrentOrg decorator used without TenantGuard');
    }
    return req.tenant;
  },
);
