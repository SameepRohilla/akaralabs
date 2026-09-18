# Deploying akaralabs.in

Written for the plan you picked: **test on `new.akaralabs.in` first, flip the apex when it's proven.**

Work through it in order. Every stage ends with something you can verify, so if
a stage fails you know exactly what broke.

---

## Read this first: which "Cloudflare" do you mean?

"Website on Cloudflare, other things on the server" splits into two very
different architectures, and one of them is already what you have.

### Option 1 — Cloudflare in front, everything on the server ← what's built

```
Cloudflare  (DNS + CDN + WAF + TLS, orange cloud)
     │  cached static assets never reach your box
     ▼
Your server ── Caddy ── Next.js ── Postgres (localhost)
                                └─ /data/storage (uploads)
```

Cloudflare *is* serving your website: it terminates TLS, caches eligible
static assets at the edge according to its cache rules, absorbs bot traffic and
DDoS, and hides your server's IP. Your box only sees requests that actually
need it.

Note "eligible" — Cloudflare decides what to cache from its rules, not from
your intent. Verifying that authenticated pages are *never* cached is a
deployment step, not an assumption. See Stage 5. This is exactly what the
`docker-compose.yml` and `Caddyfile` in this repo do, and what the DNS steps
below set up.

**Nothing to change. No extra cost. Ready today.**

### Option 2 — the app *runs on* Cloudflare Workers, Postgres on the server

```
Cloudflare Workers (your Next.js code runs here)
     │  Hyperdrive (pooling)     R2 (uploads)
     ▼
Your server ── Postgres only
```

Real, and genuinely better than Vercel for this — but it's a project, not a
config change:

| | |
| --- | --- |
| **Upload limit** | 100 MB on Free/Pro, 200 MB on Business. Far better than Vercel's 4.5 MB, but still needs `MAX_UPLOAD_BYTES` kept under it. |
| **Free plan is unusable** | Workers Free allows **10 ms of CPU per request**. Hashing a password with bcrypt costs ~250 ms on its own. You need Workers Paid ($5/mo), where the default is 30 s. |
| **Storage must move** | `src/lib/storage.ts` uses `node:fs` and streams files from disk. Workers have no filesystem. It has to be rewritten against R2, and downloads become presigned redirects. |
| **Next.js needs an adapter** | OpenNext for Cloudflare. Works, but it's another moving part between you and a deploy. |
| **The database question improves** | Hyperdrive gives you real connection pooling, and can reach a private database over a Cloudflare Tunnel — so Postgres need not be exposed to the internet at all. This is the one genuine advantage over Vercel. Verify the Tunnel path on your plan before committing to it. |

Roughly a day of work, plus $5/month, to end up with a system that is faster
for anonymous visitors and slower for everything behind a login.

### What I'd suggest

**Option 1.** You already get Cloudflare's CDN, WAF and DDoS protection in
front — that's the part that matters. Running the app *on* Cloudflare adds a
rewrite, a subscription, and a WAN hop on every database query, in exchange for
edge rendering of pages that are mostly personal dashboards and can't be cached
anyway.

The honest case for Option 2 is that your server stops being a single point of
failure for the marketing site.

**Cloudflare's "Always Online" helps a little, but it is not failover.** When
your origin is unreachable it serves previously-crawled copies of *public,
cacheable* pages. It cannot serve anything dynamic. So during an outage:

```
/  /work/  /about/     may serve from cache
/dashboard /admin      down
/start/ /print/        down (forms need the API)
/api/*                 down
uploads, sign-in       down
```

Worth turning on — it keeps your storefront visible — but don't mistake it for
redundancy. If real uptime matters later, the answer is a second server and a
load balancer, not a different rendering model.

Revisit Option 2 if the studio ever gets enough traffic that one box strains —
you'd feel that long before it broke, and the storage layer is already isolated
behind one module for exactly that reason.

---

## Stage 0 — Prove it on your laptop first

Don't debug on the server. Get it green locally, where you can see everything.

First, check your Node version. The Docker image and CI both use Node 22, and
three transitive packages refuse anything below 20.9:

```bash
node -v
```

If that prints v18 or lower — which is what Ubuntu's `nodejs` package installs —
get 22 before going further. Building against one runtime and shipping on
another is a slow-burn source of "but it works on my laptop":

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
exec $SHELL
nvm install 22 && nvm use 22
```

There's a `.nvmrc` in the project, so `nvm use` on its own is enough after that.

Now unpack it. The archive already contains a top-level `akaralabs/` directory,
so extract it into your home directory and let it create that folder — don't
make the folder first and extract into it, or you get `~/akaralabs/akaralabs`
and every command below fails with "no such file or directory: package.json".

```bash
tar xzf akaralabs-nextjs.tar.gz -C ~
cd ~/akaralabs
ls package.json next.config.ts     # sanity check: both should exist
npm install
```

You need a Postgres. Three ways, in order of least hassle:

**A. No Docker, no root — use the bundled one.** `embedded-postgres` is already
a devDependency, so `npm install` has fetched a real Postgres 16 binary into
`node_modules`. This runs it as your own user, keeping its data in `.pgdata`
inside the project:

```bash
npm run db:local
```

Leave that terminal open; it prints the `DATABASE_URL` to paste below. Ctrl-C
stops it and your data survives. `npm run db:local -- reset` throws the data
away and starts clean, and deleting `.pgdata` removes every trace. Nothing is
installed system-wide and nothing needs `sudo` — which matters on a managed
work machine where you may not have it.

It's pinned to Postgres 16 to match the server. Do not "upgrade" it past that:
developing on one major and deploying on another is how you find out in
production that something changed between releases.

**B. If you do have Docker:**

```bash
docker run -d --name akara-pg \
  -e POSTGRES_PASSWORD=localdev -e POSTGRES_DB=akara -e POSTGRES_USER=akara \
  -p 5432:5432 postgres:16-alpine
```

**C. Postgres installed system-wide**, if you have `sudo` and would rather have
it as a service:

```bash
sudo apt install -y postgresql-16
sudo -u postgres createuser --superuser --pwprompt akara
sudo -u postgres createdb -O akara akara
```

Whichever you pick, the app can't tell the difference — it only ever sees a
`DATABASE_URL`.

```bash
cp .env.example .env.local
```

Edit `.env.local` — for local work you only need these four:

```ini
DATABASE_URL=postgres://akara:localdev@localhost:5432/akara
AUTH_SECRET=<paste: openssl rand -base64 33>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
STORAGE_DIR=./.storage
```

Then:

```bash
npm run db:migrate
ADMIN_EMAIL=sameep@akaralabs.in ADMIN_PASSWORD='pick-something-long' npm run db:seed
npm run preflight       # ← this is the check you asked for
npm run dev
```

`npm run preflight` inspects your actual config and tells you what will break.
Locally you'll see warnings for SMTP, Google and cron — that's expected and
fine. **Anything marked `✗` is a real problem** and the line under it tells you
the fix.

### Walk the flow yourself

With `npm run dev` running, do this in a browser — it takes five minutes and
it's the only way to know the whole thing hangs together:

1. `/print/` — attach any `.stl`, fill in name and email, submit. You get a
   reference like `AKR-123456`.
2. Look at your **terminal**. With no SMTP configured, emails print there
   instead of sending. You'll see the customer confirmation and the studio
   notification. Copy the tracking link out of the log.
3. Open that tracking link in a private window — live status, no login.
4. `/signin` as `sameep@akaralabs.in` with the seed password → `/admin`.
5. Open the request. Confirm **"Geometry read"** shows the bounding box and
   volume, and the quote builder is pre-filled. Send the quote.
6. `/signup` with the *same email you submitted the request with*. The request
   should appear on the dashboard already claimed.
7. Approve the quote. Send a message. Check it appears in `/admin`.
8. `/estimate/` — drop the same STL, confirm the price band and dimensions.

If all eight work locally, the app is fine and everything from here is
infrastructure.

---

## Stage 1 — Things you need before touching the server

Three accounts. Do these in parallel; email is the slowest because DNS has to
propagate.

### 1a. GitHub repository

```bash
cd ~/akaralabs
git remote add origin git@github.com:<you>/akaralabs.git
git push -u origin main
```

The tarball already has a git repo with one commit, so there's nothing to
initialise. **Make it private** — it contains your quote pricing logic, and
`.env` is gitignored but there's no reason to publish the rest.

### 1b. Transactional email

This is the one people skip and then wonder why nothing works. Without it:
verification links, quote emails, tracking links and stage notifications all
fail silently. The app logs them and carries on, so **there is no error to
notice.**

Send transactional mail through a provider, not through your own mailbox — a
mailbox that sends 200 automated emails looks like a compromised account.

**Given your India-residency requirement, this choice matters more than usual.**
A quote email contains the customer's name, company, what they're building and
what you charged. Routing that through a US provider quietly undoes an Indian
server.

| | Notes |
| --- | --- |
| **Zoho** ← best fit for you | Indian company, Indian data centres, and you may already have it for `hello@akaralabs.in`. Keeps the whole mail path in-country with no extra thought. One catch: **check SMTP is included on your plan** — some free tiers are web-access only, in which case these settings won't work at all and you'll need a paid tier. |
| **Amazon SES, Mumbai (`ap-south-1`)** | Cheapest at volume (~$0.10 per 1,000) and stays in India if you create it in the Mumbai region. You start in a *sandbox* that only sends to addresses you've verified; production access takes a day or two to be granted, so start this early. |
| **Resend, Brevo, Mailgun** | Easiest setup and good deliverability, but US/EU infrastructure. Fine if you decide transactional email is out of scope for your residency rule — that's a judgement call, not a technical one. |

Whichever you pick, you need four values and two DNS records:

```ini
SMTP_HOST=<provider's host>
SMTP_PORT=587                 # or 465 with SMTP_SECURE=1
SMTP_USER=<provider gives you this>
SMTP_PASS=<app-specific password or API key, never your mailbox password>
SMTP_FROM=Akara Labs <hello@akaralabs.in>
STUDIO_INBOX=hello@akaralabs.in
```

Then add the **SPF** and **DKIM** records the provider shows you, at
Cloudflare. Skip these and Gmail will put your quote emails in spam, which is
worse than not sending them — you'll think they arrived.

Verify with `npm run preflight`: it opens a real SMTP connection and
authenticates. `✓ SMTP … accepted the connection and credentials` means it
genuinely works, not just that the variables are set.

**Set all of these or none of them.** `SMTP_HOST` with an empty `SMTP_PASS` is
the worst state to be in: it isn't treated as "no email configured", it's a
server that fails to authenticate. Every send then errors with nodemailer's
`Missing credentials for "PLAIN"`, which names no variable, and appears once per
email rather than once at startup.

The app now catches that case and falls back to logging mail with one warning
naming the missing variable, and `preflight` fails on it before you deploy. But
the rule stands: until you have a real password, leave the whole SMTP block
commented out, and mail is logged deliberately rather than lost.

### 1c. Google sign-in

1. [console.cloud.google.com](https://console.cloud.google.com) → create a
   project (call it `akaralabs`).
2. **APIs & Services → OAuth consent screen** → External. Fill in the app name,
   your support email, and the homepage/privacy URLs.

   Testing mode is fine while you're on the subdomain, but only accounts you
   explicitly add as test users can sign in.

   > **Gate on this before cutover:** the consent screen must show
   > **Publishing status: In production**. Leave it in Testing and every
   > customer who clicks "Continue with Google" gets an access-denied screen —
   > and because email/password still works, you may not notice for weeks.
   > Check it again immediately after cutover.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
4. Authorised redirect URIs — add **both**, exactly:

   ```
   https://new.akaralabs.in/api/auth/callback/google
   https://akaralabs.in/api/auth/callback/google
   ```

   Adding both now means the cutover needs no changes here. The path is exact —
   a trailing slash or `http` breaks it with `redirect_uri_mismatch`.
5. Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Also add `http://localhost:3000/api/auth/callback/google` if you want Google
sign-in to work in development.

