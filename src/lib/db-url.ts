/* Explains what is wrong with a DATABASE_URL, without printing the password.
 *
 * postgres.js parses the connection string with the WHATWG URL parser, which
 * fails on an unencoded "/" in the password and throws the two least useful
 * words in this codebase:
 *
 *     migration failed: Invalid URL
 *
 * No mention of which variable, what was wrong with it, or how to fix it — and
 * because the container then restarts, `docker compose exec` can't get in to
 * investigate. That combination is what this exists to prevent.
 *
 * The trap is easy to fall into: `openssl rand -base64 24` emits characters
 * from A-Za-z0-9+/=, and roughly 62% of the passwords it generates contain a
 * "/" or a "+". A "/" ends the authority section, so
 *
 *     postgres://akara:Ab3/xY9@db:5432/akara
 *
 * is not a malformed password, it is a different URL. Use hex.
 */

export type UrlProblem = { message: string; fix: string };

/** Returns null when the URL is usable, or a problem describing what to fix. */
export function diagnoseDatabaseUrl(raw: string | undefined): UrlProblem | null {
  if (!raw || !raw.trim()) {
    return {
      message: "DATABASE_URL is not set",
      fix: "Add it to .env — see .env.example",
    };
  }

  const url = raw.trim();

  // A value quoted in .env arrives with the quotes attached; the URL parser
  // then fails on something the file looks perfectly reasonable about.
  if (/^["']|["']$/.test(url)) {
    return {
      message: "DATABASE_URL is wrapped in quotes",
      fix: 'Remove the surrounding " or \' — .env values are literal, so the quotes become part of the string',
    };
  }

  if (!/^postgres(ql)?:\/\//i.test(url)) {
    return {
      message: `DATABASE_URL doesn't start with postgres:// (got "${url.slice(0, 12)}…")`,
      fix: "It should look like postgres://user:password@host:5432/dbname",
    };
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname) {
      return { message: "DATABASE_URL has no hostname", fix: "postgres://user:password@HOST:5432/dbname" };
    }
    if (!parsed.pathname || parsed.pathname === "/") {
      return {
        message: "DATABASE_URL has no database name",
        fix: `Add it after the port: postgres://…@${parsed.hostname}:${parsed.port || 5432}/akara`,
      };
    }
    // Parses fine, but is obviously still the example value. Left alone, this
    // spends 60 seconds retrying and then fails on authentication, which reads
    // like a networking problem rather than an unedited file.
    const password = decodeURIComponent(parsed.password || "");
    if (/^(CHANGE_ME|changeme|password|secret|your[-_]?password)$/i.test(password)) {
      return {
        message: `DATABASE_URL still has the placeholder password ("${password}")`,
        fix: "Generate one with: openssl rand -hex 24 — and set it in BOTH POSTGRES_PASSWORD and DATABASE_URL",
      };
    }
    /* A missing password is NOT an error: trust and peer authentication, and
       PGPASSWORD/.pgpass, are all legitimate and common in local development.
       An earlier version of this flagged it and rejected a perfectly good
       local connection string. */

    return null;
  } catch {
    // It didn't parse. The password is the overwhelmingly likely reason, so
    // check that specifically rather than reporting "Invalid URL" again.
    const afterScheme = url.replace(/^postgres(ql)?:\/\//i, "");
    const at = afterScheme.lastIndexOf("@");
    const credentials = at > 0 ? afterScheme.slice(0, at) : "";
    const colon = credentials.indexOf(":");
    const password = colon >= 0 ? credentials.slice(colon + 1) : "";

    const offenders = [...new Set((password.match(/[/?#[\]@ ]/g) ?? []))];
    if (offenders.length) {
      return {
        message: `the password in DATABASE_URL contains ${offenders
          .map((c) => (c === " " ? "a space" : `"${c}"`))
          .join(", ")}, which cannot appear unencoded in a connection string`,
        fix:
          "Generate a URL-safe password instead — openssl rand -hex 24 — and set it in BOTH " +
          "POSTGRES_PASSWORD and DATABASE_URL. This is nearly always `openssl rand -base64`: " +
          'it emits "/" in about 40% of passwords, and a "/" ends the authority section, so the ' +
          "string stops being the URL you meant.",
      };
    }

    return {
      message: "DATABASE_URL is not a valid URL",
      fix: "Expected postgres://user:password@host:5432/dbname — check for stray spaces or line breaks",
    };
  }
}

/** The URL with its password replaced, safe to print in a log. */
export function redactDatabaseUrl(raw: string): string {
  return raw.replace(/^(postgres(?:ql)?:\/\/[^:/@]+:)[^@]*(@)/i, "$1••••••$2");
}
