import type { Role } from '@tech-realty-rentals/shared';

export interface AuthenticatedUser {
  id: string;
}

/**
 * Resolved server-side from an existing ACTIVE Membership row — never trusted from client
 * input directly (docs/02 §3: "No public endpoint accepts an organization ID as sufficient
 * proof of authorization").
 */
export interface TenantContext {
  organizationId: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
    tenant?: TenantContext;
  }
}
