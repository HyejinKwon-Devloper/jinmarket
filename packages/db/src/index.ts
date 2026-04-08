import { config } from "dotenv";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { fileURLToPath } from "node:url";

if (!process.env.VERCEL) {
  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  const envFiles = [
    `../../../.env.${nodeEnv}.local`,
    "../../../.env.local",
    `../../../.env.${nodeEnv}`,
    "../../../.env"
  ];

  for (const envFile of envFiles) {
    config({
      path: fileURLToPath(new URL(envFile, import.meta.url))
    });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __jinmarketPool__: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

if (/db\.example\.supabase\.co/i.test(connectionString) || /example\.com/i.test(connectionString)) {
  throw new Error(
    "DATABASE_URL is still using an example host. Replace it with your real database connection string."
  );
}

function normalizeConnectionString(input: string) {
  try {
    return new URL(input).toString();
  } catch {
    return input;
  }
}

function shouldUseSsl(input: string) {
  try {
    const parsed = new URL(input);
    const sslmode = parsed.searchParams.get("sslmode")?.toLowerCase();
    const isSupabaseHost =
      parsed.hostname.endsWith(".supabase.co") || parsed.hostname.endsWith(".pooler.supabase.com");

    return Boolean(
      isSupabaseHost ||
        (sslmode && ["require", "verify-ca", "verify-full", "prefer"].includes(sslmode))
    );
  } catch {
    return input.includes("sslmode=require");
  }
}

const pool =
  globalThis.__jinmarketPool__ ??
  new Pool({
    connectionString: normalizeConnectionString(connectionString),
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined
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
