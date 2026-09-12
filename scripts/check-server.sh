#!/usr/bin/env bash
#
# Run this ON THE SERVER, before deploying anything to it.
#
#   curl -fsSL <raw-url>/scripts/check-server.sh | bash
#   # or, once the repo is on the box:
#   bash scripts/check-server.sh
#
# It answers the questions a hosting company's marketing page can't: where this
# machine actually is, what it can reach, and whether anything is already
# squatting on the ports Caddy needs.
#
# Nothing here changes the system. Read-only.

set -uo pipefail

PASS=0; WARN=0; FAIL=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; [ $# -gt 1 ] && printf '      → %s\n' "$2"; WARN=$((WARN+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; [ $# -gt 1 ] && printf '      → %s\n' "$2"; FAIL=$((FAIL+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

printf '\n\033[1mAkara Labs — server check\033[0m\n'
printf '────────────────────────────────────────────────────────────\n'

# ---- 1. The machine -------------------------------------------------------
head_ "MACHINE"

ARCH=$(dpkg --print-architecture 2>/dev/null || uname -m)
if [ "$ARCH" = "amd64" ] || [ "$ARCH" = "x86_64" ]; then
  ok "architecture $ARCH — the default CI build (linux/amd64) matches"
else
  bad "architecture $ARCH" \
    "Set the BUILD_PLATFORMS repo variable to linux/amd64,linux/arm64 or the image won't run here"
fi

. /etc/os-release 2>/dev/null || true
ok "${PRETTY_NAME:-unknown OS}, kernel $(uname -r)"

MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
SWAP_MB=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -ge 3500 ]; then
  ok "RAM ${MEM_MB} MB"
elif [ "$MEM_MB" -ge 1800 ]; then
  warn "RAM ${MEM_MB} MB — the honest minimum" \
    "A 95 MB upload wants ~400 MB of headroom. Add swap: see the FS section below."
else
  bad "RAM ${MEM_MB} MB is below the 2 GB floor" "One large upload will OOM-kill the app"
fi

if [ "$SWAP_MB" -ge 1000 ]; then
  ok "swap ${SWAP_MB} MB"
elif [ "$MEM_MB" -lt 3500 ]; then
  warn "no meaningful swap (${SWAP_MB} MB)" \
    "sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile"
else
  ok "swap ${SWAP_MB} MB (plenty of RAM, so not important)"
fi

DISK_GB=$(df -BG --output=avail / 2>/dev/null | tail -1 | tr -dc '0-9')
if [ "${DISK_GB:-0}" -ge 35 ]; then
  ok "disk ${DISK_GB} GB free on /"
elif [ "${DISK_GB:-0}" -ge 20 ]; then
  warn "disk ${DISK_GB} GB free on /" "Uploads grow ~7 GB/year, and backups live here until copied off"
else
  bad "disk ${DISK_GB} GB free on /" "Too tight for images, uploads and backups together"
fi

CPUS=$(nproc 2>/dev/null || echo "?")
ok "${CPUS} vCPU  (builds happen in CI, so this only serves requests)"

# ---- 2. Where is it, really? ---------------------------------------------
head_ "LOCATION"
echo "  (Marketing pages describe a fleet. This asks THIS machine.)"

REGION=""

# Anything on the way to 169.254.169.254 — an HTTP proxy, a captive portal, a
# corporate egress filter — will happily return a human-readable error page with
# a 200. Taking that as a region name is how you end up confidently telling
# someone their server is in the wrong country. So every value is validated
# against the shape a real region identifier has before it is believed.
looks_like_region() {
  printf '%s' "$1" | grep -qE '^[A-Za-z][A-Za-z0-9 ()._-]{2,40}$' && \
  ! printf '%s' "$1" | grep -qiE 'error|denied|forbidden|proxy|not (found|allowed)|reserved|private|<'
}

