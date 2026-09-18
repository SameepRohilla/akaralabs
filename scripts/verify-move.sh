#!/usr/bin/env bash
#
# Prove a restored copy is actually complete, before you point DNS at it.
#
#   ./scripts/verify-move.sh
#
# Run this on the NEW server once the database and the uploads are both in
# place. It answers the two questions a restore can quietly get wrong:
#
#   1. Did every row arrive? Counts every table and prints them. Compare the
#      output against the same script run on the old server.
#   2. Does every file row still have its file? A `pg_dump` taken at 14:00 and
#      an uploads tarball taken at 14:05 look fine individually, and leave you
#      with rows pointing at nothing — a customer's STL that 404s in admin, and
#      no error anywhere until they click it.
#
# The second check is the one worth having. Nothing else in the stack notices
# a missing file until someone asks for it.
#
# Exits non-zero if any file row has no file, so it can gate a cutover script.

set -uo pipefail
cd "$(dirname "$0")/.."

USER="${DB_USER:-akara}"
DB="${DB_NAME:-akara}"
STORAGE="${STORAGE_DIR:-/data/storage}"

pg() { docker compose exec -T db psql -U "$USER" -d "$DB" -tAX -c "$1"; }

echo "==> row counts"
echo

# Every user table, counted. Generated from the catalogue rather than a fixed
# list, so a table added by a future migration cannot be silently missed.
pg "
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
" | while read -r t; do
  [ -z "$t" ] && continue
  n=$(pg "select count(*) from \"$t\";")
  printf '  %-22s %s\n' "$t" "$n"
done

echo
echo "==> uploaded files"
echo

total=$(pg "select count(*) from files;")
echo "  rows in files:        $total"

# Ask the web container, not the host: the uploads live in a named volume and
# are only mounted inside it, so a check run on the host would report every
# file missing and look like a catastrophe.
missing=0
checked=0
while read -r key; do
  [ -z "$key" ] && continue
  checked=$((checked + 1))
  if ! docker compose exec -T web test -f "$STORAGE/$key" 2>/dev/null; then
    echo "  MISSING: $key"
    missing=$((missing + 1))
  fi
done < <(pg "select storage_key from files order by created_at;")

echo "  checked on disk:      $checked"
echo "  missing:              $missing"

# Orphans are the mirror image: files on disk with no row. Harmless — they
# waste space and nothing links to them — so they are reported, not fatal.
ondisk=$(docker compose exec -T web sh -c "find '$STORAGE' -type f | wc -l" 2>/dev/null | tr -d '\r')
echo "  files on disk:        ${ondisk:-?}"

echo
if [ "$missing" -gt 0 ]; then
  echo "FAIL: $missing file row(s) have no file."
  echo
  echo "Almost always means the uploads archive is older than the database dump."
  echo "Re-copy the uploads from the old server and run this again — do NOT move"
  echo "DNS until it comes back clean."
  exit 1
fi

echo "OK: every file row resolves on disk."
