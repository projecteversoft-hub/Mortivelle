import { useEffect, useState } from 'react';
import {
  publicWidgetConfigResponseSchema,
  type PublicWidgetConfigResponse,
} from '@tech-realty-rentals/shared';

export type WidgetConfigState =
  | { status: 'loading' }
  | { status: 'invalid-key' }
  | { status: 'not-found' }
  | { status: 'error' }
  | { status: 'loaded'; config: PublicWidgetConfigResponse };

/** Fetches `GET /api/v1/public/widgets/:publicKey/config` (docs/06 §3-4). No credentials:
 * this is the anonymous, public endpoint -- the embed page never sends cookies. */
export function useWidgetConfig(publicKey: string | null): WidgetConfigState {
  const [state, setState] = useState<WidgetConfigState>({ status: 'loading' });

  useEffect(() => {
    if (!publicKey) {
      setState({ status: 'invalid-key' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetch(`/api/v1/public/widgets/${encodeURIComponent(publicKey)}/config`, {
      signal: controller.signal,
      credentials: 'omit',
    })
      .then(async (res) => {
        if (res.status === 404) {
          setState({ status: 'not-found' });
          return;
        }
        if (!res.ok) {
          setState({ status: 'error' });
          return;
        }
        const parsed = publicWidgetConfigResponseSchema.safeParse(await res.json());
        setState(parsed.success ? { status: 'loaded', config: parsed.data } : { status: 'error' });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [publicKey]);

  return state;
}
