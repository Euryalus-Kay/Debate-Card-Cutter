/**
 * Database access.
 *
 * Production: Neon over HTTP (stateless, one round trip per query; multi-
 * statement atomic writes use db.batch, which Neon runs in a transaction).
 * Tests: PGlite (in-process Postgres) with the same schema and migrations.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema";

export type Schema = typeof schema;
export type DB = NeonHttpDatabase<Schema> | PgliteDatabase<Schema>;

let override: DB | null = null;
let neonDb: NeonHttpDatabase<Schema> | null = null;

export function db(): DB {
  if (override) return override;
  if (!neonDb) {
    // Production has its own database (APP_DATABASE_URL); previews and local development use DATABASE_URL.
    const url = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured.");
    neonDb = drizzleNeon({ client: neon(url), schema });
  }
  return neonDb;
}

/** Test hook: route all queries to another database (PGlite). */
export function setDatabaseForTests(d: DB | null) {
  override = d;
}

function isNeon(d: DB): d is NeonHttpDatabase<Schema> {
  return typeof (d as NeonHttpDatabase<Schema>).batch === "function" && !("$client" in d && (d as { $client: unknown }).$client?.constructor?.name === "PGlite");
}

/**
 * Execute several write statements atomically. Statements are built by the
 * callback against the given handle so they can run inside a transaction.
 */
export async function atomic(build: (d: DB) => BatchItem<"pg">[]): Promise<void> {
  const d = db();
  if (isNeon(d)) {
    const items = build(d);
    if (items.length === 0) return;
    await d.batch(items as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    return;
  }
  await (d as PgliteDatabase<Schema>).transaction(async (tx) => {
    for (const q of build(tx as unknown as DB)) await q;
  });
}

export { schema };
