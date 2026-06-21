import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { fileURLToPath } from "node:url";

if (!process.env.VERCEL) {
  function findWorkspaceRoot(startDir: string) {
    let currentDir = startDir;

    while (true) {
      const packageJsonPath = join(currentDir, "package.json");

      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            readFileSync(packageJsonPath, "utf8"),
          ) as {
            workspaces?: unknown;
          };

          if (packageJson.workspaces) {
            return currentDir;
          }
        } catch {
          // Ignore malformed package.json while walking upward.
        }
      }

      const parentDir = dirname(currentDir);

      if (parentDir === currentDir) {
        return null;
      }

      currentDir = parentDir;
    }
  }

  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const workspaceRoot =
    findWorkspaceRoot(process.cwd()) ??
    findWorkspaceRoot(moduleDir) ??
    process.cwd();
  const envFiles = [
    `.env.${nodeEnv}.local`,
    ".env.local",
    `.env.${nodeEnv}`,
    ".env",
  ];

  for (const envFile of envFiles) {
    config({
      path: join(workspaceRoot, envFile),
    });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __jinmarketPool__: Pool | undefined;
}

type DbContextStore = {
  client: PoolClient | null;
  requestContext: DbRequestContext | null;
};

export type DbRequestContext = {
  userId?: string | null;
  roles?: string[];
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

if (
  /db\.example\.supabase\.co/i.test(connectionString) ||
  /example\.com/i.test(connectionString)
) {
  throw new Error(
    "DATABASE_URL is still using an example host. Replace it with your real database connection string.",
  );
}

function normalizeConnectionString(input: string) {
  try {
    return new URL(input).toString();
  } catch {
    return input;
  }
}

function isSupabaseHost(hostname: string) {
  return (
    hostname.endsWith(".supabase.co") ||
    hostname.endsWith(".pooler.supabase.com")
  );
}

function buildPoolOptions(input: string) {
  try {
    const parsed = new URL(input);
    const sslmode = parsed.searchParams.get("sslmode")?.toLowerCase();
    const useLibpqCompat =
      parsed.searchParams.get("uselibpqcompat")?.toLowerCase() === "true";
    const supabaseHost = isSupabaseHost(parsed.hostname);
    const shouldUseSsl = Boolean(
      supabaseHost || (sslmode && !["disable", "allow"].includes(sslmode)),
    );

    // pg-connection-string consumes sslmode from the connection string and can overwrite
    // the explicit ssl config we pass to pg. Remove it here so our behavior stays predictable.
    parsed.searchParams.delete("sslmode");
    parsed.searchParams.delete("uselibpqcompat");

    if (!shouldUseSsl) {
      return {
        connectionString: parsed.toString(),
        ssl: undefined,
      };
    }

    const shouldVerifyCertificate =
      sslmode === "verify-ca" ||
      sslmode === "verify-full" ||
      sslmode === "verify_identity";
    const shouldSkipCertificateVerification =
      supabaseHost ||
      sslmode === "no-verify" ||
      sslmode === "prefer" ||
      sslmode === "require" ||
      (useLibpqCompat && sslmode === "require");

    return {
      connectionString: parsed.toString(),
      ssl: shouldVerifyCertificate
        ? {}
        : shouldSkipCertificateVerification
          ? { rejectUnauthorized: false }
          : {},
    };
  } catch {
    return {
      connectionString: input,
      ssl: input.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
    };
  }
}

const poolOptions = buildPoolOptions(connectionString);

const pool =
  globalThis.__jinmarketPool__ ??
  new Pool({
    connectionString: normalizeConnectionString(poolOptions.connectionString),
    ssl: poolOptions.ssl,
  });

if (!globalThis.__jinmarketPool__) {
  globalThis.__jinmarketPool__ = pool;
}

const dbContextStorage = new AsyncLocalStorage<DbContextStore>();

function getDbContextStore(): DbContextStore {
  return dbContextStorage.getStore() ?? { client: null, requestContext: null };
}

async function applyDbContext(
  client: PoolClient,
  requestContext: DbRequestContext | null,
) {
  if (!requestContext) {
    return;
  }

  await client.query(
    `
      SELECT
        set_config('app.user_id', $1, true),
        set_config('app.roles', $2, true)
    `,
    [requestContext.userId ?? "", (requestContext.roles ?? []).join(",")],
  );
}

export function runWithDbContext<T>(
  requestContext: DbRequestContext | null,
  callback: () => T,
): T {
  const activeStore = getDbContextStore();

  return dbContextStorage.run(
    {
      client: activeStore.client,
      requestContext,
    },
    callback,
  );
}

export function runWithAdditionalDbRoles<T>(
  roles: string[],
  callback: () => T,
): T {
  const activeStore = getDbContextStore();
  const mergedRoles = [
    ...new Set([...(activeStore.requestContext?.roles ?? []), ...roles]),
  ];

  return dbContextStorage.run(
    {
      client: activeStore.client,
      requestContext: {
        userId: activeStore.requestContext?.userId ?? null,
        roles: mergedRoles,
      },
    },
    callback,
  );
}

export function runWithSystemDbContext<T>(callback: () => T): T {
  return runWithAdditionalDbRoles(["SYSTEM"], callback);
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  const store = getDbContextStore();

  if (store.client) {
    return store.client.query<T>(text, params);
  }

  if (!store.requestContext) {
    return pool.query<T>(text, params);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await applyDbContext(client, store.requestContext);
    const result = await client.query<T>(text, params);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
) {
  const store = getDbContextStore();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await applyDbContext(client, store.requestContext);
    const result = await dbContextStorage.run(
      {
        client,
        requestContext: store.requestContext,
      },
      async () => callback(client),
    );
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
