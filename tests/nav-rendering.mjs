/* Do the blueprint drawings and the page's own script survive a navigation?
 *
 * Two separate failures produced the same report — "it only renders on
 * refresh". The drawings come from art.js, which is idempotent and already
 * exposed window.akaraInjectArt; nothing called it again after the first
 * document load. The project count comes from the page's own script, which was
 * an inline next/script block — those run on the initial document load and not
 * on a client-side navigation, and are cached by id, so even the first
 * navigation worked only once and every later visit did not.
 *
 * Measured on the unfixed build: drawings 13 -> 0 on the first navigation, and
 * the count empty from the second visit onward.
 *
 *   node tests/nav-rendering.mjs
 *   BASE=https://new.akaralabs.in node tests/nav-rendering.mjs
 */
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3000";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const p = await (await b.newContext()).newPage();
let fails = 0;
const check = (ok,l,x="") => { console.log(`${ok?"ok  ":"FAIL"} ${l}${x?"  "+x:""}`); if(!ok) fails++; };

const workState = () => p.evaluate(() => ({
  // the blueprint drawings art.js injects
  artSlots: document.querySelectorAll(".ph[data-art]").length,
  artDrawn: document.querySelectorAll(".ph[data-art] svg.art").length,
  // the count work.js writes
  count: document.getElementById("count")?.textContent?.trim() ?? null,
  filterBtns: document.querySelectorAll(".filter-btn").length,
  items: document.querySelectorAll(".gitem").length,
}));

console.log("=== direct load of /work/ (refresh — the case that always worked) ===");
await p.goto(BASE + "/work/", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
const direct = await workState(); console.log(" ", direct);

console.log("\n=== home -> click Work (the reported case) ===");
await p.goto(BASE + "/", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
await p.click('a[href="/work/"]'); await p.waitForTimeout(3000);
const nav = await workState(); console.log(" ", nav);

console.log();
check(nav.artDrawn === direct.artDrawn && nav.artDrawn > 0, "blueprint drawings render", `direct=${direct.artDrawn} nav=${nav.artDrawn}`);
check(nav.count === direct.count && !!nav.count, "project count renders", `direct="${direct.count}" nav="${nav.count}"`);

console.log("\n=== and the filter buttons actually work after navigating ===");
await p.click('.filter-btn[data-filter="drones"]'); await p.waitForTimeout(800);
const filtered = await workState();
check(filtered.count !== nav.count, "filtering updates the count", `"${nav.count}" -> "${filtered.count}"`);

console.log("\n=== FAQ page script after navigation ===");
await p.click('a[href="/faq/"]'); await p.waitForTimeout(2500);
const faq = await p.evaluate(() => ({
  accordions: document.querySelectorAll(".qa").length,
  navLinks: document.querySelectorAll(".faq-nav a").length,
  active: document.querySelectorAll(".faq-nav a.active").length,
}));
console.log(" ", faq);
check(faq.navLinks === 0 || faq.active > 0, "faq scroll-spy marked a section active");

console.log(fails ? `\n*** ${fails} FAILED ***` : "\nall rendering checks passed");
await b.close(); process.exit(fails?1:0);
