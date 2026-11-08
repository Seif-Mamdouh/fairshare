import pg from "pg";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
export interface Database {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export function postgresDatabase(url: string): Database {
  const pool = new pg.Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  });
  const wrap = (client: pg.Pool | pg.PoolClient): Database => ({
    query: (text, values) => client.query(text, values),
    async transaction(fn) {
      const connection = await pool.connect();
      try {
        await connection.query("BEGIN");
        const result = await fn(wrap(connection));
        await connection.query("COMMIT");
        return result;
      } catch (e) {
        await connection.query("ROLLBACK");
        throw e;
      } finally {
        connection.release();
      }
    },
    close: () => pool.end(),
  });
  return wrap(pool);
}
export async function localDatabase(path?: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (path) await mkdir(dirname(path), { recursive: true });
  const pg = new PGlite(path);
  const wrap = (connection: any): Database => ({
    query: (text, values = []) => connection.query(text, values),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  });
  return wrap(pg);
}
