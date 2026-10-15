import { useCallback, useEffect, useState } from 'react';
import { readinessResponseSchema } from '@tech-realty-rentals/shared';

export type HealthState = 'checking' | 'ready' | 'unavailable';

/** Polls the API readiness probe once on mount and on demand. */
export function useApiHealth(): { state: HealthState; recheck: () => void } {
  const [state, setState] = useState<HealthState>('checking');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState('checking');
    fetch('/api/v1/health/ready', { signal: controller.signal })
      .then(async (res) => {
        const parsed = readinessResponseSchema.safeParse(await res.json());
        setState(res.ok && parsed.success && parsed.data.status === 'ok' ? 'ready' : 'unavailable');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState('unavailable');
      });
    return () => controller.abort();
  }, [tick]);

  const recheck = useCallback(() => setTick((value) => value + 1), []);
  return { state, recheck };
}
