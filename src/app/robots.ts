import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** Staging hosts must not compete with the real domain in search results.
    Rather than remembering to add a rule at Cloudflare and remove it later,
    this derives the answer from the site's own configured URL: anything that
    isn't the production domain disallows everything. */
const PRODUCTION_HOST = "akaralabs.in";

export default function robots(): MetadataRoute.Robots {
  const host = (() => {
    try {
      return new URL(SITE.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();

  const isProduction = host === PRODUCTION_HOST;

  if (!isProduction) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private surfaces and anything holding a capability token.
        disallow: ["/dashboard", "/admin", "/api/", "/track/", "/signin", "/signup", "/reset", "/verify", "/forgot"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
