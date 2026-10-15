import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { AttributionEventType } from '@tech-realty-rentals/shared';
import { CalculatorsSection } from '../calculators/CalculatorsSection';
import { brandCssVariables } from '../theme-color';
import { readEmbedParams } from './embed-params';
import { useWidgetConfig } from './useWidgetConfig';
import { useReportSizeToParent } from './useReportSizeToParent';
import { recordAttributionEvent } from './attribution';

/**
 * The embeddable widget page (docs/06 §3, docs/10 §2, docs/11 §5). Meant to be loaded inside
 * a third-party agent site's `<iframe>`. Renders only the enabled calculators, reusing
 * Phase 3's `CalculatorsSection` unmodified -- no calculator UI is duplicated here.
 */
export function EmbedApp() {
  const params = useMemo(() => readEmbedParams(), []);
  const state = useWidgetConfig(params.publicKey);
  useReportSizeToParent();

  const viewedRef = useRef(false);
  useEffect(() => {
    if (state.status !== 'loaded' || viewedRef.current || !params.publicKey) return;
    viewedRef.current = true;
    recordAttributionEvent({
      widgetPublicKey: params.publicKey,
      eventType: AttributionEventType.WidgetViewed,
      campaign: params.campaign,
      source: params.source,
      landingPath: params.landingPath,
    });
  }, [state.status, params]);

  if (state.status === 'invalid-key') {
    return <Fallback message="This widget is not configured correctly (missing widget key)." />;
  }
  if (state.status === 'not-found') {
    return <Fallback message="This widget could not be found." />;
  }
  if (state.status === 'error') {
    return <Fallback message="This widget is temporarily unavailable. Please try again shortly." />;
  }
  if (state.status === 'loading') {
    return (
      <div className="p-4 text-sm text-ink-soft" role="status" aria-live="polite">
        Loading…
      </div>
    );
  }

  const { config } = state;
  const themeVars = brandCssVariables(config.theme.primaryColor) as CSSProperties;

  if (config.status === 'PAUSED') {
    return (
      <div style={themeVars}>
        <Fallback message="This calculator widget is temporarily paused by its owner. Please check back later." />
      </div>
    );
  }

  return (
    <div style={themeVars} className="p-4">
      {config.theme.logoUrl ? (
        <img
          src={config.theme.logoUrl}
          alt=""
          className="mb-4 h-8 w-auto"
          // Decorative branding only; the widget name below carries the accessible label.
          aria-hidden="true"
        />
      ) : null}
      <CalculatorsSection
        enabledCalculators={config.enabledCalculators}
        leadCaptureWidgetPublicKey={params.publicKey ?? undefined}
      />
      <p className="mt-6 text-xs text-ink-faint">
        Estimates shown by Tech Realty Rentals tools are not loan offers, approvals, or financial
        advice.
      </p>
    </div>
  );
}

function Fallback({ message }: { message: string }) {
  return (
    <div className="p-4" role="status" aria-live="polite">
      <p className="text-sm text-ink-soft">{message}</p>
    </div>
  );
}
