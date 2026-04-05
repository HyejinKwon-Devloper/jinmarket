import { config } from "dotenv";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { fileURLToPath } from "node:url";

if (!process.env.VERCEL) {
  config({
    path: fileURLToPath(new URL("../../../.env", import.meta.url))
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __jinmarketPool__: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const pool =
  globalThis.__jinmarketPool__ ??
  new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined
  });

if (!globalThis.__jinmarketPool__) {
  globalThis.__jinmarketPool__ = pool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type DbClient = PoolClient;
