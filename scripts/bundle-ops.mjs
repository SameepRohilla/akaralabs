/* Bundles the operational scripts (migrate, seed, preflight) into standalone
   CommonJS files at build time.
 *
 * Why: the runner image previously shipped tsx + esbuild + a hand-picked list
 * of node_modules so it could execute TypeScript. That list is fragile — it
 * silently omitted esbuild's platform binary (@esbuild/linux-x64), which meant
 * tsx couldn't start, which meant migrations couldn't run, which meant the
 * container never booted. A cherry-picked dependency list will drift again the
 * next time an import is added.
 *
 * Bundling instead means the runner needs nothing but `node` — no TS runtime,
 * no platform-specific binaries, ~40 MB smaller, and one fewer class of
 * failure between a push and a working deploy.
 */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

const targets = [
  { in: "src/db/migrate.ts", out: "ops/migrate.cjs" },
  { in: "src/db/seed.ts", out: "ops/seed.cjs" },
  { in: "scripts/preflight.ts", out: "ops/preflight.cjs" },
];

mkdirSync("ops", { recursive: true });

for (const t of targets) {
  await build({
    entryPoints: [t.in],
    outfile: t.out,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    // The optional native accelerator for postgres.js — not installed, and the
    // pure-JS path is what we use anyway.
    external: ["pg-native"],
    // Resolve the @/* alias the same way tsconfig does.
    tsconfig: "tsconfig.json",
    logLevel: "warning",
    minify: false, // these get read when something is wrong; keep them legible
  });
  console.log(`bundled ${t.in} -> ${t.out}`);
}
