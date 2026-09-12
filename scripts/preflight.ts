/* Pre-flight check. Run this before a first deploy, and again on the server
   after filling in .env — it tells you exactly what is missing or wrong
   instead of letting the app fail at runtime in front of a customer.

     npm run preflight

   Exit code 0 = safe to deploy, 1 = something will actually break.
   Warnings don't fail the run, but read them.
*/
import "../src/lib/env-file";
import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import nodemailer from "nodemailer";

type Level = "pass" | "warn" | "fail";
const results: { level: Level; area: string; msg: string; fix?: string }[] = [];

const pass = (area: string, msg: string) => results.push({ level: "pass", area, msg });
const warn = (area: string, msg: string, fix?: string) => results.push({ level: "warn", area, msg, fix });
const fail = (area: string, msg: string, fix?: string) => results.push({ level: "fail", area, msg, fix });

const isProd = process.env.NODE_ENV === "production";

/* ---- 1. Required environment ----------------------------------------- */

function checkEnv() {
  const required = ["DATABASE_URL", "AUTH_SECRET", "NEXT_PUBLIC_SITE_URL"];
  for (const key of required) {
    if (!process.env[key]) {
      fail("env", `${key} is not set`, `Add ${key} to .env — see .env.example`);
    }
  }

  const secret = process.env.AUTH_SECRET || "";
  if (secret) {
    if (secret.length < 32) {
      fail("env", `AUTH_SECRET is only ${secret.length} chars`, "openssl rand -base64 33");
    } else if (/change|secret|dev-only|example|test/i.test(secret)) {
      fail("env", "AUTH_SECRET still looks like a placeholder", "openssl rand -base64 33");
    } else {
      pass("env", `AUTH_SECRET set (${secret.length} chars)`);
    }
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || "";
  if (site) {
    try {
      const u = new URL(site);
      if (u.protocol !== "https:" && isProd) {
        fail("env", `NEXT_PUBLIC_SITE_URL is ${u.protocol}//… in production`, "Use the https:// URL — auth cookies are Secure-only over TLS");
      } else if (site.endsWith("/")) {
        warn("env", "NEXT_PUBLIC_SITE_URL has a trailing slash", "Drop it — links are built as ${SITE_URL}/path");
      } else {
        pass("env", `site URL ${site}`);
      }
    } catch {
      fail("env", `NEXT_PUBLIC_SITE_URL is not a valid URL: ${site}`);
    }
  }

  // NEXTAUTH_URL must agree with the site URL or callbacks land on the wrong host.
  const authUrl = process.env.NEXTAUTH_URL;
  if (authUrl && site && authUrl.replace(/\/$/, "") !== site.replace(/\/$/, "")) {
    fail(
      "env",
      `NEXTAUTH_URL (${authUrl}) doesn't match NEXT_PUBLIC_SITE_URL (${site})`,
      "Set both to the same origin, or OAuth callbacks will redirect to the wrong host",
    );
  }

  const admins = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!admins.length) {
    warn(
      "env",
      "ADMIN_EMAILS is empty — nobody becomes admin automatically",
      "Set ADMIN_EMAILS=you@akaralabs.in before your first sign-in, or run db:seed",
    );
  } else {
    const bad = admins.filter((a) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a));
    if (bad.length) fail("env", `ADMIN_EMAILS has invalid entries: ${bad.join(", ")}`);
    else pass("env", `admin: ${admins.join(", ")}`);
  }
}

/* ---- 2. Database ------------------------------------------------------ */

