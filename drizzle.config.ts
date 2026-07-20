import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

/**
 * drizzle-kit config — LOCAL TOOLING ONLY (db:generate / db:migrate). Not part
 * of the Next build graph. Reads the DIRECT/UNPOOLED connection from .env.local
 * — never a literal, never committed. CI never runs migrations.
 */
config({ path: ".env.local" });

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  throw new Error(
    "DATABASE_URL_UNPOOLED is not set. Migrations use the DIRECT (unpooled) Neon connection; add it to .env.local (see .env.example).",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
