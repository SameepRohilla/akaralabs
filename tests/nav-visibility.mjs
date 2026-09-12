/* Does a page you navigate to actually LOOK loaded?
 *
 * The end-to-end suite asserted on DOM content and passed while every marketing
 * page was rendering completely invisible after a client-side navigation:
 * .reveal starts at opacity:0 and shared.js, which adds the class that reveals
 * it, only ran on first document load. The markup was all present and correctly
 * laid out, so every content assertion was satisfied. You just couldn't see it.
 *
 * So this checks computed opacity, which is the thing a person would notice.
 *
 *   node tests/nav-visibility.mjs            # against localhost:3000
 *   BASE=https://new.akaralabs.in node tests/nav-visibility.mjs
 */
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3000";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const p = await (await b.newContext()).newPage();

const vis = () => p.evaluate(() => {
  const rev = [...document.querySelectorAll("main .reveal")];
  const hidden = rev.filter(el => parseFloat(getComputedStyle(el).opacity) < 0.5);
  return {
    path: location.pathname,
    reveals: rev.length,
    invisible: hidden.length,
    // what a human would actually see
    visibleText: (document.querySelector("main")?.innerText ?? "").trim().length,
  };
});

const PAGES = [["Work","/work/"],["Materials","/materials/"],["About","/about/"],["FAQ","/faq/"]];

console.log("=== direct loads (what a refresh does) ===");
for (const [name, href] of PAGES) {
  await p.goto(BASE + href, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  console.log(" ", name.padEnd(10), await vis());
}

console.log("\n=== client-side navigation from the home page ===");
await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
let bad = 0;
for (const [name, href] of PAGES) {
  await p.click(`a[href="${href}"]`);
  await p.waitForTimeout(2500);
  const v = await vis();
  const ok = v.reveals === 0 || v.invisible === 0;
  if (!ok) bad++;
  console.log(` ${ok ? "ok  " : "FAIL"} ${name.padEnd(10)}`, v);
  await p.click('a[href="/"]').catch(() => p.goto(BASE + "/"));
  await p.waitForTimeout(1500);
}
console.log(bad ? `\n*** ${bad} page(s) invisible after client navigation ***` : "\nall pages visible after client-side navigation");
await b.close();
process.exit(bad ? 1 : 0);
