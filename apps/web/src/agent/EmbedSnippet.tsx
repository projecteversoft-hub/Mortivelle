import { useState } from 'react';
import type { WidgetResponse } from '@tech-realty-rentals/shared';

/**
 * The copy-paste embed snippet an agent puts on their own site (docs/06 §3, §6 "preview
 * branding and enabled calculators"). Two parts: the `<iframe>` itself (its `src` carries
 * only the non-secret public widget key, per docs/06 §4) and the one small sizing script
 * (apps/web/public/embed-resize.js) that auto-resizes it via `postMessage`.
 */
export function EmbedSnippet({ widget }: { widget: WidgetResponse }) {
  const [copied, setCopied] = useState(false);
  const origin = window.location.origin;
  const snippet = [
    `<iframe`,
    `  src="${origin}/embed.html?key=${widget.publicKey}"`,
    `  style="width:100%;border:0;min-height:200px"`,
    `  title="${widget.name}"`,
    `></iframe>`,
    `<script src="${origin}/embed-resize.js"></script>`,
  ].join('\n');

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the text is already visible to copy manually.
    }
  }

  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-ink">Embed snippet</h4>
      <pre className="mt-1 overflow-x-auto rounded-md bg-ink/5 p-3 text-xs text-ink">
        <code>{snippet}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="mt-2 rounded-md border border-paper-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-paper-line"
      >
        {copied ? 'Copied!' : 'Copy snippet'}
      </button>
    </div>
  );
}
