import { useCallback, useEffect, useState } from 'react';
import type { ReportsSummaryResponse, WidgetResponse } from '@tech-realty-rentals/shared';
import { getReportsSummary, listWidgets } from './api';

export interface WidgetsData {
  widgets: WidgetResponse[];
  summary: ReportsSummaryResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Loads (and reloads after any create/update) the caller's org widgets and aggregated
 * analytics together (docs/10 §2 "agent sees aggregated analytics scoped to their org"). */
export function useWidgets(organizationId: string): WidgetsData {
  const [widgets, setWidgets] = useState<WidgetResponse[]>([]);
  const [summary, setSummary] = useState<ReportsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([listWidgets(organizationId), getReportsSummary(organizationId)])
      .then(([widgetsResult, summaryResult]) => {
        if (cancelled) return;
        setWidgets(widgetsResult.items);
        setSummary(summaryResult);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load widgets.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, tick]);

  return { widgets, summary, loading, error, reload };
}
