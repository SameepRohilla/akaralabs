"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/* Re-runs the legacy page effects after a client-side navigation.
 *
 * public/assets/js/shared.js is loaded once from the root layout. That is right
 * for the things it sets up in the layout — logo, nav, theme, the WhatsApp
 * button — which survive a route change. It is wrong for everything it sets up
 * inside <main>, because Next.js replaces that markup without reloading the
 * document, and the script never runs again.
 *
 * The visible consequence was a page that appeared not to load at all. `.reveal`
 * starts at `opacity: 0` and only becomes visible when shared.js adds `.in`, so
 * after following a link the new page was fully present in the DOM, correctly
 * laid out, and completely invisible. Refreshing fixed it, because a refresh
 * re-runs the script — which is exactly the shape of the bug report, and why it
 * never showed up in tests that asserted on DOM content rather than on what you
 * could actually see.
 *
 * shared.js exposes window.akaraPageInit for this. It is idempotent: every
 * effect marks the elements it has already handled, so re-running only picks up
 * markup that just arrived.
 */
declare global {
  interface Window {
    akaraPageInit?: () => void;
  }
}

export default function LegacyEffects() {
  const pathname = usePathname();

  useEffect(() => {
    // The new markup has to be committed to the DOM before we look for it, and
    // on the first load this may run before shared.js (afterInteractive) has
    // executed at all — in which case the script's own call covers us and the
    // optional chaining below simply does nothing.
    const run = () => window.akaraPageInit?.();

    const raf = requestAnimationFrame(run);
    // A short retry covers the first navigation after a cold start, where the
    // script can still be in flight when the route changes.
    const retry = setTimeout(run, 300);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(retry);
    };
  }, [pathname]);

  return null;
}
