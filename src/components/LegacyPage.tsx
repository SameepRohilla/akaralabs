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

  /* The page's JavaScript is NOT inlined here any more. next/script with
     strategy="afterInteractive" runs an inline block on the initial document
     load only — never on a client-side navigation — so arriving at this page by
     following a link left its behaviour entirely unbound. It now lives in
     public/assets/js/legacy/<name>.js, registers itself on window.akaraPages,
     and shared.js calls it on every route change. */
  const hasScript = js.length > 0;

  // The intake wizards call window.akaraSubmit; only those two pages need it,
  // so it isn't in the root layout.
  const needsFormHelper = name === "start" || name === "print";

  return (
    <>
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      {/* data-legacy tells shared.js which page script to run after a
          client-side navigation. */}
      <main
        className={mainClass || undefined}
        data-legacy={hasScript ? name : undefined}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {needsFormHelper ? <Script src="/assets/js/forms.js" strategy="afterInteractive" /> : null}
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