# Oracle Cloud — Bluehost/Newfold and several resellers run on OCI.
OCI=$(curl -s --max-time 3 -H 'Authorization: Bearer Oracle' \
        http://169.254.169.254/opc/v2/instance/ 2>/dev/null || true)
if printf '%s' "$OCI" | grep -q '"region"'; then
  CAND=$(printf '%s' "$OCI" | grep -oP '"canonicalRegionName"\s*:\s*"\K[^"]+' | head -1 || true)
  [ -z "$CAND" ] && CAND=$(printf '%s' "$OCI" | grep -oP '"region"\s*:\s*"\K[^"]+' | head -1 || true)
  if looks_like_region "${CAND:-}"; then REGION="$CAND"; ok "Oracle Cloud, region: $REGION"; fi
fi

# AWS / DigitalOcean, in case you move later.
if [ -z "$REGION" ]; then
  TOK=$(curl -s --max-time 2 -X PUT http://169.254.169.254/latest/api/token \
        -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' 2>/dev/null || true)
  # A real IMDSv2 token is a long opaque blob with no spaces.
  if printf '%s' "$TOK" | grep -qE '^[A-Za-z0-9+/=_-]{20,}$'; then
    CAND=$(curl -s --max-time 2 -H "X-aws-ec2-metadata-token: $TOK" \
             http://169.254.169.254/latest/meta-data/placement/region 2>/dev/null || true)
    if looks_like_region "${CAND:-}"; then REGION="$CAND"; ok "AWS, region: $REGION"; fi
  fi
fi
if [ -z "$REGION" ]; then
  CAND=$(curl -s --max-time 2 http://169.254.169.254/metadata/v1/region 2>/dev/null || true)
  if looks_like_region "${CAND:-}"; then REGION="$CAND"; ok "DigitalOcean, region: $REGION"; fi
fi

if [ -n "$REGION" ]; then
  case "$REGION" in
    *mumbai*|*ap-south*|*bom*|*hyderabad*|*blr*|*India*|*india*)
      ok "that region is in India — residency requirement satisfied at the metal" ;;
    *)
      bad "region '$REGION' does NOT look like India" \
        "Customer CAD files and the database would sit outside India. Rebuild in an Indian region." ;;
  esac
else
  warn "no cloud metadata service answered — can't confirm the region from inside" \
    "Check the public IP's allocation instead: whois \$(curl -s https://api.ipify.org)"
fi

IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || true)
[ -n "$IP" ] && ok "public IP $IP  (verify with: whois $IP | grep -i country)"

# ---- 3. Can it reach what the deploy needs? ------------------------------
head_ "OUTBOUND"

try() { timeout 6 bash -c "cat < /dev/null > /dev/tcp/$1/$2" 2>/dev/null; }

if try ghcr.io 443;        then ok "ghcr.io:443 — can pull the app image";
                           else bad "ghcr.io:443 unreachable" "The deploy cannot pull its image"; fi
if try download.docker.com 443; then ok "download.docker.com:443";
                           else warn "download.docker.com:443 unreachable" "Docker install will fail"; fi

# 587 is what this app uses. 25 is informational — many clouds block it and we
# don't need it, so a block there is not a failure.
if try smtp.zoho.in 587;   then ok "smtp.zoho.in:587 — transactional email can go out";
                           else bad "smtp.zoho.in:587 BLOCKED" \
                                "Every quote, verification and tracking email would fail silently. Ask support to open it, or use an HTTPS email API instead."; fi
if try smtp.zoho.in 25;    then ok "port 25 open too (not needed, but noted)";
                           else warn "port 25 blocked (normal on most clouds — this app doesn't use it)"; fi

# ---- 4. Is anything in the way? ------------------------------------------
head_ "PORTS"

busy() { (ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep -qE "[:.]$1[[:space:]]"; }
who()  { (ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep -E "[:.]$1[[:space:]]" | head -1; }

for p in 80 443; do
  if busy "$p"; then
    bad "port $p is already in use" "Caddy needs it. In use by: $(who "$p")"
  else
    ok "port $p free"
  fi
done
if busy 5432; then
  warn "port 5432 is listening" "Postgres runs inside Docker on a private network — nothing should expose 5432 publicly"
else
  ok "port 5432 not exposed"
fi

# ---- 5. Docker -----------------------------------------------------------
head_ "DOCKER"

if command -v docker >/dev/null 2>&1; then
  ok "docker $(docker --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)"
  if docker compose version >/dev/null 2>&1; then
    ok "compose $(docker compose version --short 2>/dev/null)"
  else
    bad "docker compose v2 missing" "Install docker-compose-plugin — the v1 'docker-compose' won't read this file"
  fi
  # "can't reach the daemon" has two very different causes and one useless
  # error message. Tell them apart before suggesting a fix.
  if docker info >/dev/null 2>&1; then
    ok "the daemon is reachable as $(whoami)"
  elif ! systemctl is-active --quiet docker 2>/dev/null; then
    bad "the docker daemon is not running" \
      "sudo systemctl enable --now docker   (then: sudo journalctl -u docker -n 50 if it won't start)"
  else
    warn "daemon is running but not reachable as $(whoami)" \
      "sudo usermod -aG docker \$USER, then log out and back in"
  fi
else
  warn "docker not installed yet" "That's Stage 2a"
fi

# ---- Summary -------------------------------------------------------------
printf '\n────────────────────────────────────────────────────────────\n'
if [ "$FAIL" -gt 0 ]; then
  printf '\033[31m✗ %d blocking, %d warning(s), %d ok — fix the ✗ lines before deploying.\033[0m\n\n' "$FAIL" "$WARN" "$PASS"
  exit 1
fi
printf '\033[32m✓ nothing blocking\033[0m, %d warning(s), %d ok.\n\n' "$WARN" "$PASS"
