/* Loads .env into process.env for scripts that Next.js doesn't start.
 *
 * `next dev` and `next build` read .env themselves, so app code never needs
 * this. The standalone entry points — preflight, migrate, seed, and
 * drizzle-kit — do not, which meant `npm run preflight` reported every
 * variable missing even with a filled-in .env sitting right next to it, and
 * `npm run db:migrate` failed with "DATABASE_URL is not set" for the same
 * reason. Both looked like configuration mistakes rather than a missing
 * loader, which is the worst kind of error to hand someone on their first run.
 *
 * Import this FIRST, before anything that reads process.env at module scope:
 *
 *     import "@/lib/env-file";
 *
 * Deliberately dependency-free — these scripts get bundled for the runtime
 * image, and a loader is not worth another package in that graph.
 *
 * Rules:
 *   - a variable already in the environment always wins, so docker compose,
 *     GitHub Actions and `DATABASE_URL=… npm run x` override the file
 *   - a missing .env is fine and silent; that is the normal case in a
 *     container, where the environment comes from compose
 *
 * Server-only: it touches node:fs. Never import it from a client component.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** Parse .env text. Supports `export `, quotes, `#` comments, blank lines. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 1) continue;

    const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eq + 1).trim();

    // Quoted values keep their inner '#' and whitespace; unquoted ones stop at
    // an inline comment. Getting this wrong truncates a password at the first
    // '#' character, which is a genuinely horrible thing to debug.
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"');
    } else {
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash).trim();
    }

    out[key] = value;
  }

  return out;
}

/** Load one env file if present. Returns the keys it actually set. */
export function loadEnvFile(file: string): string[] {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return [];

  let parsed: Record<string, string>;
  try {
    parsed = parseEnv(readFileSync(path, "utf8"));
  } catch (err) {
    console.warn(`[env] could not read ${file}: ${err instanceof Error ? err.message : err}`);
    return [];
  }

  const applied: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      applied.push(key);
    }
  }

  return applied;
}

/* Same order of precedence Next.js uses, so these scripts and `next dev` agree
   about which file wins: .env.local overrides .env. First writer wins here, so
   the more specific file is read first. Reading both matters — local work is
   set up in .env.local and the server uses .env, and a loader that only knew
   about one of them would fail on the other. */
const ENV_FILES = process.env.ENV_FILE ? [process.env.ENV_FILE] : [".env.local", ".env"];

const sources: string[] = [];
let count = 0;
for (const file of ENV_FILES) {
  const applied = loadEnvFile(file);
  if (applied.length) {
    sources.push(file);
    count += applied.length;
  }
}

if (count && process.env.ENV_QUIET !== "1") {
  console.log(`[env] loaded ${count} variable(s) from ${sources.join(" + ")}`);
}