---

## Stage 2 — The server

### What it actually needs

Measured on a running instance of this exact build, after serving traffic:

| | Resident memory |
| --- | --- |
| Next.js (standalone) | **143 MB** |
| Postgres 16 (7 backends) | **~85 MB** (shared pages double-counted; real figure is lower) |
| Caddy | ~20 MB |
| Docker daemon | ~80 MB |
| Debian, minimal | ~200 MB |
| **Total, idle** | **≈ 550 MB** |

The database itself is **9 MB** with the seed data and a dozen requests in it.
Even years of enquiries won't pass a few hundred MB — this is not a
data-heavy application.

Two things drive the requirement above that idle figure:

**Uploads are buffered in memory, and it costs more than you'd guess.**
Measured on this build: a **60 MB upload swung resident memory from 190 MB to
442 MB** — a ~250 MB spike, roughly **4× the file size**. Next parses the whole
multipart body before handing it to the route, so the file exists in memory
more than once during parsing.

Extrapolated, a 95 MB upload wants ~400 MB of headroom, and two concurrent
uploads want double that. This is the single reason not to run on 1 GB, and the
reason 2 GB is a floor rather than a comfortable target.

If you want to be careful about it: add 2 GB of swap (`fallocate -l 2G
/swapfile`), which turns a would-be OOM kill into a slow request. Cheap
insurance on a small box.

**Builds do not happen here.** GitHub Actions builds the Docker image; the
server only pulls and runs it. So you need no build headroom at all — which is
what makes a small box viable.

| | Verdict |
| --- | --- |
| **1 GB / 1 vCPU** | Runs, but one large upload can push it into swap. Only if the box is free. |
| **2 GB / 1–2 vCPU** | **The honest minimum.** Comfortable for a studio's traffic with room for concurrent uploads. |
| **4 GB / 2 vCPU** | Roomy. Lets you raise Postgres `shared_buffers` and stop thinking about it. |

**Disk — 40 GB.** Roughly: 3 GB OS, 1.5 GB for Docker and two kept images,
under 500 MB for Postgres, and the rest is customer files. At ~20 requests a
month averaging 30 MB of CAD, uploads grow about **7 GB a year**, so 40 GB is
three or four years of headroom. Backups live on the same disk until you copy
them off (Stage 8), so don't cut this fine.

**Bandwidth** is modest — Cloudflare caches every static asset, so your box
mostly serves dynamic pages and file transfers.

### Where to run it — with India data residency

You've said customer data must stay in India. Two things worth separating
before picking a box.

First, separate three things that get conflated:

| | |
| --- | --- |
| **Your policy** | "All Akara Labs customer application data and backups remain in India." That's a decision you make and can state to clients. It's the one this document implements. |
| **Legal requirement** | A narrower set, and not the same thing. Confirm with counsel before treating any of it as settled. |
| **Contractual requirement** | What a specific client makes you promise in writing. Can be stricter than either of the above. |

Write the policy down as policy. Don't write it down as a legal conclusion —
that's how a runbook accidentally becomes a compliance claim you can't support.

**What the law appears to require** *(I am not a lawyer; this is background,
not advice — verify before relying on it)*:

- The **DPDP Act 2023** is more permissive than most people assume. It allows
  personal data to be transferred abroad *except* to countries the government
  puts on a restricted list. It does **not** impose blanket localisation.
- What *is* strict: **RBI's payment-data rules** (payment system data must be
  stored only in India — relevant only once you take payments, and your
  gateway carries most of that burden), **CERT-In's 2022 directions** (logs
  retained in India for 180 days), and sectoral rules for finance, insurance,
  telecom and government work.

**Why you should probably do it anyway.** Your clients send you CAD for
drones, robotics and defence-adjacent hardware. That's a stronger argument for
keeping files in India than DPDP is — it's about client confidentiality and
export sensitivity, and it's the kind of thing a defence-adjacent customer will
ask you about directly. Being able to answer "everything stays in India" is
worth more than the hosting cost difference.

So: keep it in India, but know which parts are legally required and which are
posture, because that tells you where to spend effort.

#### The part people get wrong

Putting the VPS in Mumbai is the easy half. Customer data leaks out of the
country through the *other* services, and that's what an audit would find:

| Component | Holds customer data? | What to do |
| --- | --- | --- |
| **The server** | Yes — everything | India region. See the table below. |
| **Database** | Yes | Same box. Never a US-hosted managed Postgres. |
| **Uploaded CAD** | Yes, the sensitive part | Same box's disk. If you move to object storage later, use an India region. |
| **Backups** | **Yes — the whole database** | Easily missed. Backblaze B2 has no India region; use AWS S3 Mumbai (`ap-south-1`), or another Indian provider's object store. |
| **Transactional email** | Yes — names, addresses, quote values in the body | **Zoho** is Indian-owned with Indian data centres, which makes this simple. AWS SES also runs in Mumbai. Resend and most US providers do not. |
| **Cloudflare proxy** | In transit | Cloudflare terminates TLS at the nearest edge, which is in India for Indian visitors — but it's a US company and traffic can route elsewhere. Cached content is public marketing pages only. If you need strictness here, grey-cloud the record (DNS only) and let Caddy terminate TLS on your box; you lose the CDN and WAF. |
| **Google sign-in** | Email address only | Google holds this regardless. Offering email/password as well means no customer is *forced* through it. |
| **GitHub Actions** | **No** | It builds a Docker image from your source. No customer data touches it. Fine anywhere. |
| **Error monitoring** | Yes, if you add it | Sentry has an EU region but not India. Prefer self-hosted, or don't add one yet. |

The email row is the one that catches people. A quote email contains the
customer's name, company, what they're building and what you charged — sending
that through a US provider undoes the Mumbai VPS.

#### Options

Approximate monthly cost. **Verify at signup** — pricing moves.

| Option | Cost | Region | The honest trade |
| --- | --- | --- | --- |
| **DigitalOcean, Bangalore** | **$12** (₹1,050) for 2 GB / 1 vCPU / 50 GB / 2 TB transfer. $24 (₹2,100) for 4 GB / 2 vCPU / 80 GB | Bangalore | The boring correct answer. Good docs, reliable, one-click backups, and the 2 GB tier is exactly what this needs. Start here unless you have a reason not to. |
| **AWS Lightsail, Mumbai** | ~$10–20 | Mumbai | Similar to DigitalOcean. Worth it if you want S3 Mumbai for backups in the same account and bill. |
| **Oracle Cloud Always Free** | **₹0** | Mumbai, Hyderabad | Generous Arm-based free tier that doesn't expire. Two real catches: Arm capacity in Indian regions is frequently unavailable to free accounts, and you'd need a multi-arch Docker build (`platforms: linux/amd64,linux/arm64`). Worth ten minutes to try — if you get an instance, it's free forever. |
| **Bluehost NVMe 4** ← what you bought | **₹396/mo** promo (₹9,504 for 24 months upfront), **₹887/mo** on renewal. 2 vCPU / 4 GB DDR5 / 100 GB NVMe / unmetered | **Mumbai** — selectable at checkout, though their VPS page doesn't list it | Best spec-per-rupee of anything here, and the platform fits: full root, cPanel optional rather than forced, plain-OS images, Portainer offered as a one-click app. One real gap: **no VM snapshots at all**, so Stage 8's backup is your only recovery path. |
| **Hostinger KVM 1** | **₹599/mo** promo, **₹999/mo** on renewal. Promo needs **24 months paid upfront** — ₹14,376, or ₹16,964 with GST. 1 vCPU / 4 GB / 50 GB NVMe / 4 TB | India | Cheapest India option by a distance, and the spec beats what this app needs. Full root, dedicated IPv4, Docker template, free weekly backups and snapshots, 30-day refund. The cost is lock-in: two years upfront on a provider you haven't run yet, and renewal is 67% higher. See the checks below before paying. |
| **Hostinger KVM 2** | **₹799/mo** promo, **₹1,199/mo** renewal. 2 vCPU / 8 GB / 100 GB / 8 TB | India | ₹200/mo more than KVM 1 at both promo and renewal, for double the cores and disk. Only worth it for the 100 GB — at ~7 GB of CAD a year, 50 GB is already three or four years. |
| **E2E Networks** | ~$32/mo (~₹2,800) for their entry CPU instance — 2 vCPU / 6 GB | Noida/NCR, Chennai | NSE-listed Indian company, the strongest answer for a defence-adjacent client. But there is **no small SKU** — their entry point is roughly 3× DigitalOcean for capacity you won't use. Revisit when a client's contract demands an Indian vendor, not before. |
| **Other Indian providers** — CtrlS, Zoho's own cloud | varies, INR-billed | Mumbai, Chennai, Hyderabad | Same story as E2E. Check you get full root and a dedicated public IP — not shared hosting. |
| **Hetzner / European VPS** | ~₹400–550 | Germany | Half the price, but **rules itself out** on your residency requirement. Noted so you don't rediscover it and wonder. |

#### If you're on Bluehost

The platform suits this app well. Full root, cPanel is a paid add-on rather than
a forced install (so nothing is squatting on 80/443), plain-OS Ubuntu images, and
Portainer shipped as a one-click template — which is a hoster telling you Docker
is welcome. Their acceptable-use policy restricts nothing about containers or
long-running daemons.

**On the region:** their VPS page lists five data centres — USA (Virginia), USA
(Arizona), London, Toronto, Amsterdam — and no Indian location, on the Indian
storefront as well as the US one. **That list is out of date. Mumbai is
selectable at checkout**, under Location in the purchase flow, and a Mumbai
instance shows an apt mirror of `vps-oci-ap-mumbai-1-new.clouds.archive.ubuntu.com`
— `oci` plus Oracle's own identifier for its Mumbai region, consistent with
Oracle's public statement that Newfold Digital moved its hosting onto Oracle
Cloud.

So pick Mumbai at checkout and the metal is in India. Don't take the marketing
page's silence as an answer either way — confirm it from the machine:

```bash
bash scripts/check-server.sh
```

That reads the region from the cloud's own metadata service and says plainly
whether it's in India, alongside the other things a marketing page can't tell
you: whether 80/443 are free, whether it can reach ghcr.io to pull the image, and
whether outbound 587 works.

