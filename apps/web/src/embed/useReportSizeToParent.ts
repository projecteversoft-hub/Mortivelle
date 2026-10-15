import { useEffect } from 'react';

const RESIZE_MESSAGE_TYPE = 'eversoft:widget-resize';

/**
 * Reports this document's content height to the parent window via `postMessage`, matching
 * the sizing script the parent page loads (apps/web/public/embed-resize.js). Only sends when
 * actually embedded (`window.parent !== window`) and only this one fixed, low-sensitivity
 * numeric field -- never anything else. The target origin is deliberately `*`: this page is
 * designed to be embedded on an arbitrary, not-known-in-advance third-party origin (that is
 * the entire point of the embed), so the sender cannot restrict the target origin the way
 * the *receiving* sizing script restricts the sender's origin (docs/06 §3-4). This is safe
 * specifically because the payload is only a content height in pixels -- never any widget
 * configuration, calculator input/output, or anything else.
 */
export function useReportSizeToParent(): void {
  useEffect(() => {
    if (window.parent === window) return; // Not embedded; nothing to report.

    let lastHeight = -1;
    const report = (): void => {
      const height = document.documentElement.scrollHeight;
      if (height === lastHeight) return;
      lastHeight = height;
      window.parent.postMessage({ type: RESIZE_MESSAGE_TYPE, height }, '*');
    };

    report();
    const observer = new ResizeObserver(() => report());
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);
}
