import { SetMetadata } from '@nestjs/common';
import type { Role } from '@tech-realty-rentals/shared';

export const ROLES_KEY = 'eversoft:roles';

/** Marks a handler as requiring one of the given roles within the resolved tenant context. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
