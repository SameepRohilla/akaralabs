# syntax=docker/dockerfile:1.7

###############################################################################
# deps — installed separately so a code change doesn't reinstall node_modules
###############################################################################
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

###############################################################################
# builder — Next build, plus the operational scripts bundled to plain JS
###############################################################################
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The site URL is inlined into the client bundle at build time, so it has to be
# present here — not just at runtime.
ARG NEXT_PUBLIC_SITE_URL=https://akaralabs.in
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

RUN npm run build

# migrate / seed / preflight are TypeScript, but the runner should not need a
# TypeScript runtime to execute them. Bundling each into a self-contained .cjs
# means the runner needs nothing but `node`. (Shipping tsx instead meant
# also shipping esbuild and its platform binary — a hand-maintained list that
# silently lost @esbuild/linux-x64 and stopped migrations from running at all.)
RUN node scripts/bundle-ops.mjs

###############################################################################
# runner — standalone output, non-root, no build toolchain, no TS runtime
###############################################################################
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_DIR=/data/storage

RUN apk add --no-cache curl tini && \
    addgroup -g 1001 -S nodejs && \
    adduser -u 1001 -S nextjs -G nodejs

# `next build --output standalone` traces exactly the files the server needs,
# including the extracted marketing markup under src/content/legacy.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrations run at container start, so the runner needs the SQL and the
# bundled runner. Both are dependency-free.
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/ops ./ops

COPY --chown=nextjs:nodejs docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p /data/storage && chown -R nextjs:nodejs /data

USER nextjs
EXPOSE 3000
VOLUME ["/data/storage"]

HEALTHCHECK --interval=30s --timeout=4s --start-period=25s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--", "./entrypoint.sh"]
CMD ["node", "server.js"]
