#!/usr/bin/env bash
#
# Restore a pg_dump backup safely.
#
#   ./scripts/restore.sh backups/akara-20260905-2100.sql.gz
#
# Restoring a plain dump over a live database gives you a wall of
# "relation already exists" and "duplicate key" errors and leaves you with a
# half-restored mess. So this doesn't do that. It:
#
#   1. restores into a brand-new database alongside the live one
#   2. verifies the restore actually contains data
#   3. renames the live database out of the way and the restored one into place
#   4. leaves the old database on disk, renamed, so you can go back
#
# The app is stopped for the swap and started again afterwards. Expect about a
# minute of downtime for a small database.
#
# DRY_RUN=1 does everything except the final swap.

set -euo pipefail
cd "$(dirname "$0")/.."

DUMP="${1:-}"
DB="${DB_NAME:-akara}"
USER="${DB_USER:-akara}"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
STAGING="${DB}_restore_${STAMP}"
RETIRED="${DB}_old_${STAMP}"

if [ -z "$DUMP" ]; then
  echo "usage: $0 <backup.sql.gz>" >&2
  echo >&2
  echo "available:" >&2
  ls -1t backups/*.sql.gz 2>/dev/null | head -10 >&2 || echo "  (none in ./backups)" >&2
  exit 1
fi
[ -f "$DUMP" ] || { echo "no such file: $DUMP" >&2; exit 1; }

# Run psql inside the db container, as postgres (needs CREATEDB/rename rights).
pg() { docker compose exec -T db psql -U "$USER" -d postgres -v ON_ERROR_STOP=1 "$@"; }
pgdb() { docker compose exec -T db psql -U "$USER" -d "$1" -v ON_ERROR_STOP=1 "${@:2}"; }

echo "==> dump:     $DUMP ($(du -h "$DUMP" | cut -f1))"
echo "==> live db:  $DB"
echo "==> staging:  $STAGING"
echo

# ---- 1. Restore into a fresh database -------------------------------------
echo "==> creating $STAGING"
pg -c "CREATE DATABASE \"$STAGING\""

echo "==> restoring (errors here are safe — nothing live has been touched yet)"
if ! gunzip -c "$DUMP" | docker compose exec -T db psql -U "$USER" -d "$STAGING" -v ON_ERROR_STOP=1 >/dev/null; then
  echo "FATAL: restore into $STAGING failed. Live database untouched." >&2
  echo "       Inspect with: docker compose exec db psql -U $USER -d $STAGING" >&2
  echo "       Drop with:    docker compose exec db psql -U $USER -d postgres -c 'DROP DATABASE \"$STAGING\"'" >&2
  exit 1
fi

# ---- 2. Verify it before trusting it --------------------------------------
echo "==> verifying"
TABLES=$(pgdb "$STAGING" -tAc "select count(*) from information_schema.tables where table_schema='public'")
USERS=$(pgdb "$STAGING" -tAc "select count(*) from users" 2>/dev/null || echo "ERR")
REQS=$(pgdb "$STAGING" -tAc "select count(*) from requests" 2>/dev/null || echo "ERR")
ADMINS=$(pgdb "$STAGING" -tAc "select count(*) from users where role='admin'" 2>/dev/null || echo "ERR")

echo "    tables:   $TABLES"
echo "    users:    $USERS  (admins: $ADMINS)"
echo "    requests: $REQS"

if [ "$TABLES" -lt 15 ] || [ "$USERS" = "ERR" ] || [ "$REQS" = "ERR" ]; then
  echo "FATAL: restored database doesn't look right. Live database untouched." >&2
  echo "       Left $STAGING in place for you to inspect." >&2
  exit 1
fi
if [ "$ADMINS" = "0" ]; then
  echo "WARNING: no admin account in this backup — you'd be locked out of /admin." >&2
  echo "         Continuing, but run db:seed afterwards." >&2
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo
  echo "==> DRY_RUN: stopping before the swap."
  echo "    Verified restore is in database: $STAGING"
  echo "    Drop it with: docker compose exec db psql -U $USER -d postgres -c 'DROP DATABASE \"$STAGING\"'"
  exit 0
fi

# ---- 3. Swap ---------------------------------------------------------------
echo
echo "==> stopping the app so nothing writes during the swap"
docker compose stop web

echo "==> terminating remaining connections to $DB"
pg -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB' AND pid <> pg_backend_pid()" >/dev/null

echo "==> $DB -> $RETIRED,  $STAGING -> $DB"
pg -c "ALTER DATABASE \"$DB\" RENAME TO \"$RETIRED\""
pg -c "ALTER DATABASE \"$STAGING\" RENAME TO \"$DB\""

echo "==> starting the app"
docker compose up -d --no-deps web

echo "==> waiting for health"
for i in $(seq 1 24); do
  cid=$(docker compose ps -q web)
  status=$(docker inspect --format='{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)
  [ "$status" = "healthy" ] && break
  sleep 5
done

echo
echo "==> done. Restored from $DUMP"
echo
echo "    The previous database is still here as: $RETIRED"
echo "    To go back:"
echo "      docker compose stop web"
echo "      docker compose exec -T db psql -U $USER -d postgres -c 'ALTER DATABASE \"$DB\" RENAME TO \"${DB}_failed_${STAMP}\"'"
echo "      docker compose exec -T db psql -U $USER -d postgres -c 'ALTER DATABASE \"$RETIRED\" RENAME TO \"$DB\"'"
echo "      docker compose up -d --no-deps web"
echo
echo "    Once you're satisfied, reclaim the space:"
echo "      docker compose exec -T db psql -U $USER -d postgres -c 'DROP DATABASE \"$RETIRED\"'"
echo
echo "    NOTE: this restored the database only. Uploaded files are a separate"
echo "    backup — see the storage tarball step in DEPLOY.md Stage 8."