async function checkDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  let host = "?";
  try {
    host = new URL(url).host;
  } catch {
    fail("db", "DATABASE_URL is not parseable as a URL");
    return;
  }

  const sql = postgres(url, { max: 1, connect_timeout: 8, onnotice: () => {} });
  try {
    const t0 = Date.now();
    const [{ version }] = await sql<{ version: string }[]>`select version()`;
    const rtt = Date.now() - t0;
    pass("db", `connected to ${host} in ${rtt}ms — ${version.split(" ").slice(0, 2).join(" ")}`);

    // Latency matters: portal pages make several queries each.
    if (rtt > 150) {
      warn(
        "db",
        `${rtt}ms round trip is high`,
        "Every portal page makes 3–6 queries, so this multiplies. Co-locate the app with the database if you can.",
      );
    }

    const [ext] = await sql<{ ok: boolean }[]>`
      select exists(select 1 from pg_extension where extname = 'pgcrypto') as ok`;
    if (ext.ok) pass("db", "pgcrypto present (gen_random_uuid)");
    else fail("db", "pgcrypto extension missing", "npm run db:migrate creates it");

    // Are migrations applied?
    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public'`;
    const names = new Set(tables.map((t) => t.table_name));
    const expected = [
      "users", "accounts", "sessions", "requests", "request_events",
      "files", "quotes", "quote_items", "messages", "articles",
      "printers", "spools", "print_jobs", "notifications", "audit_log", "rate_limits",
    ];
    const missing = expected.filter((t) => !names.has(t));
    if (missing.length) {
      fail("db", `${missing.length} tables missing (${missing.slice(0, 4).join(", ")}…)`, "npm run db:migrate");
    } else {
      pass("db", `schema applied — ${names.size} tables`);
    }

    // Connection headroom. Serverless especially will exhaust this.
    const [{ max_connections }] = await sql<{ max_connections: string }[]>`show max_connections`;
    const [{ used }] = await sql<{ used: number }[]>`
      select count(*)::int as used from pg_stat_activity`;
    const limit = Number(max_connections);
    pass("db", `${used}/${limit} connections in use`);
    if (limit < 50) {
      warn("db", `max_connections is only ${limit}`, "Fine for one app container; too low if the app is serverless — put PgBouncer in front");
    }

    // Is TLS actually in use? Only matters when the DB isn't local.
    const localHost = /^(localhost|127\.0\.0\.1|db|postgres)(:\d+)?$/.test(host);
    const [ssl] = await sql<{ ssl: boolean | null }[]>`
      select ssl from pg_stat_ssl where pid = pg_backend_pid()`;
    if (localHost) {
      pass("db", "database is local to the app — not exposed to the network");
    } else if (ssl?.ssl) {
      pass("db", "remote database, TLS in use");
    } else {
      fail(
        "db",
        `database at ${host} is remote and the connection is NOT encrypted`,
        "Add ?sslmode=require to DATABASE_URL and enable TLS on Postgres — credentials and customer data are crossing the network in clear text",
      );
    }

    // An admin account has to exist or nobody can reach /admin.
    if (!missing.includes("users")) {
      const [admin] = await sql<{ n: number }[]>`
        select count(*)::int as n from users where role = 'admin'`;
      if (admin.n === 0) {
        warn(
          "db",
          "no admin account exists yet",
          "Set ADMIN_EMAILS and sign in, or run: ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run db:seed",
        );
      } else {
        pass("db", `${admin.n} admin account${admin.n === 1 ? "" : "s"}`);
      }
    }
  } catch (err) {
    fail(
      "db",
      `cannot reach ${host}: ${err instanceof Error ? err.message : String(err)}`,
      "Check the host, port, password, and that Postgres allows this client (pg_hba.conf / firewall)",
    );
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

/* ---- 3. File storage -------------------------------------------------- */

function checkStorage() {
  const dir = resolve(process.env.STORAGE_DIR || "/data/storage");
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const probe = resolve(dir, `.preflight-${Date.now()}`);
    writeFileSync(probe, "ok");
    unlinkSync(probe);
    pass("storage", `${dir} is writable`);
  } catch (err) {
    fail(
      "storage",
      `${dir} is not writable: ${err instanceof Error ? err.message : String(err)}`,
      "In Docker this is a volume; check it's mounted and owned by uid 1001",
    );
  }

  const cap = Number(process.env.MAX_UPLOAD_BYTES ?? 95 * 1024 * 1024);
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(0)} MB`;
  pass("storage", `upload ceiling ${mb(cap)} per file`);

  /* The app can only accept what the whole network path allows. Advertising a
     higher ceiling than the proxy in front turns a clear in-app message into an
     opaque 413 from something the customer has never heard of. */
  if (process.env.VERCEL && cap > 4.5 * 1024 * 1024) {
    fail(
      "storage",
      `MAX_UPLOAD_BYTES is ${mb(cap)} but Vercel caps request bodies at 4.5 MB`,
      "Uploads above 4.5 MB will 413. Host the app somewhere without that cap, or move uploads to presigned direct-to-object-storage",
    );
  } else if (cap > 100 * 1024 * 1024) {
    warn(
      "storage",
      `MAX_UPLOAD_BYTES is ${mb(cap)} — above Cloudflare's 100 MB proxy limit on Free and Pro`,
      "Fine if the domain is DNS-only (grey cloud) or you're on Business (200 MB). Otherwise lower it to ~95 MB so the app rejects oversize files with a clear message instead of Cloudflare returning a 413.",
    );
  }
}