Two things to handle on Bluehost specifically:

- **There are no VM snapshots.** Their user agreement puts backups entirely on
  you, in capitals, and no snapshot feature is documented anywhere. Stage 8's
  daily dump and its off-box copy stop being good practice and become the only
  thing between you and total loss. Do that stage on day one, not later.
- **Test outbound SMTP on 587 before trusting email.** `check-server.sh` does
  this. On OCI-backed infrastructure port 25 is very likely blocked — fine, this
  app doesn't use it — but 587 must work or every quote and verification email
  fails.

And a point no command settles: since September 2025 the contract is with
**Bluehost Inc., Florida**, whose terms say the service is "controlled and
operated by us from our offices within the United States." With the disk in
Mumbai you have the substance of residency, but not a written commitment to it.
For a defence-adjacent client who asks formally, that's the gap the Indian-entity
providers in the table above close. Nothing to act on today — worth knowing
before someone asks.

#### If you're looking at Hostinger — check these five things first

Hostinger KVM works for this app on paper, and the price is genuinely hard to
argue with. The risk isn't the spec, it's that the cheap price is 24 months
prepaid. So spend the first 30 days proving it, inside the refund window:

1. **India must appear, in stock, in the location dropdown for your tier.**
   Hostinger's help centre lists India as a VPS location, but publishes it as
   just "India" with no city for VPS (Mumbai is named officially only for their
   Agency product), and adds "data center availability is subject to change
   without prior notice." Check the dropdown *before* paying, not after.
2. **Outbound SMTP on port 587 must not be blocked.** Plenty of budget hosts
   block it to fight spam. If it's blocked, every quote and verification email
   silently fails. Test it the moment you have the box:
   `nc -zv smtp.zoho.in 587`.
3. **A GST invoice with your GSTIN**, if you want to claim the input credit.
   Listed prices exclude GST; confirm they'll put your GSTIN on the invoice.
4. **Snapshot and restore once, on day one.** Their backups are *weekly*, which
   is not enough on its own — Stage 8's daily dump is what you actually rely on.
   Prove their restore works anyway, before you need it.
5. **Then run Stage 5 in full.** If anything in it fails, refund inside 30 days
   and move to DigitalOcean having lost nothing.

Pick a plain Ubuntu 24.04 template rather than their one-click Docker image, and
install Docker from Docker's own repository per Stage 2a — you want the same
Docker version the compose file is tested against, not a vendor's snapshot.

#### What I'd do

**If you want the cheapest correct thing and don't mind the commitment:
Hostinger KVM 1, ₹599/mo on the 24-month term.** 4 GB and 50 GB is more than
this app needs, the region is right, and the 30-day refund makes the prepay
survivable — provided you actually use those 30 days on the checks above.

**If you'd rather not prepay two years: DigitalOcean Bangalore, 2 GB,
$12/month.** Roughly double Hostinger's promo price and it bills monthly with no
lock-in, better documentation, and in-place resize on a reboot. This is the
low-regret option, and the one to move to if Hostinger disappoints.

**Try Oracle's free tier first if you have an hour** — if an Arm instance is
available in Mumbai or Hyderabad, you get four cores and far more RAM than you
need for nothing. Set the CI build to multi-arch and it works identically. If
capacity isn't there, you've lost an hour and you fall back to DigitalOcean.

**Move to an Indian provider when a client asks.** The day someone
defence-adjacent asks where their files sit, "an Indian company's data centre
in Chennai, and here's the GST invoice" is a better answer than "DigitalOcean,
which is American, but the servers are in Bangalore." Migration is a
`pg_dump`, a volume tarball and a DNS change — an evening's work, not a
rebuild. Don't pay for that story before someone wants it.

Whichever you pick, budget roughly:

| | Monthly |
| --- | --- |
| Server (2 GB, India) | ₹0–1,050 |
| Domain | ~₹100 amortised |
| Transactional email | ₹0 on most free tiers at your volume |
| Backups to S3 Mumbai | ~₹50 for a few GB |
| Cloudflare | ₹0 |
| **Total** | **₹150–1,200/month** |

### 2a. Docker

Docker publishes **separate repositories for Debian and Ubuntu**, and the suites
don't overlap — there is no `noble` under `linux/debian`. Hardcoding either one
gives you a 404 and `does not have a Release file` on the other. So derive both
the repository and the codename from the machine:

```bash
sudo apt update && sudo apt install -y ca-certificates curl gnupg

# Which Docker repo does this machine need?
. /etc/os-release
case "$ID" in
  ubuntu)          DOCKER_REPO=ubuntu ;;
  debian|raspbian) DOCKER_REPO=debian ;;
  *)               DOCKER_REPO=${ID_LIKE%% *} ;;   # Mint, Pop!_OS, etc.
esac
# Derivatives set VERSION_CODENAME to their own name, which Docker doesn't
# publish; UBUNTU_CODENAME is the upstream one and is what we want when present.
DOCKER_SUITE=${UBUNTU_CODENAME:-$VERSION_CODENAME}
echo "==> $DOCKER_REPO / $DOCKER_SUITE / $(dpkg --print-architecture)"

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL "https://download.docker.com/linux/$DOCKER_REPO/gpg" \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/$DOCKER_REPO $DOCKER_SUITE stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update && sudo apt install -y \
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER   # skip this if you are root — root already has access
```

The `echo` line prints what it decided before touching apt. On Ubuntu 24.04 it
should say `ubuntu / noble / amd64` (or `arm64`). If it says `debian` on an
Ubuntu box, stop — something is wrong with `/etc/os-release`.

**If you already ran a version of this that failed**, clear the bad entry first
or apt will keep erroring on it:

```bash
sudo rm -f /etc/apt/sources.list.d/docker.list /etc/apt/keyrings/docker.gpg
```

**Log out and back in**, then confirm:

```bash
docker --version            # Docker Engine
docker compose version      # Compose — must be v2 or newer
docker run --rm hello-world # proves the daemon works and can pull
```

The third line is the one that matters. The first two only prove the CLI binary
exists — they answer without ever contacting the daemon, so an install where
`dockerd` isn't running still passes both and then fails on the first real
command:

```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock.
Is the docker daemon running?
```

That is common on images where Docker came preinstalled: the packages are there,
the service was never enabled. Start it and make it survive a reboot:

```bash
sudo systemctl enable --now docker
sudo systemctl status docker --no-pager | head -5
docker run --rm hello-world
```

If it still won't start, read the reason rather than guessing:

```bash
sudo systemctl status containerd --no-pager | head -5   # docker needs this first
sudo journalctl -u docker -n 50 --no-pager
```

Two causes worth knowing on a minimized cloud image. `iptables` missing —
`dockerd` can't set up networking without it, so `sudo apt install -y iptables`
and start again. Or the unit is masked, which `systemctl status` shows as
`Loaded: masked`; `sudo systemctl unmask docker` then re-enable.

Compose moved past v2 a while ago and the numbers now run well ahead of what
most tutorials show — Engine 29.x with Compose v5.x is current as of writing.
**A version number higher than you expected is not a problem.** What matters is
that it's the `docker compose` subcommand rather than the old standalone
`docker-compose` binary, and that it came from Docker's own repository — the
package versions will look like `5:29.8.0-1~ubuntu.24.04~noble`, with the
distro and codename in them.

This `docker-compose.yml` deliberately has no top-level `version:` key. That
field has been ignored since Compose v2 and produces a warning in newer
versions, so there's nothing here for a major-version bump to break.

Some providers ship Docker preinstalled on their plain-OS images — Bluehost
does, which is consistent with them offering Portainer as a one-click app. If
`apt install` reports everything is "already the newest version", that's why,
and it's fine as long as the versions carry that Docker-repo suffix. Running
the block anyway is harmless and confirms where the packages came from.

Use Docker's own repository, not `apt install docker.io` — the distro package
often ships an old Compose that doesn't understand this `docker-compose.yml`.

> `sudo apt autoremove` may offer to remove `bridge-utils`, `dnsmasq-base`,
> `ubuntu-fan`, `dns-root-data` and `netcat-openbsd` after this. **None of them
> are needed by modern Docker** — it manages bridges through netlink directly —
> so letting them go is safe. `netcat-openbsd` is only a convenience for port
> testing; `scripts/check-server.sh` uses bash's own `/dev/tcp` and doesn't
> need it.

#### Check your architecture now, not at Stage 6

The repo isn't on the server yet at this point — that's 2d — so copy just this
one script across **from your laptop**:

```bash
scp akaralabs/scripts/check-server.sh root@YOUR.SERVER.IP:~/
```

then, on the server:

```bash
bash ~/check-server.sh           # architecture, region, ports, egress, Docker
```

Or just the architecture, if you only want that one answer:

```bash
dpkg --print-architecture
```

If that says **`arm64`** — which it will on Oracle Cloud's Ampere A1 free tier,
and on AWS Graviton — the CI build must produce an Arm image or your first
deploy pulls an image the machine cannot run. It's a one-line change, but find
it here rather than debugging a failed deploy:

> GitHub → your repo → Settings → Secrets and variables → Actions → Variables →
> New variable: `BUILD_PLATFORMS` = `linux/amd64,linux/arm64`

The workflow already reads that variable and defaults to `linux/amd64` alone.
Building both roughly doubles CI time, which is why it isn't the default.

### 2b. Stop logging in as root with a password

Do this before anything else that takes time. A fresh VPS with a public IP gets
SSH brute-force attempts within minutes of coming up — not eventually, within
minutes — and `root` with a password is the one combination those attempts are
actually built to beat. Everything else in this runbook assumes the box is
yours; this is the step that keeps it that way.

**From your laptop**, create a key and install it:

```bash
ssh-keygen -t ed25519 -C 'akara-admin' -f ~/.ssh/akara_admin -N ''
ssh-copy-id -i ~/.ssh/akara_admin.pub root@YOUR.SERVER.IP
```

Then prove it works *before* you disable anything:

```bash
ssh -i ~/.ssh/akara_admin root@YOUR.SERVER.IP 'echo key login works'
```

Only once that prints, turn off password logins **on the server**:

```bash
sudo tee /etc/ssh/sshd_config.d/00-akara-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sudo sshd -t && sudo systemctl reload ssh
```

Two details that matter, because getting either wrong means you *think* you
hardened the box and didn't:

- **Use a drop-in, not `sed` on `/etc/ssh/sshd_config`.** Ubuntu includes
  `/etc/ssh/sshd_config.d/*.conf` at the *start* of the config, and sshd takes
  "the first obtained value" for each keyword. Cloud images routinely ship a
  `50-cloud-init.conf` containing `PasswordAuthentication yes`, which therefore
  beats anything you edit into the main file. Naming ours `00-` sorts it ahead
  of that. Check what else is there: `ls /etc/ssh/sshd_config.d/`.
- **`KbdInteractiveAuthentication no` as well.** Turning off
  `PasswordAuthentication` alone can still leave a keyboard-interactive path
  that prompts for the same password.

