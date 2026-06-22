import fs from "node:fs/promises";

import { config } from "dotenv";
import pg from "pg";

config({ path: ".env" });

const { Pool } = pg;

function parseArgs(argv) {
  const args = {
    file: "",
    useAdminUrl: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--file") {
      args.file = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (token === "--admin-from-comment") {
      args.useAdminUrl = true;
    }
  }

  if (!args.file) {
    throw new Error("Usage: node scripts/apply-sql-migration.mjs --file <path> [--admin-from-comment]");
  }

  return args;
}

function resolveDatabaseUrl(useAdminUrl, envText) {
  if (useAdminUrl) {
    const adminUrl = envText.match(/^#\s*DATABASE_URL=(.+)$/m)?.[1]?.trim();

    if (!adminUrl) {
      throw new Error("Admin DATABASE_URL comment was not found in .env");
    }

    return adminUrl;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  return process.env.DATABASE_URL;
}

function buildPoolOptions(connectionString) {
  const parsed = new URL(connectionString);
  const sslmode = parsed.searchParams.get("sslmode")?.toLowerCase();
  const useLibpqCompat =
    parsed.searchParams.get("uselibpqcompat")?.toLowerCase() === "true";
  const supabaseHost =
    parsed.hostname.endsWith(".supabase.co") ||
    parsed.hostname.endsWith(".pooler.supabase.com");
  const shouldUseSsl = Boolean(
    supabaseHost || (sslmode && !["disable", "allow"].includes(sslmode)),
  );

  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("uselibpqcompat");

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
    ssl: !shouldUseSsl
      ? undefined
      : shouldVerifyCertificate
        ? {}
        : shouldSkipCertificateVerification
          ? { rejectUnauthorized: false }
          : {},
  };
}

const args = parseArgs(process.argv.slice(2));
const envText = await fs.readFile(".env", "utf8");
const databaseUrl = resolveDatabaseUrl(args.useAdminUrl, envText);
const pool = new Pool(buildPoolOptions(databaseUrl));

try {
  const sql = await fs.readFile(args.file, "utf8");
  await pool.query(sql);
  console.log(`Applied migration: ${args.file}`);
} finally {
  await pool.end();
}
