/* Marketing site -> dashboard -> back, as a real client-side navigation.
 *
 * The nav is a React component, so that round trip destroys and rebuilds it —
 * and the theme toggle, language switch and hero are injected by shared.js,
 * which only ran on the first document load. Coming back from the dashboard
 * left all three missing.
 *
 * The click in step 3 MUST be a client-side navigation. A page.goto() here is a
 * full reload, which re-runs shared.js and passes trivially, proving nothing —
 * the first version of this test did exactly that.
 *
 *   node tests/nav-roundtrip.mjs
 *   BASE=https://new.akaralabs.in node tests/nav-roundtrip.mjs
 */
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3000";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const p = await (await b.newContext()).newPage();

const state = () => p.evaluate(() => ({
  path: location.pathname,
  themeToggle: document.querySelectorAll(".theme-toggle").length,
  langSwitch: document.querySelectorAll(".lang-switch").length,
  navToggle: document.querySelectorAll(".nav-toggle").length,
  heroDiscs: document.getElementById("hero-object")?.children.length ?? -1,
  heroBars: document.getElementById("hero-elevation")?.children.length ?? -1,
  invisibleReveals: [...document.querySelectorAll("main .reveal")]
    .filter(el => parseFloat(getComputedStyle(el).opacity) < 0.5).length,
}));

console.log("=== 1. fresh load of home (baseline) ===");
await p.goto(BASE + "/", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
const baseline = await state(); console.log(baseline);

console.log("\n=== 2. sign in -> dashboard ===");
await p.goto(BASE + "/signin", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
await p.fill('input[name="email"]', "sameep@akaralabs.in");
await p.fill('input[name="password"]', "testpass12345");
await p.click('button:has-text("Sign in")');
await p.waitForTimeout(3500);
console.log(await state());

console.log("\n=== 3. back to the site ===");
// MUST be a client-side navigation — a p.goto() is a full page load and would
// pass trivially, proving nothing. AppShell renders <Link href="/"> twice.
await p.click('.side-link[href="/"]', { timeout: 5000 }).catch(async () => {
  await p.click('a.logo[href="/"]', { timeout: 5000 });
});
const hardNav = await p.evaluate(() => performance.getEntriesByType("navigation").length);
console.log("   navigation entries (1 = no reload, i.e. client-side):", hardNav);
await p.waitForTimeout(3000);
const back = await state();
console.log(back);

console.log("\n=== DIFF vs baseline ===");
let bad = 0;
for (const k of Object.keys(baseline)) {
  if (k === "path") continue;
  const same = baseline[k] === back[k];
  if (!same) bad++;
  console.log(`${same ? "ok  " : "FAIL"} ${k.padEnd(18)} fresh=${baseline[k]}  round-trip=${back[k]}`);
}
console.log(bad ? `\n*** ${bad} broken ***` : "\neverything re-initialised correctly");
await b.close();
process.exit(bad ? 1 : 0);
