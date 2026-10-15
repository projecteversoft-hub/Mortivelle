import { useCallback, useEffect, useState } from 'react';
import type { MyMembershipResponse } from '@tech-realty-rentals/shared';
import { LoginForm } from './LoginForm';
import { WidgetDashboard } from './WidgetDashboard';
import { getMyMemberships, logout, ApiRequestError } from './api';

type SessionState =
  | { status: 'checking' }
  | { status: 'anonymous' }
  | { status: 'no-memberships' }
  | { status: 'ready'; memberships: MyMembershipResponse[] };

/**
 * Top-level agent dashboard controller (docs/06 §6, docs/10 §2). There is no router in this
 * app (Phase 3's own note); this is a small state machine over one page instead:
 * checking session -> (login form) -> resolve organization(s) -> dashboard.
 *
 * Known limitation (documented per the Phase 4 brief): there is no org-switcher. If the
 * signed-in user has more than one ACTIVE membership, this picks the first (by creation
 * order) and shows a note naming the others; building a full switcher is out of scope for
 * this phase. The overwhelmingly common case -- one agent user, one agent organization --
 * works without any extra step.
 */
export function AgentApp() {
  const [session, setSession] = useState<SessionState>({ status: 'checking' });

  const checkSession = useCallback(() => {
    setSession({ status: 'checking' });
    getMyMemberships()
      .then((memberships) => {
        setSession(
          memberships.length === 0
            ? { status: 'no-memberships' }
            : { status: 'ready', memberships },
        );
      })
      .catch((err: unknown) => {
        if (err instanceof ApiRequestError && err.apiError.code === 'UNAUTHORIZED') {
          setSession({ status: 'anonymous' });
          return;
        }
        setSession({ status: 'anonymous' });
      });
  }, []);

  useEffect(checkSession, [checkSession]);

  async function handleLogout(): Promise<void> {
    await logout().catch(() => undefined);
    checkSession();
  }

  if (session.status === 'checking') {
    return (
      <main className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6">
        <p className="text-sm text-ink-soft">Loading…</p>
      </main>
    );
  }

  if (session.status === 'anonymous') {
    return <LoginForm onLoggedIn={checkSession} />;
  }

  if (session.status === 'no-memberships') {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">No organizations yet</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your account is not yet a member of any agent organization. Ask a platform administrator
          to add you.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 self-start rounded-md border border-paper-line px-4 py-2 text-sm font-medium text-ink hover:bg-paper-line"
        >
          Sign out
        </button>
      </main>
    );
  }

  const primary = session.memberships[0];
  if (!primary) {
    // Unreachable (status 'ready' implies a non-empty array), but keeps TypeScript happy
    // without a non-null assertion.
    return null;
  }
  const extraCount = session.memberships.length - 1;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-16">
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Tech Realty Rentals agent dashboard
        </h1>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-md border border-paper-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper-line"
        >
          Sign out
        </button>
      </div>

      {extraCount > 0 ? (
        <p className="mt-2 text-xs text-ink-faint">
          You belong to {extraCount + 1} organizations. Showing {primary.organizationName} only --
          switching organizations is not yet supported in this dashboard.
        </p>
      ) : null}

      <div className="mt-6">
        <WidgetDashboard membership={primary} />
      </div>
    </main>
  );
}
