import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import type { Db } from "./types";

// One connection pool for the whole server (kept across hot reloads in dev).
const g = globalThis as unknown as { __rsbSql?: ReturnType<typeof postgres> };

function client() {
  if (!g.__rsbSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // prepare:false keeps us compatible with Supabase's transaction pooler.
    g.__rsbSql = postgres(url, { prepare: false, max: 5 });
  }
  return g.__rsbSql;
}

let _db: Db | undefined;
/** The database handle. Connects as the server (bypasses RLS) — every caller must check permissions first. */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    _db ??= drizzle(client(), { schema }) as unknown as Db;
    const v = (_db as unknown as Record<string | symbol, unknown>)[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(_db) : v;
  },
});
export { schema };
