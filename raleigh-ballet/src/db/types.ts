import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Works for both the real Postgres driver and the in-memory one used by tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
/** A database handle or an open transaction. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;
