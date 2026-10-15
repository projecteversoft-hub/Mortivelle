/**
 * The embed page's own URL query parameters -- the integration contract an agent's embed
 * snippet uses to configure this specific `<iframe>` (docs/06 §3: "pass a public widget
 * key" via the embed URL; a public, non-secret identifier is fine there, unlike calculator
 * *inputs*, which must never appear in a URL per Phase 3's rule).
 *
 * `campaign`/`source`/`landingPath` are also read from here, not from `document.referrer`:
 * under the default modern-browser referrer policy, a cross-origin iframe's `document.
 * referrer` carries only the parent page's origin (no path) for privacy reasons, so the
 * parent page's own path/campaign context cannot be read from inside this iframe at all --
 * it must be passed explicitly by the embedding snippet, the same way the public key is.
 */
export interface EmbedParams {
  publicKey: string | null;
  campaign?: string;
  source?: string;
  landingPath?: string;
}

export function readEmbedParams(search: string = window.location.search): EmbedParams {
  const params = new URLSearchParams(search);
  const get = (name: string): string | undefined => {
    const value = params.get(name)?.trim();
    return value ? value : undefined;
  };
  return {
    publicKey: get('key') ?? null,
    campaign: get('campaign'),
    source: get('source'),
    landingPath: get('landingPath'),
  };
}
