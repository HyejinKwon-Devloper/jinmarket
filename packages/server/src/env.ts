import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

if (!process.env.VERCEL) {
  function findWorkspaceRoot(startDir: string) {
    let currentDir = startDir;

    while (true) {
      const packageJsonPath = join(currentDir, "package.json");

      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
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
    findWorkspaceRoot(process.cwd()) ?? findWorkspaceRoot(moduleDir) ?? process.cwd();
  const envFiles = [
    `.env.${nodeEnv}.local`,
    ".env.local",
    `.env.${nodeEnv}`,
    ".env"
  ];

  for (const envFile of envFiles) {
    config({
      path: join(workspaceRoot, envFile)
    });
  }
}

const devHost = process.env.DEV_HOST || "jinmarket.test";

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function normalizeOrigin(value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const localDevOrigins = Array.from(
  new Set(
    [devHost, "localhost", "127.0.0.1"].flatMap((host) =>
      [3000, 3001].flatMap((port) => [`https://${host}:${port}`, `http://${host}:${port}`])
    )
  )
);

const defaultAllowedOrigins = Array.from(
  new Set(
    localDevOrigins.concat(
      [
        process.env.NEXT_PUBLIC_SHOP_APP_URL,
        process.env.NEXT_PUBLIC_ADMIN_APP_URL,
        "https://web.jinmarket.shop",
        "https://management.jinmarket.shop"
      ]
        .map((value) => normalizeOrigin(value))
        .filter((value): value is string => Boolean(value))
    )
  )
).join(",");

const envSchema = z.object({
  DEV_HOST: z.string().default(devHost),
  API_PORT: z.coerce.number().default(4000),
  SESSION_COOKIE_NAME: z.string().default("jm_session"),
  SESSION_SECRET: z.string().min(1).default("change-me"),
  BUYER_ACCOUNT_ACTIVATION_TOKEN: z.string().default(""),
  LEGACY_ACCOUNT_ACTIVATION_TOKEN: z.string().default(""),
  SELLER_APPROVAL_ADMIN_LOGIN_ID: z.string().default(""),
  SELLER_APPROVAL_ADMIN_LOGIN_IDS: z.string().default(""),
  SELLER_APPROVAL_AUTH_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(15),
  SELLER_APPROVAL_TOTP_ISSUER: z.string().trim().min(1).default("Jinmarket Admin"),
  SELLER_APPROVAL_TOTP_ENCRYPTION_SECRET: z.string().default(""),
  SIGNUP_VERIFICATION_CODE_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z
    .union([z.boolean(), z.string(), z.number()])
    .transform((value) => parseBoolean(value, false))
    .default(false),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM_EMAIL: z.string().default(""),
  SMTP_FROM_NAME: z.string().default("Jinmarket"),
  ALLOWED_ORIGINS: z.string().default(defaultAllowedOrigins),
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default("jinmarket"),
  NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY: z.string().default(""),
  WEB_PUSH_VAPID_PRIVATE_KEY: z.string().default(""),
  WEB_PUSH_VAPID_SUBJECT: z.string().default("mailto:admin@jinmarket.shop")
});

export const env = envSchema.parse(process.env);

function normalizeLoginIdCandidate(value?: string | null) {
  if (!value) {
    return "";
  }

  return value.trim().replace(/^@+/, "").toLowerCase();
}

export const sellerApprovalAdminLoginIds = new Set(
  [env.SELLER_APPROVAL_ADMIN_LOGIN_IDS, env.SELLER_APPROVAL_ADMIN_LOGIN_ID]
    .flatMap((value) => value.split(","))
    .map((value) => normalizeLoginIdCandidate(value))
    .filter(Boolean)
);

if (process.env.NODE_ENV === "production" && env.SESSION_SECRET.trim() === "change-me") {
  throw new Error("SESSION_SECRET must be set to a strong random value in production.");
}

if (sellerApprovalAdminLoginIds.size > 0 && !env.SELLER_APPROVAL_TOTP_ENCRYPTION_SECRET.trim()) {
  throw new Error(
    "SELLER_APPROVAL_TOTP_ENCRYPTION_SECRET must be set when seller approval OTP admins are configured."
  );
}

export function isSellerApprovalAdminLoginId(loginId?: string | null) {
  const normalized = normalizeLoginIdCandidate(loginId);
  return Boolean(normalized && sellerApprovalAdminLoginIds.has(normalized));
}

export const allowedOrigins = Array.from(
  new Set(
    env.ALLOWED_ORIGINS.split(",")
      .concat(defaultAllowedOrigins.split(","))
      .map((value) => normalizeOrigin(value.trim()))
      .filter((value): value is string => Boolean(value))
  )
);
