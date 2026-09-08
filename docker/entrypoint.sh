#!/bin/sh
# Applies pending migrations, then hands off to the server.
#
# Migrating here (rather than in CI) keeps the schema in step with the exact
# image about to serve traffic. Drizzle records what it has applied, so
# restarts and rollbacks are no-ops rather than broken deploys.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "FATAL: DATABASE_URL is not set" >&2
  exit 1
fi

if [ "${SKIP_MIGRATIONS:-0}" = "1" ]; then
  echo "==> migrations skipped (SKIP_MIGRATIONS=1)"
else
  echo "==> applying migrations"
  # ops/migrate.cjs is self-contained and waits for Postgres to accept
  # connections before running, so `depends_on` racing the DB's first-run
  # initialisation is not a problem.
  node ops/migrate.cjs
fi

echo "==> starting Akara Labs"
exec "$@"
