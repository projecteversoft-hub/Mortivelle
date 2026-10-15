import type { MyMembershipResponse } from '@tech-realty-rentals/shared';
import { Role } from '@tech-realty-rentals/shared';
import { useWidgets } from './useWidgets';
import { CreateWidgetForm } from './CreateWidgetForm';
import { WidgetEditor } from './WidgetEditor';

/**
 * The agent widget-management dashboard (docs/06 §6, docs/10 §2, docs/11 §5). Scoped to a
 * single organization context, passed in by `AgentApp` once it has resolved the caller's
 * memberships -- see that file for the documented single-membership-only limitation.
 */
export function WidgetDashboard({ membership }: { membership: MyMembershipResponse }) {
  const { widgets, summary, loading, error, reload } = useWidgets(membership.organizationId);
  const canManage = membership.role === Role.AgentAdmin;

  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-ink">Widgets</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {membership.organizationName} &middot; signed in as {membership.role}
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-bad">
          {error}
        </p>
      ) : null}

      {summary ? (
        <div className="mt-4 rounded-lg border border-paper-line bg-paper-raised p-4">
          <h3 className="text-sm font-semibold text-ink">
            Activity &middot; last {summary.windowDays} days
          </h3>
          {summary.rows.length === 0 ? (
            <p className="mt-1 text-sm text-ink-soft">No attribution events recorded yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-soft">
              {summary.rows.map((row) => (
                <li key={`${row.widgetId}-${row.eventType}`}>
                  {row.widgetName} &mdash; {row.eventType}: {row.count}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {canManage ? (
        <CreateWidgetForm organizationId={membership.organizationId} onCreated={reload} />
      ) : null}

      <ul className="mt-6 flex flex-col gap-4">
        {loading ? <p className="text-sm text-ink-soft">Loading widgets…</p> : null}
        {!loading && widgets.length === 0 ? (
          <p className="text-sm text-ink-soft">No widgets yet.</p>
        ) : null}
        {widgets.map((widget) => (
          <WidgetEditor
            key={widget.id}
            organizationId={membership.organizationId}
            role={membership.role}
            widget={widget}
            onChanged={reload}
          />
        ))}
      </ul>
    </section>
  );
}
