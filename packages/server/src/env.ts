import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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
  LEGACY_ACCOUNT_ACTIVATION_TOKEN: z.string().default(""),
  SELLER_APPROVAL_ADMIN_LOGIN_ID: z.string().default(""),
  SELLER_APPROVAL_ADMIN_PASSWORD: z.string().default(""),
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
  CLOUDINARY_UPLOAD_FOLDER: z.string().default("jinmarket")
});

export const env = envSchema.parse(process.env);

export const sellerApprovalAdminLoginId = env.SELLER_APPROVAL_ADMIN_LOGIN_ID.trim().toLowerCase();

export const allowedOrigins = Array.from(
  new Set(
    env.ALLOWED_ORIGINS.split(",")
      .concat(defaultAllowedOrigins.split(","))
      .map((value) => normalizeOrigin(value.trim()))
      .filter((value): value is string => Boolean(value))
  )
);
