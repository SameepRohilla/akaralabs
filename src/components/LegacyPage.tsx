import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Script from "next/script";

const DIR = join(process.cwd(), "src/content/legacy");

async function read(name: string): Promise<string> {
  try {
    return await readFile(join(DIR, name), "utf8");
  } catch {
    return "";
  }
}

/** Renders a marketing page whose markup came across from the static site.
    The HTML and its page-scoped CSS are used verbatim — this is deliberate:
    the design was hand-tuned, and re-authoring it as JSX would be a
    re-implementation risk with no user-visible gain. New surfaces (portal,
    admin, articles) are written as real components. */
export default async function LegacyPage({
  name,
  mainClass,
}: {
  name: string;
  mainClass?: string;
}) {
  const [html, css, js] = await Promise.all([
    read(`${name}.html`),
    read(`${name}.css`),
    read(`${name}.js`),
  ]);

  // The intake wizards call window.akaraSubmit; only those two pages need it,
  // so it isn't in the root layout.
  const needsFormHelper = name === "start" || name === "print";

  return (
    <>
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <main className={mainClass || undefined} dangerouslySetInnerHTML={{ __html: html }} />
      {needsFormHelper ? <Script src="/assets/js/forms.js" strategy="afterInteractive" /> : null}
      {js ? (
        <Script
          id={`legacy-${name}`}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: js }}
        />
      ) : null}
    </>
  );
}

export async function legacyMeta(name: string) {
  const manifest = JSON.parse(await read("manifest.json") || "[]") as {
    name: string;
    title: string;
    description: string;
    dataHero?: string;
  }[];
  return manifest.find((m) => m.name === name);
}
