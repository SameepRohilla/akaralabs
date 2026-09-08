/* Post-extraction patches to the /start and /print wizards.
   Kept as a script so re-running the extractor never silently drops them.
   Each patch asserts its target exists — a legacy markup change fails loudly
   instead of shipping a half-wired form. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "/home/claude/akara/src/content/legacy";

function edit(file, patches) {
  const path = join(DIR, file);
  let src = readFileSync(path, "utf8");
  for (const [name, find, replace] of patches) {
    if (src.includes(replace)) {
      console.log(`  ${file}: ${name} (already applied)`);
      continue;
    }
    if (!src.includes(find)) throw new Error(`${file}: patch "${name}" — target not found`);
    src = src.replace(find, replace);
    console.log(`  ${file}: ${name}`);
  }
  writeFileSync(path, src, "utf8");
}

/* ---- /start ---------------------------------------------------------- */

edit("start.js", [
  [
    "use the server-issued reference",
    "window.akaraSubmit(fields, files).then(function () {",
    "window.akaraSubmit(fields, files).then(function (data) {\n      if (data && data.reference) ref = data.reference;\n      if (window.akaraAfterSubmit) window.akaraAfterSubmit(data);",
  ],
]);

edit("start.html", [
  [
    "post-submit actions slot",
    '<a class="btn btn-ghost" href="/work/" style="margin-top:24px">Meanwhile, see our work →</a>',
    '<div id="post-submit-actions" class="hero-cta" style="margin-top:24px;justify-content:center"></div>\n        <a class="btn btn-ghost" href="/work/" style="margin-top:14px">Meanwhile, see our work →</a>',
  ],
]);

/* ---- /print ---------------------------------------------------------- */

edit("print.js", [
  [
    "use the server-issued reference",
    "window.akaraSubmit(fields, files).then(function () {",
    "window.akaraSubmit(fields, files).then(function (data) {\n      if (data && data.reference) ref = data.reference;\n      if (window.akaraAfterSubmit) window.akaraAfterSubmit(data);",
  ],
]);

edit("print.html", [
  [
    "post-submit actions slot",
    '<a class="btn btn-ghost" href="/materials/" style="margin-top:24px">Read the materials guide →</a>',
    '<div id="post-submit-actions" class="hero-cta" style="margin-top:24px;justify-content:center"></div>\n        <a class="btn btn-ghost" href="/materials/" style="margin-top:14px">Read the materials guide →</a>',
  ],
]);

console.log("wizard patches applied");
