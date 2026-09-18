/* One user action must produce one effect, however many times the page
   effects have been re-run.
 *
 * The rendering fix calls the per-page legacy script again on every route
 * change, which is what makes /print/ and /faq/ work after a client-side
 * navigation. The hazard it introduces is the mirror image: a script that ends
 * in addEventListener, run twice against the same markup, leaves two listeners
 * and one click does the work twice.
 *
 * That is exactly what happened — shared.js calls pageInit on load and
 * LegacyEffects calls it again on mount, so a single click on the print form's
 * submit button created two identical requests. The row count below is the
 * assertion that matters; the listener count is the diagnosis. */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE ?? "http://localhost:3000";
const DB = ["-h", "127.0.0.1", "-U", "akara", "-d", "akara", "-tAX", "-c"];
const sql = (q) => execFileSync("psql", [...DB, q], { encoding: "utf8" }).trim();

let fails = 0;
const ok = (cond, label, extra = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}${extra ? "  " + extra : ""}`);
  if (!cond) fails++;
};

/* /api/intake allows ten submissions an hour from one IP, which is right in
   production and fatal here: this test deliberately submits several times, and
   a throttled run reports "0 requests created" — indistinguishable from the
   double-binding bug it exists to catch, but with the opposite sign. */
sql("delete from rate_limits");

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

async function submitOnce(page, email, brief) {
  await page.fill('textarea[name="brief"]', brief);
  await page.evaluate(() => document.querySelectorAll(".fsec").forEach((s) => s.setAttribute("data-open", "")));
  await page.waitForTimeout(250);
  await page.fill('input[name="name"]', "Bind Tester");
  await page.fill('input[name="email"]', email);
  await page.click("#submitBtn");
  await page.waitForTimeout(3500);
}

const stamp = Date.now();

/* ---- 1. Fresh load: pageInit runs twice (shared.js + LegacyEffects) ---- */
{
  const email = `bind-fresh-${stamp}@example.test`;
  const p = await (await b.newContext()).newPage();
  await p.goto(`${BASE}/print/`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1800);

  const ranTwice = await p.evaluate(() => {
    /* Prove the double call really is happening, so a pass here means the
       guard works rather than that the hazard quietly went away. */
    let n = 0;
    const real = window.akaraPages.print;
    window.akaraPages.print = function () { n++; return real.apply(this, arguments); };
    window.akaraPageInit();
    window.akaraPageInit();
    return n;
  });
  ok(ranTwice === 0, "repeat pageInit calls do not re-run the page script", `ran ${ranTwice} extra time(s)`);

  await submitOnce(p, email, "Fresh-load bracket.");
  const n = sql(`select count(*) from requests where lower(contact_email)='${email}'`);
  ok(n === "1", "one click on a freshly loaded /print/ creates one request", `${n} created`);
  await p.close();
}

/* ---- 2. After navigating in and out and back again --------------------- */
{
  const email = `bind-nav-${stamp}@example.test`;
  const p = await (await b.newContext()).newPage();
  await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500);
  await p.click('a[href="/print/"]').catch(async () => { await p.goto(`${BASE}/print/`); });
  await p.waitForTimeout(1800);
  await p.click('a[href="/work/"]').catch(async () => { await p.goto(`${BASE}/work/`); });
  await p.waitForTimeout(1500);
  await p.click('a[href="/print/"]').catch(async () => { await p.goto(`${BASE}/print/`); });
  await p.waitForTimeout(1800);

  /* The point of the whole exercise: after all that, the form must still
     work at all — and work exactly once. */
  const bound = await p.evaluate(() => !!document.getElementById("submitBtn"));
  ok(bound, "the print form is present after navigating back to it");

  await submitOnce(p, email, "Navigated-to bracket.");
  const n = sql(`select count(*) from requests where lower(contact_email)='${email}'`);
  ok(n === "1", "one click after two navigations creates one request", `${n} created`);
  await p.close();
}

console.log(fails ? `\n*** ${fails} FAILED ***` : "\nno double binding");
await b.close();
process.exit(fails ? 1 : 0);
