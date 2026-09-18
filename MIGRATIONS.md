# Releases and migrations

`DEPLOY.md` gets the server built for the first time. This file covers what you
do on every release after that — most of which is nothing, because the deploy
workflow runs migrations for you. The reason it exists is the exceptions: a
release that adds a column is routine, and a release that backfills one, or
changes what an existing endpoint does, is not.

Newest release first.

> Moving the site to a **different server** is not a release and is not covered
> here — see `DEPLOY.md`, Appendix F.

---

## How a release normally goes

Push to `main`. The GitHub Actions workflow builds the image, pushes it to
GHCR, and on the server runs `docker compose up -d`, which runs `ops/migrate.cjs`
before the app starts. Migrations are applied in filename order and recorded, so
running them twice is a no-op.

Two habits worth keeping:

```bash
# before you push anything with a migration in it — on the server
cd ~/akaralabs && ls -la backups | tail -3
```

The stack backs up nightly and at startup, but a migration that turns out to be
wrong is exactly the moment you want a backup from *minutes* ago, not last
night.

```bash
# after the deploy lands — on the server
docker compose logs --tail=40 web | grep -i migrat
```

`migrations applied` means the schema moved. Its absence after a release that
contained a migration means the container is running old code — check the image
digest before debugging anything else.

### When a migration fails

The app exits rather than starting against a schema it does not understand,
which is deliberate: a half-migrated database serving requests is worse than a
minute of downtime. `docker compose logs web` names the statement. Fix forward
with a new migration where you can — editing an applied one leaves your server
and your laptop permanently disagreeing about what has run.

### Writing one

```bash
# on your laptop, after editing src/db/schema.ts
npm run db:generate      # writes drizzle/NNNN_name.sql from the schema diff
npm run db:migrate       # apply locally and actually look at the result
```

Read the generated SQL before committing it. Drizzle infers intent from a diff,
and a column rename it reads as a drop-and-add loses the data in that column.

---

## 0002 — Email verification by code · (this release)

**Migration:** `drizzle/0001_confused_puma.sql`
**Adds:** `email_otps` table; `requests.email_verified_at`
**Backfill:** yes — read the note below before deploying
**Config:** none. No new environment variables.

### What changes for users

Three flows that previously took an address on trust now ask for a six-digit
code emailed to it.

| Flow | Before | After |
|---|---|---|
| Signup | Account created, confirmation link emailed, usable either way | Account created **only** after the code is entered — and born verified |
| Guest print/project request | Request saved, receipt + studio notification sent immediately | Request saved, **only** the code sent; receipt, studio ping and tracking link all wait for it |
| Google sign-in | Verified automatically | Unchanged — Google has already proven the address |
| Dashboard "confirm your email" | Emailed a link | Shows a code box |

The old `/verify?token=…` page still works, so confirmation links already
sitting in someone's inbox are not broken by this release.

### The backfill, and why it is there

The migration ends with:

```sql
UPDATE "requests" SET "email_verified_at" = "created_at" WHERE "email_verified_at" IS NULL;
```

Every request already in the table predates verification. Without this line they
all arrive in the admin queue flagged *email unconfirmed* — a backlog of false
alarms on day one, and, worse, indistinguishable from a genuine unconfirmed lead
arriving tomorrow. They were accepted under the old rules, so they are
grandfathered as confirmed at their creation time.

This runs inside the same migration, so there is nothing to do by hand. Confirm
it afterwards:

```bash
docker compose exec -T db psql -U akara -d akara -c \
  "select count(*) filter (where email_verified_at is null) as unconfirmed, count(*) as total from requests;"
```

Immediately after deploying, `unconfirmed` should be **0**. A number climbing
from zero over the following days is the feature working — those are real
enquiries nobody confirmed.

### SMTP is now load-bearing

It was not before. A signup with broken mail used to produce a usable account
and an unsent confirmation; now it produces no account at all, because the code
never arrives. Check before you deploy, not after:

```bash
# on the server
docker compose logs web | grep -i 'mail'
```

`[mail] SMTP is half-configured` or `[mail:dev]` in the logs means mail is being
**logged, not sent** — and with this release that means nobody can sign up.
`SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` all need to be set in `.env`.

Then prove it end to end on the real site: sign up with an address you can read,
and confirm the code arrives. Check the spam folder too — a six-digit code in a
short email is exactly the shape spam filters dislike, and if it is landing in
spam you want to know that on day one.

### Rollback

The schema change is additive — a new table and a nullable column — so the
previous image runs against the migrated database without complaint. It ignores
`email_verified_at` entirely, which means unconfirmed requests silently become
ordinary ones again.

```bash
# on the server — see DEPLOY.md, Appendix C
docker compose pull && docker compose up -d web   # after repointing the tag
```

Do **not** drop `email_otps` on the way back. A signup in flight has its pending
account parked there; dropping the table strands it, and the person retries into
"there's already an account on this email" that does not exist.

### Housekeeping

The daily cron now also prunes spent and expired codes. Nothing to configure —
it rides on the existing `/api/cron` call from Stage 8 — but it is the reason
the table does not grow forever, so if you ever remove that cron entry, know
that signup payloads accumulate.

---

## 0001 — Initial schema

**Migration:** `drizzle/0000_*.sql`

The 21-table baseline: users, accounts, sessions, requests, events, files,
quotes, messages, articles, printers, spools, print jobs, notifications, audit
log, rate limits, subscribers, settings. Applied by the first deploy in
`DEPLOY.md`, Stage 4. Nothing to do separately.
