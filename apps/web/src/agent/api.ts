import {
  apiErrorSchema,
  loginRequestSchema,
  logoutResponseSchema,
  myMembershipResponseSchema,
  reportsSummaryResponseSchema,
  sessionResponseSchema,
  widgetResponseSchema,
  type ApiError,
  type CreateWidgetRequest,
  type MyMembershipResponse,
  type PaginatedResult,
  type ReportsSummaryResponse,
  type UpdateWidgetRequest,
  type WidgetResponse,
} from '@tech-realty-rentals/shared';
import { z } from 'zod';

export class ApiRequestError extends Error {
  constructor(public readonly apiError: ApiError) {
    super(apiError.message);
  }
}

/** Reads one cookie's raw value by name (used only for the non-HttpOnly CSRF cookie, which
 * the web app must be able to read and echo back as a header -- same contract as
 * apps/api/src/auth/token.service.ts's `setCsrfCookie`). */
function readCookie(name: string): string | undefined {
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match?.slice(name.length + 1);
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit & { organizationId?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (init.organizationId) headers.set('x-organization-id', init.organizationId);
  if (init.method && init.method !== 'GET') {
    const csrf = readCookie('eversoft_csrf');
    if (csrf) headers.set('x-csrf-token', csrf);
  }

  const res = await fetch(path, { ...init, headers, credentials: 'include' });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const parsedError = apiErrorSchema.safeParse(body);
    throw new ApiRequestError(
      parsedError.success
        ? parsedError.data
        : { code: 'UNKNOWN', message: 'Something went wrong.', requestId: 'unknown' },
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error('Unexpected response shape from the API.');
  }
  return parsed.data;
}

export function login(email: string, password: string): Promise<void> {
  loginRequestSchema.parse({ email, password });
  return request('/api/v1/auth/login', sessionResponseSchema, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }).then(() => undefined);
}

export function logout(): Promise<void> {
  return request('/api/v1/auth/logout', logoutResponseSchema, { method: 'POST' }).then(
    () => undefined,
  );
}

export function getMyMemberships(): Promise<MyMembershipResponse[]> {
  return request('/api/v1/memberships/me', z.array(myMembershipResponseSchema));
}

const paginatedWidgetsSchema = z.object({
  items: z.array(widgetResponseSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export function listWidgets(organizationId: string): Promise<PaginatedResult<WidgetResponse>> {
  return request('/api/v1/agent/widgets?limit=50', paginatedWidgetsSchema, { organizationId });
}

export function createWidget(
  organizationId: string,
  body: CreateWidgetRequest,
): Promise<WidgetResponse> {
  return request('/api/v1/agent/widgets', widgetResponseSchema, {
    method: 'POST',
    organizationId,
    body: JSON.stringify(body),
  });
}

export function updateWidget(
  organizationId: string,
  id: string,
  body: UpdateWidgetRequest,
): Promise<WidgetResponse> {
  return request(`/api/v1/agent/widgets/${id}`, widgetResponseSchema, {
    method: 'PATCH',
    organizationId,
    body: JSON.stringify(body),
  });
}

export function getReportsSummary(organizationId: string): Promise<ReportsSummaryResponse> {
  return request('/api/v1/agent/reports/summary', reportsSummaryResponseSchema, { organizationId });
}
