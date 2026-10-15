/**
 * Tech Realty Rentals embed auto-sizing script (docs/06 §3: "Use a short script only to size the
 * iframe"). The agent's embed snippet includes this one `<script>` tag on their own page,
 * alongside an `<iframe src="https://<this-app's-origin>/embed.html?key=PUBLIC_WIDGET_KEY">`.
 * It does nothing else: no lead data, no analytics, no tracking -- only the iframe's content
 * height ever crosses this boundary.
 *
 * Security notes (docs/06 §3-4: "strict origin validation... on `postMessage`"):
 * - This script only ever ACTS on a message whose `event.origin` matches the origin this
 *   script itself was loaded from (`document.currentScript.src`'s origin) -- i.e. Tech Realty Rentals's
 *   own app origin, which is fixed and known (this script is served BY that app). A message
 *   from any other origin, including the embedding page's own origin, is ignored.
 * - It additionally checks `event.source === iframe.contentWindow` for the specific iframe
 *   being resized, and validates the message shape strictly (a fixed `type` tag plus a
 *   finite, sanely-bounded numeric height) before touching the DOM.
 * - It never reads, forwards, or acts on anything else in the message.
 */
(function () {
  'use strict';

  var MESSAGE_TYPE = 'eversoft:widget-resize';
  var MAX_HEIGHT_PX = 20000;

  var scriptEl = document.currentScript;
  if (!scriptEl || !scriptEl.src) return;
  var expectedOrigin;
  try {
    expectedOrigin = new URL(scriptEl.src).origin;
  } catch {
    return;
  }

  function isManagedIframe(iframe) {
    if (!(iframe instanceof HTMLIFrameElement) || !iframe.src) return false;
    try {
      return new URL(iframe.src, window.location.href).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== expectedOrigin) return;
    var data = event.data;
    if (
      !data ||
      typeof data !== 'object' ||
      data.type !== MESSAGE_TYPE ||
      typeof data.height !== 'number' ||
      !Number.isFinite(data.height) ||
      data.height < 0 ||
      data.height > MAX_HEIGHT_PX
    ) {
      return;
    }

    var iframes = document.getElementsByTagName('iframe');
    for (var i = 0; i < iframes.length; i += 1) {
      var iframe = iframes[i];
      if (isManagedIframe(iframe) && iframe.contentWindow === event.source) {
        iframe.style.height = Math.ceil(data.height) + 'px';
        return;
      }
    }
  });
})();
