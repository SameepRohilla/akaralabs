# Akara Labs — website & studio platform

The marketing site plus a customer portal and a studio admin, running as one
Next.js app on your own server.

What changed from the old static site: nothing visual. Every marketing page is
byte-identical markup and CSS, now served by Next instead of Cloudflare Pages
directly. On top of that sit accounts, request tracking, quotes, a file vault,
per-request messaging, a member journal, and an admin for running the workshop.

---

## What's here

**Public**

| Route | What it is |
| --- | --- |
| `/` `/work/` `/about/` `/materials/` `/faq/` | the original pages, unchanged |
| `/start/` `/print/` | the original intake wizards, now posting to our own API |
| `/articles/` | the journal — public, members-only and clients-only pieces |
| `/estimate/` | drop in an STL, get a price in the browser |
| `/track/` | check a request by reference + email, no account needed |

**Customer** — `/dashboard`

Request list with live stage, a timeline per request, quotes to approve or send
back, a message thread, a model library of everything they've sent, saved
articles, and notification preferences.

**Studio** — `/admin`

Queue with search and stage filters, a request view with the STL geometry
already read and the quote pre-priced from it, a quote builder, a message thread
with internal notes, stage control, the journal editor, a workshop board for
printers/spools/jobs, people, and an audit log.

---

## Running it locally

You need Node 22 and a Postgres you can reach.

```bash
npm install
cp .env.example .env.local          # set DATABASE_URL and AUTH_SECRET at minimum
npm run db:migrate                  # create the schema
npm run db:seed                     # your admin account, machines, spools, 3 articles
npm run dev
```

`npm run db:seed` reads `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_NAME`:

```bash
ADMIN_EMAIL=sameep@akaralabs.in ADMIN_PASSWORD='something-long' npm run db:seed
```

Without a `SMTP_HOST`, emails are printed to the console instead of sent — so
you can walk the whole flow locally without a mail server. Watch the terminal
for the verification and quote emails.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server on :3000 |
| `npm run build` / `npm start` | production build (see the note below) |
| `npm run typecheck` | `tsc --noEmit` — what CI gates on |
| `npm run db:generate` | write a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | apply pending migrations |
| `npm run db:studio` | Drizzle Studio, a GUI over the database |
| `npm run db:seed` | idempotent fixtures |
| `npm run preflight` | checks env, DB, storage, SMTP and OAuth — run before any deploy |
| `./scripts/serve.sh` | run the standalone build exactly as the container does |

> `next start` does **not** work with `output: standalone`. Use
> `./scripts/serve.sh` to test a production build locally.

---

## How it fits together

```
Cloudflare (DNS + CDN, Full-strict TLS)
        │
        ▼
   Caddy :443  ── TLS, gzip, cache headers, 220 MB body limit
        │
        ▼
   Next.js :3000  ── app + API, runs migrations at startup
        │
        ├──▶ Postgres 16          (requests, quotes, users, articles…)
        └──▶ /data/storage volume (customer CAD, photos, article downloads)
```

One process, one database, one volume. No queue, no Redis, no object store —
the rate limiter lives in Postgres and uploads live on disk, which is the right
trade at this size and removes two services from the failure surface.

### Decisions worth knowing about

**The old pages are used verbatim.** `scripts/extract-pages.mjs` pulls each
page's `<main>` and its page-scoped `<style>` out of the original HTML into
`src/content/legacy/`, and `LegacyPage` renders them. Re-authoring hand-tuned
markup as JSX would have been pure risk for no user-visible gain. New surfaces
— portal, admin, journal — are ordinary React.

If you edit a legacy page, edit the file in `src/content/legacy/`. Re-running
the extractor overwrites those files from the originals, and
`scripts/patch-wizards.mjs` re-applies the intake changes on top (it fails
loudly if the markup it expects has moved).

**Trailing slashes are kept.** The live site is indexed as `/work/`, so
`trailingSlash: true` preserves every existing link and backlink.
`skipTrailingSlashRedirect` stops that from 308-ing API routes, which silently
breaks POSTs.

**Money is integer paise.** No floats anywhere near a price. `src/lib/money.ts`
has the only arithmetic; `quoteTotals()` is the single source of truth for what
a quote adds up to, used by both the builder's live preview and the server.

**The STL parser is one implementation.** `src/lib/stl.ts` is written against
`DataView`, so the same code runs in the browser on `/estimate` and on the
server at intake. If they were separate, a customer would be quoted one number
in the estimator and see another in their dashboard.

**Guest requests get claimed automatically.** Someone can enquire with no
account. When they later sign up — or sign in with Google — every request on
that email address is attached to them, with an event on the timeline saying so.