Then verify it actually took, rather than trusting the reload:

```bash
sudo sshd -T | grep -E '^(passwordauthentication|permitrootlogin|kbdinteractive)'
```

That prints the *effective* configuration after all includes are resolved. It
should say `passwordauthentication no`.

**Keep your current session open** and confirm from a second terminal that you
can still get in. If you can't, the open session is how you fix it. Locking
yourself out of a server you've prepaid for two years is a bad afternoon.

`PermitRootLogin prohibit-password` keeps root reachable by key, which the rest
of this stage needs. Stage 6a creates a separate unprivileged `deploy` user for
CI and switches this to `PermitRootLogin no` — that's the end state, this is the
floor.

Worth adding while you're here:

```bash
sudo apt install -y fail2ban        # bans IPs that keep guessing; sane defaults
```

### 2c. Firewall

For the first deploy, open the three you need:

```bash
sudo apt install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80,443/tcp
sudo ufw --force enable
sudo ufw status verbose
```

**Do not open 5432.** Postgres talks to the app over Docker's internal network
and must not be reachable from outside the box.

#### Then lock the origin to Cloudflare — after cutover

Open `80,443/tcp` means anyone who discovers your server's IP can hit the app
directly, bypassing Cloudflare's WAF, rate limiting and bot protection
entirely. Origin IPs are not secret: they leak through historical DNS records,
certificate transparency logs and outbound connections.

There's a script for it:

```bash
sudo ./scripts/lock-origin.sh --dry-run   # shows the rules first
sudo ./scripts/lock-origin.sh
```

It fetches Cloudflare's published ranges, sanity-checks the response (an error
page must never become a firewall rule), and allows 80/443 only from those
ranges.

> **It will refuse to run until you've dealt with certificates**, and that
> refusal is the point. Caddy renews via an HTTP-01 challenge, which needs
> port 80 reachable by Let's Encrypt's validators — and those are not
> Cloudflare IPs. Lock the origin down without changing anything else and your
> certificate expires *silently*, about 60 days later.
>
> The fix is a **Cloudflare Origin CA certificate**: free, valid 15 years,
> needs no renewal, trusted by Cloudflare in Full (strict). Create it under
> SSL/TLS → Origin Server, save the pair into `docker/origin/`, mount it, and
> uncomment the `tls` line in `docker/Caddyfile` — the instructions are in
> that file.

Do this *after* the apex cutover, not before — you want ordinary ACME working
while you're still setting things up.

Two more worth having, both free:

- **Authenticated Origin Pulls** (SSL/TLS → Origin Server) makes Cloudflare
  present a client certificate your origin can require. Survives an IP-range
  change, unlike a firewall allowlist.
- **Restrict SSH to your own IP** if you have a static one:
  `sudo ufw allow from YOUR.IP to any port 22 proto tcp` and remove the
  blanket rule.

### 2d. Files and secrets

```bash
mkdir -p ~/akaralabs/backups && cd ~/akaralabs
```

Copy three files up from your laptop:

```bash
# from your laptop
scp docker-compose.yml .env.example you@server:~/akaralabs/
ssh you@server 'mkdir -p ~/akaralabs/docker'
scp docker/Caddyfile you@server:~/akaralabs/docker/
```

You do **not** copy the source code — the server only runs the built image from
GHCR.

Now on the server:

```bash
cp .env.example .env
chmod 600 .env          # it holds your database password and API keys
openssl rand -base64 33 # AUTH_SECRET
openssl rand -hex 24    # POSTGRES_PASSWORD  <- hex, NOT base64. See below.
openssl rand -hex 24    # CRON_SECRET
nano .env
```

Fill it in for the **subdomain** first:

```ini
POSTGRES_PASSWORD=<the hex you generated>
DATABASE_URL=postgres://akara:<same password>@db:5432/akara
AUTH_SECRET=<the other base64>

SITE_URL=https://new.akaralabs.in
NEXT_PUBLIC_SITE_URL=https://new.akaralabs.in
NEXTAUTH_URL=https://new.akaralabs.in
SITE_DOMAIN=new.akaralabs.in
ACME_EMAIL=hello@akaralabs.in

IMAGE=ghcr.io/<your-username-lowercase>/akaralabs:latest

> **Use hex for `POSTGRES_PASSWORD`, not base64.** `openssl rand -base64` emits
> `/` along with `+` and `=`, and the password goes straight into a URL:
>
> ```
> DATABASE_URL=postgres://akara:Ab3/xY9zQ1w==@db:5432/akara
> ```
>
> A `/` ends the authority section, so that is not a URL with an awkward
> password in it — it is a different URL. The driver rejects it with the two
> least helpful words available:
>
> ```
> web-1  | ==> applying migrations
> web-1  | migration failed: Invalid URL
> ```
>
> About 40% of base64 passwords contain a `/`, so this is a coin-flip, not an
> edge case. `openssl rand -hex 24` is 96 bits of entropy and URL-safe by
> construction. The app now detects this case and names the offending character
> instead of printing `Invalid URL`, but the generator is the actual fix.
>
> The password must be **identical** in `POSTGRES_PASSWORD` and inside
> `DATABASE_URL`. Postgres takes its password from the first on the very first
> boot only; changing it later in `.env` does not change the database.
>
> That last sentence is the one that catches people, so to be explicit about
> what it means in practice. If you start the stack, then edit
> `POSTGRES_PASSWORD`, then restart, you get:
>
> ```
> web-1  | migration failed: password authentication failed for user "akara"
> ```
>
> The app is using the new password; the database still has the old one, stored
> in the `akaralabs_pgdata` volume when it initialised. Editing `.env` cannot
> reach into an already-initialised data directory. Either put the original
> password back, or — while there is no data worth keeping — throw the volume
> away and let it initialise again:
>
> ```bash
> docker compose down
> docker volume rm akaralabs_pgdata
> docker compose up -d
> ```
>
> **`docker compose down` alone does not do this.** It removes containers and
> keeps volumes, which is what you want every other day of the year and exactly
> not what you want here.

GOOGLE_CLIENT_ID=<from stage 1c>
GOOGLE_CLIENT_SECRET=<from stage 1c>
ADMIN_EMAILS=sameep@akaralabs.in

SMTP_HOST=<from stage 1b>
SMTP_PORT=587
SMTP_USER=<...>
SMTP_PASS=<...>
SMTP_FROM=Akara Labs <hello@akaralabs.in>
STUDIO_INBOX=hello@akaralabs.in

CONTACT_EMAIL=hello@akaralabs.in
CONTACT_WHATSAPP=917082089049
CRON_SECRET=<the hex you generated>
```

Three things worth getting right:

- `DATABASE_URL`'s host is **`db`**, not `localhost` — that's the Compose
  service name on the internal network.
- The password appears twice and they must match, or Postgres initialises with
  one and the app connects with the other.
- `NEXT_PUBLIC_SITE_URL` is **baked into the JavaScript bundle at build time**,
  not read at runtime. So GitHub Actions needs it too (Stage 6), and it's why
  the cutover in Stage 7 requires a rebuild rather than just an env change.

---

## Stage 3 — DNS for the subdomain

At Cloudflare, DNS → Records:

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| A | `new` | your.server.ip | **Proxied** (orange) |

Then **SSL/TLS → Overview → Full (strict)**.

This setting is the one that catches everyone. Caddy holds a real Let's Encrypt
certificate. On **Flexible**, Cloudflare talks to your server over plain HTTP
while telling the browser it's HTTPS — Caddy redirects to HTTPS, Cloudflare
sends the plain request again, and you get `ERR_TOO_MANY_REDIRECTS`. Full
(strict) is both correct and secure.

Leave `akaralabs.in` itself pointing at Cloudflare Pages for now. Nothing about
the live site changes yet.

Check it resolves before continuing:

```bash
dig +short new.akaralabs.in
```

---

## Stage 4 — First deploy, by hand

Do the first one manually. When it works you'll know the server is fine, so any
later CI failure is CI's fault.

### 4a. Let the server pull from GHCR

If your repo is private, the image is private too. On the server:

```bash
# On GitHub: Settings → Developer settings → Personal access tokens →
# Tokens (classic) → Generate, with the single scope: read:packages
echo '<your-token>' | docker login ghcr.io -u <your-github-username> --password-stdin
```

Skip this if you make the *package* public (Package settings → Change
visibility), which is fine — the image contains no secrets.

### 4b. Build and push an image

Easiest is to let GitHub build it. Push to `main`, then **Actions → Deploy**.
The `check` and `build` jobs will run; `deploy` will fail because you haven't
added the SSH secrets yet. That's expected — you just want the image.

Or build on the server directly (needs the source, so clone it):

```bash
git clone https://github.com/<you>/akaralabs.git /tmp/akara-src
cd /tmp/akara-src

# Registry names must be lowercase — including your username. GitHub keeps the
# capitalisation you signed up with, so "SameepRohilla" is a valid GitHub name
# and an invalid image name:
#   ERROR: invalid tag "ghcr.io/SameepRohilla/akaralabs:latest":
#          repository name must be lowercase
# Let the shell do it rather than typing it out:
GH_USER=$(echo "<your-github-username>" | tr '[:upper:]' '[:lower:]')

docker build -t "ghcr.io/$GH_USER/akaralabs:latest" \
  --build-arg NEXT_PUBLIC_SITE_URL=https://new.akaralabs.in .
cd ~/akaralabs && rm -rf /tmp/akara-src
```

Use that same lowercase form in `.env` for `IMAGE=`, and everywhere else a
registry path appears. GHCR itself resolves the owner case-insensitively, so
the lowercase name reaches the right account — it's only the local reference
parser that refuses the capitals.

### 4c. Bring it up

```bash
cd ~/akaralabs
docker compose up -d
docker compose logs -f web
```

You should see, in this order:

```
==> applying migrations
    waiting for database… (1)
migrations applied
==> starting Akara Labs
  ▲ Next.js 15.5.25
  ✓ Ready in 250ms
```

Migrations run in the container entrypoint, so the schema is always in step
with the image about to serve traffic. Drizzle records what it applied, so
restarts and rollbacks are no-ops rather than repeated work.

### 4d. Run pre-flight against the real thing

```bash
docker compose exec web node ops/preflight.cjs
```

Run it from *inside* the container: that's the only place `db` resolves and the
real `.env` is loaded, so it checks the config that will actually serve
traffic.

