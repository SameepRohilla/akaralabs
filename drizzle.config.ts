// drizzle-kit doesn't read .env, so db:generate and db:studio need this too.
import "./src/lib/env-file";
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
} satisfies Config;