**Files never sit in `/public`.** Every download goes through
`/api/files/[id]`, which checks ownership, staff role, or a valid tracking
token.

---

## Deploying to your own server

One-time setup, then every push to `main` deploys itself.

### 1. On the server

```bash
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER    # log out and back in

mkdir -p ~/akaralabs && cd ~/akaralabs
# copy docker-compose.yml, docker/Caddyfile and .env.example across
cp .env.example .env
$EDITOR .env                      # fill in every CHANGE_ME
```

Generate the two secrets:

```bash
openssl rand -base64 33   # AUTH_SECRET
openssl rand -hex 24      # CRON_SECRET
```

Open 80 and 443, and nothing else:

```bash
sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

### 2. GitHub

Push this repo. Then **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | server IP or hostname |
| `DEPLOY_USER` | the SSH user |
| `DEPLOY_SSH_KEY` | private key for that user (`ssh-keygen -t ed25519`) |
| `DEPLOY_PATH` | `/home/youruser/akaralabs` |
| `DEPLOY_PORT` | only if SSH isn't on 22 |

And a **variable** `SITE_URL` = `https://akaralabs.in`.

The workflow typechecks and lints, builds a Docker image, pushes it to GHCR,
SSHes in, pulls, restarts, waits for the healthcheck, and **rolls back to the
previous image automatically** if the new one doesn't come up healthy. It then
smoke-tests the live site.

### 3. DNS

Point `akaralabs.in` at the server. In Cloudflare:

- `A  @    → your.server.ip   (proxied)`
- `A  www  → your.server.ip   (proxied)`
- **SSL/TLS → Overview → Full (strict)** ← this matters. Caddy holds a real
  certificate; Flexible mode causes a redirect loop.

You can leave the proxy off (grey cloud) if you'd rather; Caddy handles
certificates either way.

> The old Cloudflare Pages project can stay up during the switch. Once DNS
> points here and the site checks out, delete it so it can't be confused with
> the live deployment.

### 4. First deploy

```bash
cd ~/akaralabs
docker compose up -d           # migrations run automatically at container start
docker compose logs -f web
```

Then create your admin account. Either put your address in `ADMIN_EMAILS`
before the first sign-in, or run the seed inside the container:

```bash
docker compose exec web sh -c \
  'ADMIN_EMAIL=sameep@akaralabs.in ADMIN_PASSWORD="..." node ops/seed.cjs'
```

### 5. Daily housekeeping

```bash
crontab -e
0 6 * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://akaralabs.in/api/cron
```

Expires stale quotes, prunes spent tokens, and emails you a bench summary of
anything unquoted for a day, stalled a week, or due within three.

---

## Operating it

```bash
docker compose logs -f web            # app logs
docker compose ps                     # health
docker compose exec db psql -U akara  # database shell
```

**Backups** run nightly into `./backups` and keep 14 days. That's on the same
box as the database, so copy them off it — `rclone`, `rsync`, anything:

```bash
rclone copy ~/akaralabs/backups remote:akara-backups
```

To restore:

```bash
gunzip -c backups/akara-20260905-2100.sql.gz | docker compose exec -T db psql -U akara -d akara
```

**Uploaded files** live in the `storage` docker volume, not in `./backups`.
Back them up too:

```bash
docker run --rm -v akaralabs_storage:/data -v $PWD/backups:/out alpine \
  tar czf /out/storage-$(date +%F).tar.gz -C /data .
```

**Rolling back by hand:**

```bash
sed -i 's|^IMAGE=.*|IMAGE=ghcr.io/you/akaralabs:sha-OLDER|' .env
docker compose up -d --no-deps web
```

---

## Pricing

The estimator and the admin's pre-priced quotes both come from the constants at
the bottom of `src/lib/stl.ts` — per-gram material rates, machine rate, setup
charge, flow rate. Change them there and both move together. They're
deliberately conservative and shown as a band; the real number is whatever you
put in the quote builder.

Filament stock comes from the `spools` table via the workshop page, and it feeds
the estimator's material list and the public materials page. Marking a print job
done or failed draws its filament off the spool automatically.

---

## Still to do

- **Attachments on articles** — the schema and the download route are in;
  the editor's upload UI isn't. Link files from the body for now.
- **Payments** — quotes are approved in-app but invoicing is still manual.
  Razorpay would slot in at the quote-accepted step.
- **WhatsApp notifications** — the Cloud API would fit alongside `notify()`,
  which is already the single place every notification goes through.
- **Hindi in the portal** — the marketing site is fully bilingual and the
  language preference is stored per account; the portal strings aren't
  translated yet.
