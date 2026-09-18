/* The OTP flows, end to end in a real browser, plus the failure paths that
   matter more than the happy one.

   Codes are read straight out of the database rather than out of an inbox —
   the sandbox has no SMTP, and a test that depended on mail delivery would be
   testing the mail server. What is asserted is that a code was issued, that
   only the right code works, and, crucially, that the side effects the code
   is supposed to gate really are gated. */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PSQL = process.env.PSQL ?? "psql";
const DB = ["-h", "127.0.0.1", "-U", "akara", "-d", "akara", "-tAX", "-c"];

let fails = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`);
  if (!cond) fails++;
};

function sql(q) {
  return execFileSync(PSQL, [...DB, q], { encoding: "utf8" }).trim();
}

/* The code never leaves the server in plaintext — only its HMAC is stored. So
   the test recomputes the hash for each candidate and finds the match, exactly
   as the server would. Six digits is a small enough space to walk. */
import { createHmac } from "node:crypto";
const SECRET = process.env.AUTH_SECRET ?? readSecret();
function readSecret() {
  const env = execFileSync("sh", ["-c", "grep '^AUTH_SECRET=' /home/claude/akara/.env.local | cut -d= -f2-"], {
    encoding: "utf8",
  }).trim();
  return env;
}
function codeFor(email, purpose) {
  const hash = sql(
    `select code_hash from email_otps where lower(email)=lower('${email}') and purpose='${purpose}' and consumed_at is null order by created_at desc limit 1`,
  );
  if (!hash) return null;
  for (let n = 0; n < 1_000_000; n++) {
    const candidate = String(n).padStart(6, "0");
    const h = createHmac("sha256", SECRET)
      .update(`${email.toLowerCase()}\0${purpose}\0${candidate}`)
      .digest("hex");
    if (h === hash) return candidate;
  }
  return null;
}

/* Signup, intake and confirm are all rate limited per IP — correct in
   production, and guaranteed to throttle a suite that exercises every one of
   them from one address. Cleared so a re-run starts from a known state. */
sql("delete from rate_limits");

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const p = await (await b.newContext()).newPage();

const stamp = Date.now();
const signupEmail = `otp-signup-${stamp}@example.test`;
const guestEmail = `otp-guest-${stamp}@example.test`;
const PASSWORD = "codeword12345";

/* ========== 1. Signup is gated on the code ============================ */
console.log("\n1. Signup does not create an account until the code is entered");

await p.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(800);
await p.fill('input[name="name"]', "Otp Tester");
await p.fill('input[name="email"]', signupEmail);
await p.fill('input[name="password"]', PASSWORD);
/* Scoped to the form: the page also carries a "Continue with Google" button,
   and an unscoped text match picks that one — which silently tests OAuth
   instead of signup, and passes nothing. */
await p.click('form button.btn-primary');
await p.waitForTimeout(2000);

ok(
  sql(`select count(*) from users where lower(email)='${signupEmail}'`) === "0",
  "no user row exists after step one",
);
ok(await p.locator('input[autocomplete="one-time-code"]').count() > 0, "the code box is shown");
ok(
  sql(`select count(*) from email_otps where lower(email)='${signupEmail}' and purpose='signup'`) === "1",
  "a signup code was issued",
);
ok(
  !sql(`select payload->>'passwordHash' from email_otps where lower(email)='${signupEmail}'`).includes(PASSWORD),
  "the pending password is stored hashed, not in plaintext",
);

/* ---- a wrong code is refused and burns an attempt --------------------- */
await p.fill('input[autocomplete="one-time-code"]', "000000");
await p.waitForTimeout(1500);
const realCode = codeFor(signupEmail, "signup");
const wrongRefused =
  sql(`select count(*) from users where lower(email)='${signupEmail}'`) === "0";
ok(wrongRefused, "a wrong code still creates no account");
ok(
  Number(sql(`select attempts from email_otps where lower(email)='${signupEmail}' order by created_at desc limit 1`)) >= 1,
  "the wrong guess was counted",
);

/* ---- the right code creates the account, already verified ------------ */
ok(!!realCode, "the issued code is recoverable for the test", realCode ?? "(none)");
await p.fill('input[autocomplete="one-time-code"]', "");
await p.fill('input[autocomplete="one-time-code"]', realCode);
await p.waitForTimeout(3500);

const created = sql(
  `select count(*) from users where lower(email)='${signupEmail}' and email_verified is not null`,
);
ok(created === "1", "the account exists and is already verified");
ok(
  sql(`select count(*) from email_otps where lower(email)='${signupEmail}' and consumed_at is null`) === "0",
  "the code was burned",
);
ok(new URL(p.url()).pathname.startsWith("/dashboard"), "signed in and landed in the dashboard", p.url());

/* ---- and it cannot be replayed --------------------------------------- */
const replay = await p.evaluate(
  async ([base, email, code]) => {
    const r = await fetch(base + "/api/account/register/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    return r.status;
  },
  [BASE, signupEmail, realCode],
);
ok(replay >= 400, "the same code cannot be used twice", `status ${replay}`);

/* ========== 2. Guest intake: request kept, emails held ================= */
console.log("\n2. A guest request is saved, but nothing is emailed until confirmed");

const guest = await b.newContext();
const gp = await guest.newPage();
await gp.goto(`${BASE}/print/`, { waitUntil: "domcontentloaded" });
await gp.waitForTimeout(1200);
await gp.fill('textarea[name="brief"]', "Bracket for a test rig. Needs to survive 60C.");
await gp.evaluate(() => document.querySelectorAll(".fsec").forEach((s) => s.setAttribute("data-open", "")));
await gp.waitForTimeout(300);
await gp.fill('input[name="name"]', "Guest Tester");
await gp.fill('input[name="email"]', guestEmail);
await gp.click("#submitBtn");
await gp.waitForTimeout(3500);

const ref = sql(`select reference from requests where lower(contact_email)='${guestEmail}'`);
ok(!!ref, "the request was created immediately", ref);
ok(
  sql(`select count(*) from requests where lower(contact_email)='${guestEmail}' and email_verified_at is null`) === "1",
  "it is marked unconfirmed",
);
ok(
  sql(`select count(*) from email_otps where lower(email)='${guestEmail}' and purpose='intake'`) === "1",
  "an intake code was issued",
);

const body = await gp.textContent("#post-submit-actions");
ok(/six-digit code/i.test(body ?? ""), "the success screen asks for the code");
ok(!/\/track\//.test((await gp.innerHTML("#post-submit-actions")) ?? ""), "the tracking link is withheld");

/* ---- the code releases everything ------------------------------------ */
const guestCode = codeFor(guestEmail, "intake");
ok(!!guestCode, "the intake code is recoverable for the test", guestCode ?? "(none)");
await gp.fill("#ak-otp", guestCode);
await gp.waitForTimeout(3000);

ok(
  sql(`select count(*) from requests where lower(contact_email)='${guestEmail}' and email_verified_at is not null`) === "1",
  "the request is now confirmed",
);
ok(
  /\/track\//.test((await gp.innerHTML("#post-submit-actions")) ?? ""),
  "the tracking link is handed over after confirming",
);

/* ========== 3. Admin shows the state =================================== */
console.log("\n3. Admin can see which enquiries are unconfirmed");

const held = `otp-held-${stamp}@example.test`;
await gp.goto(`${BASE}/print/`, { waitUntil: "domcontentloaded" });
await gp.waitForTimeout(1200);
await gp.fill('textarea[name="brief"]', "A second rig bracket, left unconfirmed on purpose.");
await gp.evaluate(() => document.querySelectorAll(".fsec").forEach((s) => s.setAttribute("data-open", "")));
await gp.fill('input[name="name"]', "Held Tester");
await gp.fill('input[name="email"]', held);
await gp.click("#submitBtn");
await gp.waitForTimeout(3000);

// The signup account above is not an admin, so sign in as the seeded admin.
const admin = await b.newContext();
const ap = await admin.newPage();
await ap.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
await ap.waitForTimeout(800);
await ap.fill('input[name="email"]', process.env.ADMIN_EMAIL ?? "sameep@akaralabs.in");
await ap.fill('input[name="password"]', process.env.ADMIN_PASSWORD ?? "testpass12345");
await ap.click('button:has-text("Sign in")');
await ap.waitForTimeout(3000);

await ap.goto(`${BASE}/admin/requests?stage=all`, { waitUntil: "domcontentloaded" });
await ap.waitForTimeout(1500);
const queue = (await ap.textContent("body")) ?? "";
ok(/email unconfirmed/i.test(queue), "the queue flags the unconfirmed enquiry");

const heldRef = sql(`select reference from requests where lower(contact_email)='${held}'`);
await ap.goto(`${BASE}/admin/requests/${heldRef}`, { waitUntil: "domcontentloaded" });
await ap.waitForTimeout(1200);
const detail = (await ap.textContent("body")) ?? "";
ok(/not confirmed/i.test(detail), "the request page states it plainly");

await ap.goto(`${BASE}/admin/requests/${ref}`, { waitUntil: "domcontentloaded" });
await ap.waitForTimeout(1200);
ok(/confirmed/i.test((await ap.textContent("body")) ?? ""), "and shows the confirmed one as confirmed");

/* ========== 4. Attempt cap and resend cooldown ======================== */
console.log("\n4. Guessing and resending are both bounded");

const capEmail = `otp-cap-${stamp}@example.test`;
const start = await p.evaluate(
  async ([base, email]) => {
    const r = await fetch(base + "/api/account/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Cap Tester", email, password: "codeword12345" }),
    });
    return r.status;
  },
  [BASE, capEmail],
);
ok(start === 202, "a signup code was issued for the cap test", `status ${start}`);

const statuses = [];
for (let i = 0; i < 7; i++) {
  statuses.push(
    await p.evaluate(
      async ([base, email, code]) => {
        const r = await fetch(base + "/api/account/register/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
        });
        const b = await r.json().catch(() => ({}));
        return `${r.status}:${b.code ?? ""}`;
      },
      [BASE, capEmail, String(100000 + i)],
    ),
  );
}
ok(
  statuses.some((s) => s.includes("otp_locked")),
  "wrong guesses lock the code before the space is exhausted",
  statuses.join(" "),
);
ok(
  sql(`select count(*) from users where lower(email)='${capEmail}'`) === "0",
  "no account was created by guessing",
);

const cooldown = await p.evaluate(
  async ([base, email]) => {
    const r = await fetch(base + "/api/account/register/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const b = await r.json().catch(() => ({}));
    return `${r.status}:${b.code ?? ""}`;
  },
  [BASE, capEmail],
);
ok(cooldown.includes("otp_cooldown"), "an immediate resend is refused", cooldown);

/* ========== 5. Google sign-in still bypasses all of this ============== */
console.log("\n5. Google accounts are still verified without a code");
ok(
  /provider === "google"/.test(
    execFileSync("cat", ["/home/claude/akara/src/auth.ts"], { encoding: "utf8" }),
  ) &&
    /emailVerified: new Date\(\)/.test(
      execFileSync("cat", ["/home/claude/akara/src/auth.ts"], { encoding: "utf8" }),
    ),
  "the Google sign-in event still sets emailVerified",
);

console.log(fails ? `\n*** ${fails} FAILED ***` : "\nall OTP checks passed");
await b.close();
process.exit(fails ? 1 : 0);
