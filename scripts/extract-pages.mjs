/* Converts the legacy static pages into Next.js routes.
   The <main> markup and the per-page <style> block are preserved verbatim —
   only the shell (nav, footer, head, scripts) is replaced by React. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const SRC = "/home/claude/src-static";
const OUT = "/home/claude/akara/src/app";
const CONTENT = "/home/claude/akara/src/content/legacy";

const PAGES = [
  { file: "index.html", route: "", name: "home" },
  { file: "work/index.html", route: "work", name: "work" },
  { file: "about/index.html", route: "about", name: "about" },
  { file: "materials/index.html", route: "materials", name: "materials" },
  { file: "faq/index.html", route: "faq", name: "faq" },
  { file: "start/index.html", route: "start", name: "start" },
  { file: "print/index.html", route: "print", name: "print" },
];

const pick = (re, html) => { const m = html.match(re); return m ? m[1].trim() : ""; };

function fixLinks(html, depth) {
  // Legacy pages use relative links ("start/", "../work/"). Next needs root-absolute.
  return html
    .replace(/(href|src)="\.\.\/assets\//g, '$1="/assets/')
    .replace(/(href|src)="assets\//g, '$1="/assets/')
    .replace(/href="\.\.\/([a-z]+)\/"/g, 'href="/$1/"')
    .replace(/href="\.\.\/"/g, 'href="/"')
    .replace(/href="\.\/"/g, 'href="/"')
    .replace(/href="(work|about|materials|faq|start|print)\/"/g, 'href="/$1/"');
}

const manifest = [];

for (const p of PAGES) {
  const html = readFileSync(join(SRC, p.file), "utf8");
  const depth = p.route ? 1 : 0;

  const title = pick(/<title>([\s\S]*?)<\/title>/, html);
  const description = pick(/<meta name="description" content="([\s\S]*?)"\s*\/?>/, html);
  const htmlAttrs = pick(/<html\s+lang="en"([^>]*)>/, html);
  const dataLogo = pick(/data-logo="([^"]*)"/, html) || "wordmark";
  const dataHero = pick(/data-hero="([^"]*)"/, html) || "";

  // per-page <style> block(s) that sit between </head>-ish and <body>
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");

  // <main ...> ... </main>  — /start and /print carry a class on it
  const mainOpen = html.match(/<main([^>]*)>/);
  const mainClass = mainOpen ? (mainOpen[1].match(/class="([^"]*)"/)?.[1] ?? "") : "";
  let main = pick(/<main[^>]*>([\s\S]*?)<\/main>/, html);
  if (!main) throw new Error(`no <main> found in ${p.file}`);
  main = fixLinks(main, depth);

  // page-local behaviour scripts that live after </main> (the /start and
  // /print step wizards). External <script src> tags are dropped — the root
  // layout loads those once.
  const tail = html.split("</main>")[1] || "";
  const inline = [...tail.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");

  mkdirSync(CONTENT, { recursive: true });
  writeFileSync(join(CONTENT, `${p.name}.html`), main, "utf8");
  writeFileSync(join(CONTENT, `${p.name}.css`), styles, "utf8");
  if (inline.trim()) writeFileSync(join(CONTENT, `${p.name}.js`), inline, "utf8");

  manifest.push({ ...p, title, description, dataLogo, dataHero, mainClass });
}

writeFileSync(join(CONTENT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(manifest.map((m) => `${m.route || "/"}  ${m.title}`).join("\n"));
