import { useState } from 'react';
import type { WidgetResponse, Role } from '@tech-realty-rentals/shared';
import { Role as RoleValues } from '@tech-realty-rentals/shared';
import { ApiRequestError, updateWidget } from './api';
import { EmbedSnippet } from './EmbedSnippet';

export function WidgetEditor({
  organizationId,
  role,
  widget,
  onChanged,
}: {
  organizationId: string;
  role: Role;
  widget: WidgetResponse;
  onChanged: () => void;
}) {
  const canManage = role === RoleValues.AgentAdmin;
  const [originsText, setOriginsText] = useState(widget.allowedOrigins.join('\n'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function togglePause(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await updateWidget(organizationId, widget.id, {
        status: widget.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : 'Failed to update widget.');
    } finally {
      setBusy(false);
    }
  }

  async function saveOrigins(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await updateWidget(organizationId, widget.id, {
        allowedOrigins: originsText
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.apiError.message : 'Failed to update origins.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-paper-line bg-paper-raised p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className="h-6 w-6 rounded-full border border-paper-line"
          style={{ backgroundColor: widget.theme.primaryColor }}
        />
        <h3 className="text-base font-semibold text-ink">{widget.name}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            widget.status === 'ACTIVE' ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'
          }`}
        >
          {widget.status}
        </span>
        <span className="text-xs text-ink-faint">config v{widget.configVersion}</span>
      </div>

      <p className="mt-2 text-sm text-ink-soft">
        Calculators: {widget.enabledCalculators.join(', ')}
      </p>

      {canManage ? (
        <button
          type="button"
          onClick={togglePause}
          disabled={busy}
          className="mt-3 rounded-md border border-paper-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper-line disabled:opacity-60"
        >
          {widget.status === 'ACTIVE' ? 'Pause widget' : 'Resume widget'}
        </button>
      ) : null}

      <div className="mt-4">
        <h4 className="text-sm font-medium text-ink">Allowed origins</h4>
        {canManage ? (
          <>
            <textarea
              value={originsText}
              onChange={(e) => setOriginsText(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-paper-line bg-paper px-3 py-2 font-mono text-sm"
              aria-label={`Allowed origins for ${widget.name}`}
            />
            <button
              type="button"
              onClick={saveOrigins}
              disabled={busy}
              className="mt-2 rounded-md border border-paper-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper-line disabled:opacity-60"
            >
              Save origins
            </button>
          </>
        ) : (
          <ul className="mt-1 list-inside list-disc text-sm text-ink-soft">
            {widget.allowedOrigins.map((origin) => (
              <li key={origin}>{origin}</li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-bad">
          {error}
        </p>
      ) : null}

      <EmbedSnippet widget={widget} />
    </li>
  );
}
