import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@tech-realty-rentals/shared';
import { ROLES_KEY } from './roles.decorator';

/**
 * Role check only — resource scope is enforced separately by TenantGuard/service-layer
 * queries (docs/02 §2: "Roles are not substitutes for resource-level authorization"). Must
 * run after TenantGuard (needs `req.tenant`).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const role = req.tenant?.role;
    if (!role || !required.includes(role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