/* ---- 4. Email --------------------------------------------------------- */

async function checkMail() {
  const host = process.env.SMTP_HOST;
  if (!host) {
    warn(
      "mail",
      "SMTP_HOST not set — mail is logged, not sent",
      "Verification links, quote emails and tracking links will silently never arrive. Fine for a smoke test, not for launch.",
    );
    return;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);

  /* Catch a half-configured server before trying to connect, because
     nodemailer's error for it — `Missing credentials for "PLAIN"` — doesn't say
     which variable is missing. This is the single most common way to end up
     with an app that looks fine and quietly sends no email at all. */
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const localRelay = port === 25 || /^(localhost|127\.0\.0\.1|::1|mailhog|mailpit)$/i.test(host);

  if (smtpUser && !smtpPass) {
    fail("mail", `SMTP_USER is ${smtpUser} but SMTP_PASS is empty`, "Mail will be logged, not sent. Set SMTP_PASS — most providers need an app-specific password, not your login password.");
    return;
  }
  if (!smtpUser && smtpPass) {
    fail("mail", "SMTP_PASS is set but SMTP_USER is empty", "Set SMTP_USER to the mailbox that password belongs to.");
    return;
  }
  if (!smtpUser && !smtpPass && !localRelay) {
    fail("mail", `SMTP_HOST is ${host}:${port} but SMTP_USER and SMTP_PASS are both empty`, "Either fill them in, or comment out SMTP_HOST so mail is logged deliberately rather than failing on every send.");
    return;
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "1" || port === 465,
    auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    connectionTimeout: 10000,
  });

  try {
    await transport.verify();
    pass("mail", `SMTP ${host}:${port} accepted the connection and credentials`);
  } catch (err) {
    fail(
      "mail",
      `SMTP ${host}:${port} failed: ${err instanceof Error ? err.message : String(err)}`,
      "Check the host, port, and that SMTP_PASS is an app-specific password if the provider requires one",
    );
  }

  const from = process.env.SMTP_FROM || "";
  const site = process.env.NEXT_PUBLIC_SITE_URL || "";
  const fromDomain = from.match(/@([^\s>]+)/)?.[1];
  const siteDomain = site ? new URL(site).hostname.replace(/^www\./, "") : "";
  if (fromDomain && siteDomain && !fromDomain.endsWith(siteDomain.split(".").slice(-2).join("."))) {
    warn(
      "mail",
      `SMTP_FROM is @${fromDomain} but the site is ${siteDomain}`,
      "Mismatched domains land in spam. Send from your own domain with SPF and DKIM set up.",
    );
  }

  if (!process.env.STUDIO_INBOX) {
    warn("mail", "STUDIO_INBOX not set", "New enquiries will go to CONTACT_EMAIL instead — set it explicitly");
  }
}

/* ---- 5. Google sign-in ------------------------------------------------ */

