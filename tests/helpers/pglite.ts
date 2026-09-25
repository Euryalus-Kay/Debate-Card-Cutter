import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/server/db/schema";
import { setDatabaseForTests, type DB } from "@/server/db/client";

/** Fresh in-process Postgres with all migrations applied. */
export async function freshDb(): Promise<{ db: DB; close: () => Promise<void> }> {
  const client = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  setDatabaseForTests(db as unknown as DB);
  return {
    db: db as unknown as DB,
    close: async () => {
      setDatabaseForTests(null);
      await client.close();
    },
  };
}