Everything should be `✓` now except possibly Google (which asks you to verify
the redirect URI by hand — there's no way to check that from here).

**If `web` is restarting**, `exec` can't get in and says so:

```
Error response from daemon: Container … is restarting, wait until the
container is running
```

Which is exactly when you most want to run the check. Start a throwaway
container from the same image instead — same environment, same network, but it
doesn't run the entrypoint that's crashing:

```bash
docker compose run --rm --no-deps --entrypoint node web ops/preflight.cjs
```

`--no-deps` skips starting the other services, `--entrypoint node` bypasses the
migration step, and `--rm` cleans up after itself. The same trick opens a shell
in a container you otherwise can't reach:

```bash
docker compose run --rm --no-deps --entrypoint sh web
```

### 4e. Cloudflare settings — do this once, outside the build

Nothing here is part of building or deploying an image. It is two toggles in
the Cloudflare dashboard plus one check, done once, any time after the site is
answering on the subdomain. Re-check it if the site ever behaves differently in
production than it does locally.

#### Turn these off

Two Cloudflare features modify the HTML your origin sends, *after* React has
rendered it. React then hydrates against markup that doesn't match what it
produced, and you get a hydration error — which in a React app can degrade
anything from one component to the whole page's interactivity.

| Feature | Where | Why |
| --- | --- | --- |
| **Email Address Obfuscation** | Scrape Shield | Rewrites every `mailto:` into a span with `data-cfemail`. The footer has one, so this hits every page. |
| **Rocket Loader** | Speed → Optimization | Defers and rewrites script execution. Reliably breaks React apps. |

Neither does much for a site like this, and both trade a real bug for a
marginal benefit.

#### Then check it took

```bash
curl -s https://new.akaralabs.in/ | grep -o '/cdn-cgi/[a-z/._-]*' | sort -u
```

A clean run prints **nothing at all**. Anything it does print is Cloudflare
injecting into your markup: `/cdn-cgi/l/email-protection` is Email Obfuscation,
`rocket-loader.min.js` is Rocket Loader, and `/cdn-cgi/scripts/…/invisible.js`
is Bot Fight Mode's injection (Security → Bots).

After changing a Cloudflare setting, purge the cache before judging the result
— otherwise you are looking at the response from before you changed it:

> Cloudflare → Caching → Configuration → **Purge Everything**

### 4f. Create your admin account

If `ADMIN_EMAILS` contains your address, just sign in with Google and you're
admin automatically. Otherwise seed one:

```bash
docker compose exec web sh -c \
  'ADMIN_EMAIL=sameep@akaralabs.in ADMIN_PASSWORD="something-long" node ops/seed.cjs'
```

The seed is idempotent and also adds your four machines, seven spools, and
three journal articles so the site isn't empty. Edit or delete those from
`/admin/workshop` and `/admin/articles` once you're in.

---

## Stage 5 — Verify on the real server

This is the part that makes the subdomain worth having. Do all of it.

### Infrastructure

```bash
curl -I https://new.akaralabs.in                    # 200, valid cert
curl -s https://new.akaralabs.in/api/health         # {"ok":true,"db":"up","ms":…}
docker compose ps                                   # web healthy, db healthy
```

### Every marketing page still looks right

Open each and compare against the live site side by side:

`/` · `/work/` · `/about/` · `/materials/` · `/faq/` · `/start/` · `/print/`

Specifically check: the **3D hero spins** on the home page, the **EN/हिन्दी
toggle** switches all copy, the **light/dark toggle** works, and the
**hamburger menu** opens on a phone. These are the parts that came across from
the old site and would be the first casualties of a bad port.

### The flow, with real email this time

1. Submit a real request on `/print/` with a genuine STL and **your own
   email**.
2. **Confirm the email actually arrives.** Check spam. If it's in spam, your
   SPF/DKIM records aren't right — fix that before launch.
3. Open the tracking link from the email in a private window.
4. Sign in to `/admin` **with Google** — this is the first real test of the
   OAuth config.
5. Quote it. Confirm the quote email arrives and the figures match.
6. Approve it from the customer side. Confirm the studio notification arrives.
7. Message both ways.
8. Move it through the stages. Confirm each stage email arrives.

### Uploads — test the size that matters

Take a genuinely large file, 50 MB or more, and upload it to a request from the
customer dashboard. This exercises Caddy's `request_body max_size`, the
container's disk, and the progress bar all at once. It's also the thing that
would be silently broken on serverless.

```bash
# then confirm it's actually on disk
docker compose exec web ls -la /data/storage/requests
```

### Nothing private is cached

This is the one that would be genuinely dangerous to get wrong — a cached
dashboard means one customer's page served to another.

```bash
for p in / /work/ /dashboard /admin /api/health; do
  echo "--- $p"
  curl -sI "https://new.akaralabs.in$p" | head -1
  curl -sI "https://new.akaralabs.in$p" | grep -iE 'cf-cache-status|cache-control'
done
```

Note the added `head -1`. Without the status line this check is easy to
misread: **`curl -I` does not follow redirects, and `/dashboard` and `/admin`
answer an unauthenticated request with a 307 to `/signin`.** So what you are
looking at there is the redirect, not the page — and Next.js sends no
`Cache-Control` on a redirect, which looks alarming and isn't:

```
--- /dashboard
HTTP/2 307
location: /signin?next=%2Fdashboard
cf-cache-status: DYNAMIC
```

What you want:

| Path | Expect |
| --- | --- |
| `/`, `/work/` | `DYNAMIC`. These pages read the session to render the nav, so Next marks them `private, no-store` and Cloudflare correctly declines to cache them. |
| `/_next/static/*`, `/assets/*` | `HIT`, long `max-age` — these are content-hashed, so caching them hard is the point |
| `/dashboard`, `/admin` | `DYNAMIC`, and a 307 when signed out |
| `/api/*` | `DYNAMIC`, `no-store` |

**`cf-cache-status: DYNAMIC` on every path is the result that matters.** It
means Cloudflare cached none of it. `HIT` on a private path is the failure, and
the usual cause is a "Cache Everything" rule someone added.

#### Then check it signed in, because that is the case that counts

The curl above is anonymous, so it never sees a dashboard at all. The response
worth checking is the real one:

1. Sign in, open the dashboard.
2. DevTools → Network → click the `dashboard` document.
3. Response headers: `cf-cache-status` must be `DYNAMIC` or `BYPASS`, and
   `cache-control` must contain `no-store`.

#### If `/dashboard` shows no `Cache-Control` at all

The Caddyfile sets `no-store` on `/dashboard*`, `/admin*`, `/api/*`, `/track/*`,
`/signin*` and `/signup*` as a second line of defence, and that applies to
redirects too. If it is missing, your server's Caddyfile is older than the repo's:

```bash
grep -c '@private' ~/akaralabs/docker/Caddyfile   # 1 = current, 0 = stale
```

If it is 0, see the note below — this is a trap worth understanding.

> **Rebuilding the image does not update `docker-compose.yml` or the Caddyfile.**
> Those are read from `~/akaralabs/` on the server, not from inside the image,
> and neither a manual `docker build` nor the CI deploy touches them. CI pulls a
> new image and restarts `web` — that is all it does by design, because
> rewriting compose files under a running stack is how you lose a volume.
>
> So after any change to `docker-compose.yml`, `docker/Caddyfile` or
> `.env.example`, copy them across by hand. Note this clones fresh — the deploy
> command deletes `/tmp/akara-src` on its last line, so it is never still there
> when you want it:
>
> ```bash
> # on the SERVER
> rm -rf /tmp/akara-cfg
> git clone --depth 1 https://github.com/SameepRohilla/akaralabs.git /tmp/akara-cfg
>
> cp /tmp/akara-cfg/docker-compose.yml ~/akaralabs/
> cp /tmp/akara-cfg/docker/Caddyfile   ~/akaralabs/docker/
> rm -rf /tmp/akara-cfg
>
> cd ~/akaralabs
> docker compose config >/dev/null            # compose file still valid?
> docker compose up -d                        # recreates only what changed
> docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
> ```
>
> `.env` is deliberately not in that list: it holds your secrets and is not in
> the repo. If `.env.example` gained a variable, add it to `.env` by hand.
>
> Check the commit range when you pull: if it touched `docker/` or
> `docker-compose.yml`, this step applies.

### Access control

Sign in as a normal customer (make a second account) and try:

- `https://new.akaralabs.in/admin` → should bounce you to `/dashboard`
- `https://new.akaralabs.in/dashboard/requests/AKR-<someone-else's>` → 404
- Sign out entirely and hit `/dashboard` → should send you to `/signin`

**Then test file access directly**, which is the surface that matters most for
an application holding client CAD. Take a file ID out of your own request page
and try to fetch it as somebody else:

```bash
# signed out entirely
curl -s -o /dev/null -w '%{http_code}\n' https://new.akaralabs.in/api/files/<id>
# with a wrong tracking token
curl -s -o /dev/null -w '%{http_code}\n' "https://new.akaralabs.in/api/files/<id>?t=WRONGTOKEN"
```

Both must be `401`. Verified on this build: `401` unauthenticated, `401` with a
wrong token even at the correct length (the comparison is timing-safe), `200`
only with the real token, `404` for an unknown ID. Re-check it on your own
deployment anyway — that's the point of a staging host.

### Search engines must not index the subdomain

This is handled for you, but verify it:

```bash
curl -s https://new.akaralabs.in/robots.txt
```

You should get exactly:

```
User-Agent: *
Disallow: /
```

`robots.txt` is generated from `NEXT_PUBLIC_SITE_URL`: anything that isn't
`akaralabs.in` disallows everything, so a staging host can never compete with
the real domain in search. After the cutover in Stage 7 the same file will
allow crawling and point at the sitemap — no manual step, and nothing to
remember to undo.

---

## Stage 6 — Wire up automatic deploys

Now that manual works, make it automatic.

### 6a. A dedicated deploy user and key

Every command below is marked with **where to run it**. Two machines are
involved and the steps alternate between them, which is the easiest thing to
lose track of here.

- **SERVER** — `ssh root@129.121.134.101`
- **LAPTOP** — your own machine, the one with the git clone on it

---

#### Step 1 — make the user  ·  on the **SERVER**

Don't give CI your own login. Make a user that can do exactly one job:

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy

# Create it as root, then hand it over. Doing the mkdir as `deploy` looks
# tidier but breaks the moment the directory already exists owned by root —
# from an earlier attempt, say — because `sudo -u deploy chmod` then fails with
# "Operation not permitted". Setting the ownership explicitly works either way.
sudo mkdir -p /home/deploy/.ssh
sudo chown -R deploy:deploy /home/deploy
sudo chmod 700 /home/deploy/.ssh
```

Check it landed right — SSH silently ignores a key directory with loose
permissions, which is a miserable thing to debug later:

```bash
sudo ls -ld /home/deploy /home/deploy/.ssh
# drwxr-xr-x  … deploy deploy … /home/deploy
# drwx------  … deploy deploy … /home/deploy/.ssh
```

#### Step 2 — move the stack into its home  ·  on the **SERVER**

You are currently running as root, so the stack is at `/root/akaralabs`.

```bash
sudo cp -r /root/akaralabs /home/deploy/akaralabs
sudo chown -R deploy:deploy /home/deploy/akaralabs

# prove it before deleting anything: the containers must still be listed,
# with the same volumes
sudo -u deploy sh -c 'cd ~/akaralabs && docker compose ps'
```

> **This is safe because `docker-compose.yml` pins `name: akaralabs`.** Compose
> normally derives the project name from the directory it is in, so moving the
> folder would look for volumes called `deploy_pgdata` instead of
> `akaralabs_pgdata` — and your database would appear to have vanished. The
> pinned name is what makes the move a non-event. Check it is there before you
> start: `grep '^name:' ~/akaralabs/docker-compose.yml`.

Once `docker compose ps` from the new location shows the running stack, stop the
old one and remove it:

```bash
cd /root/akaralabs && docker compose down
cd /home/deploy/akaralabs && sudo -u deploy docker compose up -d
sudo rm -rf /root/akaralabs      # only after the above works
```

#### Step 3 — generate the key  ·  on your **LAPTOP**

This is the step whose paths are confusing, so to be explicit: `~/.ssh/` is a
directory in **your own home folder on your laptop**. It usually already exists;
`ssh-keygen` creates it if not. This has nothing to do with the project folder,
and nothing to do with the server.

```bash
ssh-keygen -t ed25519 -C 'github-actions-deploy' -f ~/.ssh/akara_deploy -N ''
```

That writes exactly two files:

| File | What it is | Where it goes |
| --- | --- | --- |
| `~/.ssh/akara_deploy.pub` | public half | onto the **server** |
| `~/.ssh/akara_deploy` | private half | into a **GitHub secret** |

If `ssh-keygen` says the file already exists, you have one from a previous
attempt — either reuse it or pick another name with `-f ~/.ssh/akara_deploy2`.

#### Step 4 — install the public half  ·  from your **LAPTOP**

One command, no copy-pasting of key material:

```bash
ssh-copy-id -i ~/.ssh/akara_deploy.pub deploy@129.121.134.101
```

That will ask for `deploy`'s password — which it does not have, because we
created the account with `--disabled-password`. So either do it over your
existing root session instead:

```bash
# on your LAPTOP, one line, using your working root login
cat ~/.ssh/akara_deploy.pub | ssh root@129.121.134.101 \
  'cat >> /home/deploy/.ssh/authorized_keys \
   && chown deploy:deploy /home/deploy/.ssh/authorized_keys \
   && chmod 600 /home/deploy/.ssh/authorized_keys'
```

#### Step 5 — prove it works  ·  from your **LAPTOP**

Do not skip this. A key that doesn't work here will fail inside a CI run, where
the error is far harder to read:

```bash
ssh -i ~/.ssh/akara_deploy deploy@129.121.134.101 'cd ~/akaralabs && docker compose ps'
```

You should see your containers, with no password prompt. If it asks for a
password, the public half didn't land — re-run step 4.

#### Step 6 — the value for the GitHub secret  ·  on your **LAPTOP**

`DEPLOY_SSH_KEY` is the **private** half, whole file, including the first and
last lines:

```bash
cat ~/.ssh/akara_deploy
```

```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAA…
-----END OPENSSH PRIVATE KEY-----
```

Copy all of it, `BEGIN` and `END` lines included. A key pasted without them is
the single most common reason the deploy job fails to authenticate.

#### Step 7 — close the door  ·  on the **SERVER**

You did most of this in Stage 2b. Now that `deploy` works by key, root no longer
needs to be reachable at all:

```bash
sudo tee /etc/ssh/sshd_config.d/00-akara-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sudo sshd -t && sudo systemctl reload ssh
sudo sshd -T | grep -E '^(passwordauthentication|permitrootlogin)'
```

**Keep your current root session open** and confirm from a second terminal that
`ssh -i ~/.ssh/akara_deploy deploy@…` still works before closing it. If you lose
both, you are into Bluehost's console recovery.

`DEPLOY_USER` is now `deploy` and `DEPLOY_PATH` is `/home/deploy/akaralabs`.

Note that `docker` group membership is effectively root on the box — that's
inherent to deploying with Docker over SSH, not something this setup adds. The
mitigation is that the key does nothing else and lives only in GitHub secrets.

### 6b. GitHub secrets

Repo → **Settings → Secrets and variables → Actions → Secrets**:

| Secret | Value |
| --- | --- |
| `DEPLOY_HOST` | your server IP |
| `DEPLOY_USER` | your SSH username |
| `DEPLOY_SSH_KEY` | the **whole** contents of `~/.ssh/akara_deploy`, including the BEGIN and END lines |
| `DEPLOY_PATH` | `/home/<you>/akaralabs` |
| `DEPLOY_PORT` | only if SSH isn't on 22 |

And a **Variable** (not a secret):

| Variable | Value |
| --- | --- |
| `SITE_URL` | `https://new.akaralabs.in` |

`SITE_URL` is a variable because it's baked into the client bundle at build
time and shows up in the smoke test output — it isn't sensitive, and you'll
change it at cutover.

### 6c. Prove it

Make a trivial change and push:

```bash
git commit --allow-empty -m 'test deploy pipeline' && git push
```

Watch Actions. The workflow will:

1. **check** — typecheck and lint. Fails here mean bad code, and nothing
   reaches the server.
2. **build** — Docker image → GHCR, tagged with the commit SHA.
3. **deploy** — takes a database snapshot first and aborts if it looks empty,
   then rewrites `IMAGE=` in `.env`, pulls, restarts, and polls the container
   healthcheck for up to five minutes.

   If it never goes healthy, what happens next **depends on whether this
   deploy ran a migration**:

   - **No migration applied** → the previous image goes back automatically.
     The schema didn't move, so old code still fits it. Safe.
   - **A migration was applied** → it does **not** roll back. It fails the job
     and prints the snapshot path plus the exact restore commands.

   This distinction is the important one. Drizzle has no down-migrations, so
   putting the old image in front of a migrated schema can make things *worse*
   than leaving the new code broken — old code may query a column the
   migration just renamed or dropped. A deploy tool should not make that call
   silently. It counts rows in `drizzle.__drizzle_migrations` before and after
   to know which case it's in.
4. **smoke test** — hits `/`, `/work/`, `/print/`, `/articles/` and
   `/api/health` on the live URL and fails if any isn't 200.

If deploy fails, the job log contains the last 100 lines of the container log,
which is normally enough to see why.

---

## Stage 7 — Cutover to akaralabs.in

Only when Stage 5 passed completely.

**Do it on a quiet morning, not a Friday evening.**

### 7a. Point the apex at the server

At Cloudflare, DNS → Records. Change the `@` record (currently pointing at
Pages) to:

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| A | `@` | your.server.ip | Proxied |
| A | `www` | your.server.ip | Proxied |

Set the TTL low (2 minutes) *an hour before* you cut over, so a rollback
propagates fast.

### 7b. Update the app to know its own name

On the server:

```bash
cd ~/akaralabs
sed -i 's|new\.akaralabs\.in|akaralabs.in|g' .env
grep -E 'SITE_URL|NEXTAUTH_URL|SITE_DOMAIN' .env      # check all four changed
```

In GitHub, change the `SITE_URL` variable to `https://akaralabs.in`.

Then **trigger a rebuild** — this is not optional. `NEXT_PUBLIC_SITE_URL` is
compiled into the browser bundle, so an image built for the subdomain will
keep generating subdomain links:

```bash
git commit --allow-empty -m 'cut over to apex domain' && git push
```

### 7c. Check

```bash
curl -I https://akaralabs.in           # 200, cert for akaralabs.in
curl -I https://www.akaralabs.in       # 301 to the bare domain
curl -s https://akaralabs.in/robots.txt   # should now Allow, not Disallow
curl -s https://akaralabs.in/sitemap.xml | head -20
```

If `robots.txt` still says `Disallow: /`, the image was built for the old host
— check the `SITE_URL` variable in GitHub and rebuild.

Then in a browser: sign in with Google (the redirect URI you added in Stage 1c
is what makes this work), submit a test request, confirm the email links point
at `akaralabs.in` and not the subdomain.

### 7d. Tidy up

- **Keep the Cloudflare Pages project for a week or two.** It's your instant
  rollback: revert the DNS records and the old static site is back. Delete it
  after that so it can't be confused for the live deployment.
- **Remove the `new` DNS record, or isolate it before you keep it.**

  > ⚠️ **Do not leave `new.akaralabs.in` pointed at the same stack after
  > cutover.** It shares the production database and the production uploads
  > volume. Anyone testing on it — including you, casually — can create real
  > customer requests, send real emails to real addresses, alter real quotes,
  > overwrite real files, and run migrations against live data. There is no
  > separation at all; it's the same application on a second hostname.

  Sharing is fine for the *one-time* pre-production test in Stages 4–5,
  because there is no production data yet. It stops being fine the moment the
  apex is live.

  If you want a real staging environment, run a second stack with its own
  database, volume and secrets:

  ```bash
  # A separate directory, a separate compose project name, separate volumes.
  mkdir -p ~/akaralabs-staging && cd ~/akaralabs-staging
  cp ~/akaralabs/docker-compose.yml ~/akaralabs/.env .
  mkdir -p docker && cp ~/akaralabs/docker/Caddyfile docker/

  # Different project name = different volumes = different data.
  sed -i 's/^name: akaralabs$/name: akaralabs-staging/' docker-compose.yml

  # Different domain, different secrets, and NEVER the production password.
  sed -i 's|akaralabs\.in|new.akaralabs.in|g' .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 33)|" .env
  # Point staging at a mail provider sandbox, or leave SMTP_HOST empty so
  # staging cannot email real customers.
  sed -i 's|^SMTP_HOST=.*|SMTP_HOST=|' .env

  docker compose up -d
  ```

  The empty `SMTP_HOST` matters more than it looks: without it, a staging test
  that moves a request to "Shipped" emails an actual customer.

---

## Stage 8 — After launch

### Releases from here on

This document ends once the server is built and serving. Everything after that —
what each release changes, which ones carry a migration, and which ones need
something done by hand before or after the deploy — lives in **`MIGRATIONS.md`**,
newest first.

Read it before deploying a release that touches the database. Most do not; the
ones that do are the ones where "just push and watch the workflow" is not the
whole procedure.

Moving the whole thing to different hardware is a separate procedure again —
**Appendix F**. It is not something to work out on the night.

### Daily housekeeping

```bash
crontab -e
```

```cron
0 6 * * * curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://akaralabs.in/api/cron
```

Expires quotes past their validity date, prunes spent tokens, and emails you a
summary of anything unquoted for over a day, stalled a week, or due within
three. Without it, expired quotes stay clickable and you get no nudges.

### Get backups off the box

The stack now backs up **both the database and the uploaded files, daily**, on
a tiered retention — 7 daily, 4 weekly, 3 monthly — into `./backups`. It also
runs once at startup, so a fresh deploy has a backup within a minute, and it
refuses to accept a database dump under 2 KB (that's an error message, not a
backup).

But `./backups` sits on the same disk as the data it protects, so on its own it
is not a backup. Copy it off:

```bash
sudo apt install -y rclone
rclone config          # AWS S3 ap-south-1 (Mumbai) to stay in-country
crontab -e
```

```cron
# an hour after the backup cycle
30 3 * * * rclone sync ~/akaralabs/backups remote:akara-backups --max-age 100d
```

`sync` rather than `copy` so the remote mirrors the local retention instead of
growing forever.

### Test the restore. Once. For real.

An untested backup is a guess, so there's a script that makes testing cheap:

```bash
cd ~/akaralabs
DRY_RUN=1 ./scripts/restore.sh backups/daily/db-<stamp>.sql.gz
```

`DRY_RUN=1` restores into a brand-new database beside the live one, verifies it
has the tables and rows it should, prints the counts, and **stops before
touching anything live**. Run it now, while nothing is wrong.

Without `DRY_RUN` it goes further: stops the app, renames the live database out
of the way, renames the restored one into place, restarts, and waits for
health. The old database is left on disk under a timestamped name so you can
reverse the swap with two commands — which the script prints when it finishes.

This is why it doesn't pipe a dump into the live database. Restoring a plain
`pg_dump` over an existing schema produces a wall of "relation already exists"
and leaves you half-restored with no way back. The rename-swap approach was
verified end to end on this build: restore into a fresh database, verify 21
tables and the row counts, swap, and swap back.

**Uploaded files are a separate restore.** The database dump does not contain
them:

```bash
docker compose stop web
docker run --rm -v akaralabs_storage:/data -v ~/akaralabs/backups:/b alpine \
  sh -c 'rm -rf /data/* && tar xzf /b/daily/storage-<stamp>.tar.gz -C /data'
docker compose up -d web
```

Restore both from the *same* timestamp, or the database will reference files
that aren't there.

### Know when it breaks

`/api/health` returns 503 if the database is unreachable, so any uptime monitor
can watch it. Point a free UptimeRobot or Better Stack check at
`https://akaralabs.in/api/health` every five minutes. Cheaper than a customer
telling you.

### Watch disk

CAD files accumulate quietly, and "check it monthly" is far too slow — by the
time you notice, uploads are already failing and Postgres may be refusing
writes.

**The daily cron does this for you now.** `/api/cron` reads free space on the
uploads volume and escalates: nothing under 70%, a warning at 70%, and an
urgent alert at 90% that leads the email. So the same job that nudges you about
unquoted requests also tells you when the disk is filling.

To look by hand:

```bash
df -h /
docker system df                              # images and build cache
docker compose exec web du -sh /data/storage  # customer files
du -sh ~/akaralabs/backups                    # backups (should be shrinking, not growing)
```

If it's tight, in order of how much they free for how little risk:

```bash
docker image prune -a -f            # old images — CI keeps 7 days, this drops the rest
docker builder prune -f             # build cache
find ~/akaralabs/backups -name '*.gz' -mtime +40 -delete   # if rclone is mirroring them off-box
```

Growing out of 40 GB is a good problem — resize the volume, or move
`/data/storage` to object storage in Mumbai. The storage layer is one module
(`src/lib/storage.ts`) specifically so that's a contained change.

---

## Appendix A — If you go with Option 2 (app on Workers/Vercel)

The work, in order:

1. **Object storage.** Create a Cloudflare R2 bucket. Rewrite
   `src/lib/storage.ts` against the S3 API (`@aws-sdk/client-s3` +
   `@aws-sdk/s3-request-presigner`) keeping the same `storageKey` contract, so
   the rest of the app doesn't change.
2. **Presigned direct uploads.** Add a route that returns a presigned PUT URL,
   change `FileUpload.tsx` and `forms.js` to upload straight to R2, then POST
   only the resulting keys to the app. This is what gets you past 4.5 MB.
3. **Downloads.** `/api/files/[id]` currently streams from disk. Change it to
   check authorisation, then 302 to a short-lived presigned GET URL.
4. **PgBouncer** on the server, transaction pooling mode, and point
   `DATABASE_URL` at it. `prepare: false` is already set, so no code change.
5. **The database.** On **Workers**, use Hyperdrive — it pools connections and
   can reach a private database over a Cloudflare Tunnel, so Postgres stays off
   the public internet entirely. That's the right way to do this and the main
   reason to prefer Workers over Vercel here.
   On **Vercel**, there is no equivalent: you expose Postgres publicly with TLS
   (`sslmode=verify-full`), `scram-sha-256` auth, a long random password and
   `fail2ban`, and buy Static IPs ($100/mo) to firewall it. Without the static
   IPs you're accepting a publicly reachable database holding customer contact
   details — I wouldn't.
6. **Region.** On Vercel, set the function region to Mumbai (`bom1`) or every
   query pays a trans-Pacific round trip. Workers run at the edge, so the query
   hop to your server is whatever the nearest PoP to the visitor gives you —
   usually good in India, but still a WAN hop per query.
7. **Workers Paid.** The Free plan's 10 ms CPU budget can't complete a bcrypt
   password hash, so sign-in fails outright. Budget $5/month.
7. **Re-run the Stage 5 checks**, especially the 50 MB upload.

The pre-flight script already catches two of these for you: it fails if a
remote database connection isn't encrypted, and it fails if
`MAX_UPLOAD_BYTES` exceeds what the platform allows when `VERCEL` is set.

---

## Appendix B — When something breaks

**`docker compose logs -f web` is the answer to most of these.**

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ERR_TOO_MANY_REDIRECTS` | Cloudflare SSL is Flexible | Set Full (strict) |
| Cert error, Caddy log says ACME failed | Port 80 blocked, or DNS not propagated | `sudo ufw status`, `dig +short akaralabs.in` |
| `redirect_uri_mismatch` on Google | Redirect URI doesn't match exactly | It must be `https://<host>/api/auth/callback/google` — no trailing slash |
| Signed in, but immediately signed out | `AUTH_SECRET` changed, or `NEXTAUTH_URL` ≠ actual host | Make them consistent; changing the secret logs everyone out |
| Emails never arrive, no error anywhere | `SMTP_HOST` unset — mail is logged, not sent | `docker compose logs web \| grep mail:dev` |
| Emails arrive in spam | No SPF/DKIM | Add the provider's DNS records |
| Upload of a 100 MB+ file 413s | Cloudflare's proxy body limit: **100 MB** on Free and Pro, 200 MB on Business | Keep `MAX_UPLOAD_BYTES` under it (default 95 MB), or grey-cloud the record, or go Business |
| Upload fails just over `MAX_UPLOAD_BYTES` | Working as intended — that's the app rejecting it | Raise both `MAX_UPLOAD_BYTES` and Caddy's `request_body max_size`, and check Cloudflare's limit above |
| `502` from Caddy | Container not up or unhealthy | `docker compose ps`, then the web logs |
| Migrations hang at "waiting for database" | Wrong password, or `db` unhealthy | Password must match in both `.env` lines; `docker compose logs db` |
| Deploy job times out waiting for health | App starts but `/api/health` fails | It's almost always `DATABASE_URL`. The job log has the container output. |
| Marketing page renders with no styling | `public/` didn't make it into the image | Rebuild; check `.dockerignore` hasn't grown a `public` line |
| A stage change emails nobody | Customer turned notifications off, or `notifyEmail` is false | Check the user row in `/admin/people` |

---

## Appendix C — Rolling back

**Bad deploy** — CI does this itself, but by hand:

```bash
cd ~/akaralabs
docker images | grep akaralabs           # find the previous SHA tag
sed -i 's|^IMAGE=.*|IMAGE=ghcr.io/<you>/akaralabs:sha-<older>|' .env
docker compose up -d --no-deps web
```

**Bad cutover** — revert the two Cloudflare DNS records to the Pages target.
With a 2-minute TTL you're back in a few minutes. This is exactly why you keep
the Pages project for a fortnight.

**A migration made things worse.** There is no down-migration, so the image
alone is not a rollback — see the warning above. Restore the database and the
code together:

```bash
cd ~/akaralabs
docker compose stop web
./scripts/restore.sh backups/pre-deploy-<stamp>.sql.gz   # verifies, then swaps
sed -i 's|^IMAGE=.*|IMAGE=ghcr.io/<you>/akaralabs:sha-<older>|' .env
docker compose up -d --no-deps web
```

CI takes a `pre-deploy-*` snapshot before every deploy precisely so this file
exists when you need it, and refuses to deploy if that snapshot comes out
empty.

Often the faster answer is to fix forward — write the next migration that
corrects the problem — because a restore loses everything customers did since
the snapshot. Decide which, deliberately; don't let a script decide for you.

---

## Appendix D — Base image versions

The compose file uses `postgres:16-alpine`, `caddy:2-alpine` and the Dockerfile
uses `node:22-alpine`. These are *minor-line* tags: they pick up patch releases
automatically but won't jump to Postgres 17 or Node 23 behind your back.

Digest-pinning (`postgres@sha256:…`) is more reproducible, and it's the right
call for a team with a release process. For a one-person studio it has a real
cost: you stop receiving security patches for Postgres until you remember to
bump the digest by hand, and "remember to bump the digest" is exactly the task
that doesn't happen. An unpatched database is a worse risk than a surprise
patch release.

So the trade here is deliberate, not an oversight. If you want reproducibility
without the maintenance burden, the middle path is to keep the minor-line tags
and let a bot propose the bumps:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: docker
    directory: /
    schedule: { interval: weekly }
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
```

Then you review and merge a PR rather than discovering a change.

One thing genuinely worth pinning tighter is **Postgres major version**, and
`16-alpine` already does that. A silent 16 → 17 jump would need a `pg_upgrade`
and would fail to start on the existing data directory.

---

---

## Appendix E — Dependency advisories

`npm audit` on a fresh install should report **4 high, all in `nodemailer`,
and nothing else**. Anything more than that is new and worth reading.

That baseline is the result of a deliberate pass, not luck. The first audit run
found 14 advisories including three critical, and two of them were reachable
here rather than theoretical:

- **Auth.js — configuration errors can make existence-based auth checks fail
  open.** Critical, and this app gates `/dashboard` and `/admin` on exactly that
  kind of check. Fixed in `next-auth@5.0.0-beta.32`; the project was on
  `beta.29`.
- **Drizzle ORM — SQL injection via improperly escaped SQL identifiers.** High.
  There are a handful of raw `sql` templates in the admin queries. Fixed in
  `drizzle-orm@0.45.2`.
- **nanoid — integer overflow.** High, and nanoid generates the tracking tokens
  that authorise access to a request without an account. Fixed in `5.1.16`.
- **sanitize-html — stored XSS and `javascript:` URI bypasses.** Moderate, and
  this is what renders article bodies and customer messages. Fixed in `2.17.7`.

`postcss`, `sharp` and `esbuild` were flagged transitively. npm's suggested fix
was a Next.js 16 major upgrade for a build-time CSS source-map issue, which is
not a trade worth making. They're pinned forward with `overrides` in
`package.json` instead — keep that block when you touch dependencies.

### The four that remain, and why

`nodemailer` <= 9.0.0 has a message-level `raw` option that bypasses
`disableFileAccess` / `disableUrlAccess`, allowing arbitrary file read and SSRF
in the delivered message.

It can't be fixed by upgrading: `next-auth` peer-requires
`nodemailer@^7.0.7 || ^8.0.5`, so 10.x won't resolve. 8.0.11 is the highest
version compatible, and that's what's installed.

It is also **unreachable from this codebase**. The vulnerability needs an
attacker-influenced `raw` message option. `src/lib/mail.ts` is the only place
that sends mail, it builds every message from a fixed set of fields (`from`,
`to`, `bcc`, `replyTo`, `subject`, `html`, `text`), and it never passes `raw`,
never uses `jsonTransport`, and never sets a custom transport `name`.

So the mitigation is a code constraint, not a version: **if you ever add a
`raw` option to `sendMail`, this stops being theoretical.** Re-check the
advisory before doing that, and drop the `nodemailer` pin the moment Auth.js
widens its peer range.

### Re-checking

```bash
npm audit                    # expect: 4 high, nodemailer only
npm audit --omit=dev         # expect: the same 4 — nodemailer ships at runtime
```

CI does not currently fail on `npm audit`, and deliberately so — a new advisory
in a transitive dev dependency would block a deploy that has nothing to do with
it. The weekly Dependabot PRs from Appendix D are the mechanism instead. If you
would rather be strict, add this to the `check` job, which fails only on high
and critical in *runtime* dependencies:

```yaml
      - name: Audit runtime dependencies
        run: npm audit --omit=dev --audit-level=high
```

Be aware that as written it will fail today, on the `nodemailer` advisory above.

---

## Appendix F — Moving to a new server

Different hardware, same site. Bluehost to somebody else, a bigger box, a
different region — the procedure is the same, and none of it is `docker compose
up` on the new machine and hoping.

The whole exercise is one question: **is there any moment where an enquiry can
be accepted by a server you are about to throw away?** Everything below exists
to make the answer no.

Every command here was run end to end in a sandbox first: dump, restore,
uploads copy, and the app served from the restored copy. The verification
script is `scripts/verify-move.sh`.

### What actually has to move

| | Where it lives | How it moves |
|---|---|---|
| Database | `pgdata` volume | `pg_dump` → `psql` |
| Customer uploads | `storage` volume | tarball, **copied last** |
| Secrets | `.env` | copied verbatim — see the warning below |
| Caddy certificates | `caddy_data` volume | do **not** copy; the new box gets its own |
| Backups | `./backups` | copy if you want the history; not needed to run |

The application itself does not move. The new server pulls the same image from
GHCR that the old one is running.

### AUTH_SECRET is not a fresh-install value

Generating a new `AUTH_SECRET` on the new box is the single easiest way to turn
a clean migration into a support morning. Copy `.env` across unchanged.

Two things break, and neither announces itself:

**Every signed-in customer is signed out.** Sessions are JWTs signed with that
secret; a different secret means every cookie in every browser is a forgery.
Verified: same session cookie, new secret, `/dashboard` → `/signin`.

**Every email code in flight stops working — as "wrong", not "expired".** Since
the OTP release, `code_hash` is an HMAC keyed on `AUTH_SECRET`. A customer who
received a code sixty seconds before the cutover types it in and is told:

```
That code isn't right. 4 attempts left.
```

They will retype it, burn their attempts, and conclude the site is broken. The
code is correct; the key that verifies it changed underneath them. Verified by
issuing a code, restarting with a different secret, and posting the code.

`POSTGRES_PASSWORD` is different — the new cluster is initialised from `.env`,
so a new value there is fine as long as it is the value `.env` carries. Keeping
it identical is still simpler.

### Cloudflare makes the cutover easy and the certificate hard

Because the domain is orange-clouded, visitors resolve to Cloudflare's IPs,
which never change. Changing the origin A record takes effect at the edge in
seconds — there is no DNS TTL tail to wait out, and no need to lower the TTL
a day ahead the way you would on a grey-clouded record.

The cost is the certificate. Caddy gets a Let's Encrypt cert over HTTP-01,
which needs Let's Encrypt to reach **that specific box** on port 80. While
`akaralabs.in` still points at the old server, the new one cannot prove it owns
the name, so it cannot get a certificate for it — and you find this out at the
moment you switch, which is the worst time.

Two ways round it, pick one before you start:

1. **Stage under a second hostname.** Point `new2.akaralabs.in` (grey cloud,
   straight at the new IP), set `SITE_DOMAIN=new2.akaralabs.in`, let Caddy get
   a cert, verify everything, then change `SITE_DOMAIN` back and let it get the
   real cert during the cutover window. You did exactly this with
   `new.akaralabs.in` for the original build.

2. **Use a Cloudflare Origin CA certificate.** Free, fifteen years, no ACME
   validation at all, so it works on a box the public internet has never
   resolved. The Caddyfile already documents the four steps — the `tls` line is
   sitting commented out. This is the better option if you expect to move
   servers more than once.

### The move

Timings assume a small database and a few hundred MB of uploads. Give yourself
an evening, not a lunch break, and do it when India is asleep.

#### 1. Build the new server, days ahead

Work through **Stages 2 and 4** on the new box. Everything except DNS. At the
end you want the stack running, reachable under its staging hostname, with an
empty database — proof that the machine, Docker, the image pull and Caddy all
work before any data is involved.

```bash
# on the NEW server
cd ~/akaralabs
docker compose ps          # all Up, db healthy
curl -fsS localhost/api/health
```

#### 2. Copy `.env` across, unchanged

```bash
# on your LAPTOP
scp root@OLD_IP:akaralabs/.env /tmp/akara.env
scp /tmp/akara.env root@NEW_IP:akaralabs/.env
shred -u /tmp/akara.env
```

Change only `SITE_DOMAIN`, and only if you are staging under a second hostname.
Leave `AUTH_SECRET` alone.

#### 3. Close writes on the old server

This is the step people skip, and it is the only one that actually prevents
data loss. Everything from here until DNS moves is the window in which an
enquiry could land on the old box.

Shortest safe version — stop the app but leave the database up, so you can
still dump it:

```bash
# on the OLD server
cd ~/akaralabs
docker compose stop web
```

Caddy now returns 502 for a few minutes. A visitor mid-form sees an error and
retries; nothing is silently swallowed, which is the point. If you would rather
show something civil, put a static maintenance page in front instead — but do
not leave `/api/intake` answering.

#### 4. Dump the database, then copy the uploads

**Order matters.** Database first, uploads second. If you take the uploads
first, a file uploaded in between exists as a row with nothing behind it — and
nothing in the stack notices until a customer clicks their own STL and gets a
404. With writes already stopped in step 3 this cannot happen, which is exactly
why step 3 comes first.

```bash
# on the OLD server
cd ~/akaralabs
STAMP=$(date -u +%Y%m%d-%H%M)

docker compose exec -T db pg_dump -U akara -d akara --no-owner \
  | gzip > /root/move-db-$STAMP.sql.gz

docker run --rm -v akaralabs_storage:/data:ro -v /root:/out alpine \
  tar czf /out/move-storage-$STAMP.tar.gz -C /data .

ls -lh /root/move-*
```

`--no-owner` matters: without it the dump carries role grants that may not
exist on the new cluster, and the restore fills with errors.

Then move both:

```bash
# on your LAPTOP — or rsync directly between the two if they can see each other
scp root@OLD_IP:/root/move-*-$STAMP.* /tmp/
scp /tmp/move-*-$STAMP.* root@NEW_IP:/root/
```

#### 5. Restore on the new server

```bash
# on the NEW server
cd ~/akaralabs
docker compose stop web        # nothing should be reading while we load

gunzip -c /root/move-db-*.sql.gz \
  | docker compose exec -T db psql -U akara -d akara -v ON_ERROR_STOP=1

docker run --rm -v akaralabs_storage:/data -v /root:/in alpine \
  tar xzf /in/move-storage-*.tar.gz -C /data

docker compose up -d web
```

`ON_ERROR_STOP=1` is deliberate — a restore that scrolls errors past you and
exits 0 is how a half-populated database reaches production.

The database arrives already migrated, because the dump came from a migrated
one. `ops/migrate.cjs` runs at startup, finds everything applied, and does
nothing.

#### 6. Verify before DNS

```bash
# on the NEW server
./scripts/verify-move.sh
```

Row counts for every table, and — the one that matters — every `files.storage_key`
resolved against the actual volume. Compare the counts against the same script
run on the old server. A mismatch means stop.

Then exercise the real hostname against the new IP, without sending anyone
there, by overriding DNS on your own machine:

```bash
# on your LAPTOP: /etc/hosts  (C:\Windows\System32\drivers\etc\hosts)
NEW_IP    akaralabs.in www.akaralabs.in
```

Testing by IP alone is not enough — Auth.js, cookies, redirects and canonical
URLs are all hostname-sensitive, so an IP test passes while the real thing
fails. With the override in place, do these five by hand:

- [ ] sign in with an existing password
- [ ] open an existing request in `/admin` and **download its attached file**
- [ ] open a guest tracking link with its original `?t=` token
- [ ] submit a print request and confirm the code arrives (proves SMTP works
      from the new box — a new IP may be unknown to your relay)
- [ ] `/api/health` returns 200

Remove the hosts entry afterwards.

#### 7. Cut over

Cloudflare → DNS → the `A` record for `akaralabs.in` (and `www`) → new IP.
Proxied, so it takes effect in seconds.

```bash
curl -sI https://akaralabs.in/ | grep -i 'cf-cache-status\|server'
```

Then watch the new server's logs for ten minutes:

```bash
docker compose logs -f --tail=50 web caddy
```

#### 8. Afterwards

- Re-do **Stage 8**: the cron entry for `/api/cron` and the `rclone` backup sync
  are on the old machine's crontab, not in the repo. A move with no cron means
  no backups and no daily digest, silently.
- Update `DEPLOY_HOST` in the GitHub repository secrets, and re-add the deploy
  key — Stage 6. Until you do, pushes deploy to the old server.
- If you locked the origin to Cloudflare ranges, run `scripts/lock-origin.sh`
  on the new box.
- Leave the old server **running and untouched** for a week. Not serving — its
  DNS no longer points anywhere — just intact.

### When rollback stops being possible

Up to the moment DNS moves, rollback is free: the old server still has
everything, and you simply do not switch.

**After DNS moves, it is not.** The instant the new server accepts one enquiry,
one message, one quote approval, going back to the old server loses it —
permanently, with no error and no record, because the old database never knew
it happened.

This is the opposite of how it feels at the time. The first hour on a new
server feels provisional, like you could still change your mind. You cannot,
not without deciding to discard whatever came in. So:

- If something is wrong in the **first few minutes and nothing has been
  submitted** — point DNS back, start `web` on the old server, done.
- If anything **has** been submitted, going back means dumping the new server
  and restoring onto the old one, which is this same appendix in reverse. Fixing
  forward on the new box is nearly always the better answer.

Check before deciding:

```bash
# on the NEW server — anything created since the cutover
docker compose exec -T db psql -U akara -d akara -c \
  "select count(*) from requests where created_at > now() - interval '2 hours';"
```

Zero means the door is still open. Anything else means it closed.

### Decommissioning the old box

After a week of the new server behaving, and one restore test on the new
server's own backups:

```bash
# on the OLD server — take a final copy off the machine first
docker compose down            # keeps volumes
```

Do not `down -v`, and do not destroy the instance until that final copy is
somewhere else and you have opened it. A backup nobody has read is a hope.
