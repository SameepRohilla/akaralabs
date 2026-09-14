/* Admin CRUD, delete guards, and the password show/hide control.
 *
 *   node tests/admin-crud.mjs
 *
 * Assumes a seeded database and the admin credentials used by the main e2e run.
 */
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3000";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const p = await (await b.newContext()).newPage();
const errs = [];
p.on("pageerror", e => errs.push(e.message.split("\n")[0]));
let fails = 0;
const check = (ok, label, extra="") => { console.log(`${ok?"ok  ":"FAIL"} ${label}${extra?"  "+extra:""}`); if(!ok) fails++; };

await p.goto(BASE + "/signin", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1200);

console.log("=== password show/hide ===");
const eye = await p.$('button[aria-label="Show password"]');
check(!!eye, "eye button present on sign-in");
if (eye) {
  await p.fill('input[name="password"]', "testpass12345");
  check(await p.getAttribute('input[name="password"]', "type") === "password", "starts masked");
  await eye.click(); await p.waitForTimeout(200);
  check(await p.getAttribute('input[name="password"]', "type") === "text", "reveals on click");
  await p.click('button[aria-label="Hide password"]'); await p.waitForTimeout(200);
  check(await p.getAttribute('input[name="password"]', "type") === "password", "hides again");
}
await p.fill('input[name="email"]', "sameep@akaralabs.in");
await p.fill('input[name="password"]', "testpass12345");
await p.click('button:has-text("Sign in")');
await p.waitForTimeout(3500);

console.log("\n=== signup page ===");
const ctx2 = await b.newContext(); const p2 = await ctx2.newPage();
await p2.goto(BASE + "/signup", { waitUntil: "domcontentloaded" }); await p2.waitForTimeout(1200);
check(!!(await p2.$('button[aria-label="Show password"]')), "eye button present on sign-up");
await ctx2.close();

console.log("\n=== admin: workshop machines ===");
await p.goto(BASE + "/admin/workshop", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500);
const machineRows = await p.$$("details.filerow");
check(machineRows.length > 0, "editable rows render", `(${machineRows.length} rows)`);

// open the first machine, edit its name
await machineRows[0].click();
await p.waitForTimeout(600);
const nameInput = await p.$('details.filerow input[name="name"]');
check(!!nameInput, "machine name is editable");
if (nameInput) {
  const before = await nameInput.inputValue();
  await nameInput.fill(before + " EDITED");
  await p.click('details.filerow button:has-text("Save changes")');
  await p.waitForTimeout(2500);
  const html = await p.content();
  check(html.includes(before + " EDITED"), "edit persisted", `("${before}" -> "${before} EDITED")`);
}

console.log("\n=== admin: delete guard ===");
const del = await p.$('button:has-text("Delete machine")');
check(!!del, "delete button present");
if (del) {
  await del.click(); await p.waitForTimeout(300);
  const armed = await p.$('button:has-text("Really delete?")');
  check(!!armed, "first click arms rather than deleting");
  await p.waitForTimeout(4600);
  const disarmed = await p.$('button:has-text("Really delete?")');
  check(!disarmed, "disarms itself after a few seconds");
}

console.log("\n=== admin: filament editable ===");
const spoolInputs = await p.$$('details.filerow input[name="remainingGrams"]');
check(spoolInputs.length > 0, "filament left/cost editable", `(${spoolInputs.length} spools)`);

console.log("\n=== admin: people user id column ===");
await p.goto(BASE + "/admin/people", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
const headers = await p.$$eval("th", ths => ths.map(t => t.textContent.trim()));
check(headers.includes("User ID"), "User ID column header", JSON.stringify(headers));
const idCell = await p.$eval("tbody tr td:nth-child(2) code", el => el.textContent.trim()).catch(()=>null);
check(!!idCell && idCell.length > 10, "id rendered in full", idCell ? `(${idCell.slice(0,12)}…)` : "");

console.log("\n=== admin: journal delete ===");
await p.goto(BASE + "/admin/articles", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
check((await p.$$('button:has-text("Delete")')).length > 0, "journal rows have delete");

if (errs.length) { console.log("\nJS errors:"); [...new Set(errs)].slice(0,5).forEach(e=>console.log("  - "+e.slice(0,130))); }
console.log(fails ? `\n*** ${fails} FAILED ***` : "\nall admin checks passed");
await b.close();
process.exit(fails ? 1 : 0);
