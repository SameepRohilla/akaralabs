import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* Appends a content hash to a /public asset URL, so a deploy actually reaches
 * people who have already visited.
 *
 * The static CSS and JS are served from fixed paths — /assets/js/shared.js and
 * friends — which never change between releases. Browsers and Cloudflare cache
 * them by URL, so shipping a fix to shared.js left every returning visitor and
 * every warm edge running the old file, with nothing in the page to tell them
 * otherwise. Symptom: you deploy, you verify the file on the origin is correct,
 * and the site still behaves exactly as it did before.
 *
 * /assets/js/shared.js?v=1a2b3c4d is a different URL, so the fix lands the
 * moment the new HTML is served — no cache purge, no hard refresh, and no
 * asking customers to do either.
 *
 * The hash is computed once per file per process. Containers are replaced on
 * deploy, so that is exactly the right lifetime; a stale hash cannot outlive
 * the code it describes.
 */
const cache = new Map<string, string>();

export function asset(path: string): string {
  const cached = cache.get(path);
  if (cached) return cached;

  let out = path;
  try {
    const bytes = readFileSync(join(process.cwd(), "public", path));
    out = `${path}?v=${createHash("sha1").update(bytes).digest("hex").slice(0, 8)}`;
  } catch {
    /* Unreadable for any reason — fall back to the bare path. A missing version
       is a missed cache bust; throwing here would be a blank page. */
  }

  cache.set(path, out);
  return out;
}