function checkGoogle() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;

  if (!id && !secret) {
    warn(
      "google",
      "Google sign-in not configured",
      "The button will error if clicked. Email/password still works. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or remove the button.",
    );
    return;
  }
  if (!id || !secret) {
    fail("google", "only one of GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET is set", "Both are needed");
    return;
  }
  if (!id.endsWith(".apps.googleusercontent.com")) {
    warn("google", "GOOGLE_CLIENT_ID doesn't look like a Google client ID", "It should end in .apps.googleusercontent.com");
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  pass("google", "credentials present");
  if (site) {
    results.push({
      level: "warn",
      area: "google",
      msg: "verify the redirect URI is registered in Google Cloud Console",
      fix: `It must be exactly: ${site}/api/auth/callback/google`,
    });
  }
}

/* ---- 6. Housekeeping cron -------------------------------------------- */

function checkCron() {
  if (!process.env.CRON_SECRET) {
    warn(
      "cron",
      "CRON_SECRET not set — /api/cron returns 503",
      "Quotes won't auto-expire and you get no daily bench summary. openssl rand -hex 24",
    );
  } else if (process.env.CRON_SECRET.length < 20) {
    fail("cron", "CRON_SECRET is too short to be worth having", "openssl rand -hex 24");
  } else {
    pass("cron", "CRON_SECRET set");
  }
}

/* ---- 7. Build artefacts ---------------------------------------------- */

function checkBuild() {
  if (existsSync("drizzle/meta/_journal.json")) {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: unknown[] };
    pass("build", `${journal.entries.length} migration(s) on disk`);
  } else {
    warn("build", "no drizzle/ migrations here", "Expected if you're running this from a directory that only holds ops/ — check from the app root");
  }

  /* The extracted marketing markup sits at src/content/legacy in the source
     tree, and Next's tracer copies it into the standalone bundle, so in the
     container it's at the app root too. Only treat absence as fatal when we
     can see we're in a tree that ought to have it. */
  const candidates = [
    "src/content/legacy/manifest.json",
    ".next/standalone/src/content/legacy/manifest.json",
  ];
  const found = candidates.find((p) => existsSync(p));

  if (found) {
    const m = JSON.parse(readFileSync(found, "utf8")) as unknown[];
    pass("build", `${m.length} marketing pages extracted`);
  } else if (existsSync("package.json") && existsSync("src")) {
    fail(
      "build",
      "src/content/legacy is missing — the marketing pages won't render",
      "node scripts/extract-pages.mjs && node scripts/patch-wizards.mjs",
    );
  } else {
    warn("build", "marketing markup not checked from this directory");
  }
}

/* ---- Report ----------------------------------------------------------- */

async function main() {
  console.log("\nAkara Labs — pre-flight\n" + "─".repeat(60));

  checkEnv();
  await checkDatabase();
  checkStorage();
  await checkMail();
  checkGoogle();
  checkCron();
  checkBuild();

  const icon = { pass: "✓", warn: "!", fail: "✗" } as const;
  let area = "";
  for (const r of results) {
    if (r.area !== area) {
      area = r.area;
      console.log(`\n${area.toUpperCase()}`);
    }
    console.log(`  ${icon[r.level]} ${r.msg}`);
    if (r.fix) console.log(`      → ${r.fix}`);
  }

  const fails = results.filter((r) => r.level === "fail").length;
  const warns = results.filter((r) => r.level === "warn").length;

  console.log("\n" + "─".repeat(60));
  if (fails) {
    console.log(`✗ ${fails} blocking problem${fails === 1 ? "" : "s"}, ${warns} warning${warns === 1 ? "" : "s"} — do not deploy yet.\n`);
    process.exit(1);
  }
  console.log(`✓ nothing blocking${warns ? `, ${warns} warning${warns === 1 ? "" : "s"} worth reading` : ""}. Safe to deploy.\n`);
}

main().catch((err) => {
  console.error("\npre-flight itself crashed:", err);
  process.exit(1);
});
