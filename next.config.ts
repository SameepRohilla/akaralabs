import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  output: "standalone",
  // The live site is indexed with trailing slashes (/work/), so keep those
  // canonical. skipTrailingSlashRedirect stops Next from 308-ing API routes
  // to /api/x/ — a redirect that silently breaks POSTs from older clients.
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  // We are the only project in this directory; pin the trace root so the
  // standalone bundle doesn't reach for a parent lockfile.
  outputFileTracingRoot: here,
  poweredByHeader: false,
  compress: true,
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async redirects() {
    return [{ source: "/index.html", destination: "/", permanent: true }];
  },
};

export default config;
