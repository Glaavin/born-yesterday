import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

/**
 * Runtime DB client — LAZY by design.
 *
 * Uses the POOLED connection (DATABASE_URL) for the serverless runtime. Nothing
 * connects at import or build time: getDb() is only invoked inside request
 * handlers, so `next build` — and CI, which has no database — never opens a
 * connection. See docs/conventions.md.
 */
let db: NeonHttpDatabase<typeof schema> | undefined;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. The runtime DB client needs the POOLED Neon connection string (see .env.example).",
      );
    }
    db = drizzle(neon(url), { schema });
  }
  return db;
}
