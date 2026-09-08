/* Generates one Next route per legacy marketing page. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(
  readFileSync("/home/claude/akara/src/content/legacy/manifest.json", "utf8"),
);
const APP = "/home/claude/akara/src/app";

const lit = (s) => JSON.stringify(s ?? "");

for (const p of manifest) {
  const dir = p.route ? join(APP, "(marketing)", p.route) : join(APP, "(marketing)");
  mkdirSync(dir, { recursive: true });

  // strip the " — Akara Labs" suffix; the root layout's template adds it back
  const title = p.title.replace(/\s*[—-]\s*Akara Labs\s*$/, "").trim();
  const isHome = !p.route;
  const canonical = p.route ? `/${p.route}/` : "/";

  const heroAttr = p.dataHero
    ? `      <script
        dangerouslySetInnerHTML={{
          __html: 'document.documentElement.setAttribute("data-hero",${lit(p.dataHero)})',
        }}
      />\n`
    : "";

  const src = `import type { Metadata } from "next";
import LegacyPage from "@/components/LegacyPage";

export const metadata: Metadata = {
  title: ${isHome ? `{ absolute: ${lit(p.title)} }` : lit(title)},
  description: ${lit(p.description)},
  alternates: { canonical: ${lit(canonical)} },
  openGraph: {
    title: ${lit(p.title)},
    description: ${lit(p.description)},
    url: ${lit(canonical)},
  },
};

export default function Page() {
  return (
    <>
${heroAttr}      <LegacyPage name=${lit(p.name)}${p.mainClass ? ` mainClass=${lit(p.mainClass)}` : ""} />
    </>
  );
}
`;
  writeFileSync(join(dir, "page.tsx"), src, "utf8");
  console.log(`${canonical} -> ${join(dir, "page.tsx").replace(APP, "app")}`);
}
