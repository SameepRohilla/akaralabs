#!/usr/bin/env bash
#
# Restrict ports 80 and 443 to Cloudflare's own IP ranges, so nobody can
# bypass the CDN and WAF by finding your origin IP and hitting it directly.
#
#   sudo ./scripts/lock-origin.sh            # apply
#   sudo ./scripts/lock-origin.sh --dry-run  # show what it would do
#
# ─────────────────────────────────────────────────────────────────────────────
# READ THIS FIRST — it interacts with TLS certificates.
#
# Caddy gets its certificate from Let's Encrypt over an HTTP-01 challenge,
# which means Let's Encrypt's validators must reach port 80. They are not
# Cloudflare IPs. So once this script runs, ACME renewal STOPS WORKING and
# your certificate will quietly expire in ~60 days.
#
# You must therefore do one of these first:
#
#   A. Use a Cloudflare Origin CA certificate (recommended, and simplest).
#      Free, valid 15 years, trusted by Cloudflare in Full (strict) mode.
#      Cloudflare dashboard -> SSL/TLS -> Origin Server -> Create Certificate.
#      Save the cert and key to ./docker/origin/ and switch the Caddyfile to
#      the `tls` block documented in docker/Caddyfile. No ACME, nothing to
#      renew, and it works with port 80 closed to the world.
#
#   B. Switch Caddy to a DNS-01 challenge with the Cloudflare DNS plugin,
#      which needs a custom Caddy build and an API token.
#
# Option A is what DEPLOY.md walks through. This script refuses to run unless
# it can see that you've done one of them, or you pass --force.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
cd "$(dirname "$0")/.."

DRY=0
FORCE=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --force) FORCE=1 ;;
    *) echo "unknown option: $a" >&2; exit 1 ;;
  esac
done

if [ "$(id -u)" != "0" ] && [ "$DRY" = "0" ]; then
  echo "needs root (ufw). Try: sudo $0" >&2
  exit 1
fi

# ---- Safety check: are we about to break certificate renewal? -------------
if [ "$FORCE" = "0" ]; then
  if grep -qE '^[[:space:]]*tls[[:space:]]+/etc/caddy/origin/' docker/Caddyfile 2>/dev/null; then
    echo "==> Caddyfile uses an Origin CA certificate. Safe to lock down."
  else
    cat >&2 <<'WARN'
REFUSING TO RUN.

The Caddyfile still uses automatic HTTPS (Let's Encrypt). Closing port 80 to
everything except Cloudflare will break certificate renewal, and the site will
go down when the current certificate expires — quietly, in about 60 days.

Set up a Cloudflare Origin CA certificate first (see the comment at the top of
this script and the tls block in docker/Caddyfile), or re-run with --force if
you have handled this another way.
WARN
    exit 1
  fi
fi

# ---- Fetch Cloudflare's published ranges ----------------------------------
echo "==> fetching Cloudflare IP ranges"
V4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
V6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)

# Sanity: Cloudflare publishes ~15 v4 and ~7 v6 ranges. A truncated or
# error-page response must not become a firewall rule.
V4_COUNT=$(printf '%s\n' "$V4" | grep -cE '^[0-9]+\.') || true
V6_COUNT=$(printf '%s\n' "$V6" | grep -cE '^[0-9a-fA-F]*:') || true
echo "    v4 ranges: $V4_COUNT     v6 ranges: $V6_COUNT"

if [ "$V4_COUNT" -lt 10 ] || [ "$V6_COUNT" -lt 3 ]; then
  echo "FATAL: that doesn't look like Cloudflare's IP list. Refusing to touch the firewall." >&2
  exit 1
fi

# ---- Build the rules -------------------------------------------------------
echo
echo "==> rules to apply:"
echo "    allow 22/tcp                    (SSH — restrict further if you have a static IP)"
for r in $V4 $V6; do
  echo "    allow from $r to any port 80,443 proto tcp"
done
echo "    deny 80/tcp, 443/tcp            (everything else)"
echo

if [ "$DRY" = "1" ]; then
  echo "==> --dry-run: nothing changed."
  exit 0
fi

echo "==> applying"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null

for r in $V4 $V6; do
  ufw allow from "$r" to any port 80,443 proto tcp >/dev/null
done

ufw --force enable >/dev/null
echo
ufw status verbose

cat <<'DONE'

==> Origin locked to Cloudflare.

Verify from your laptop — the first should fail, the second should work:

  curl -m 10 -I https://YOUR.SERVER.IP        # expect timeout / refused
  curl -m 10 -I https://akaralabs.in          # expect 200

Cloudflare publishes new ranges occasionally. Re-run this script after any
Cloudflare announcement, or put it on a monthly cron:

  0 4 1 * * /home/YOU/akaralabs/scripts/lock-origin.sh >> /var/log/lock-origin.log 2>&1

Also consider turning on Authenticated Origin Pulls (SSL/TLS -> Origin Server),
which makes Cloudflare present a client certificate your origin can require —
that survives an IP range change.
DONE
