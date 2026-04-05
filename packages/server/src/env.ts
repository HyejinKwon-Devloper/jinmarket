import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

if (!process.env.VERCEL) {
  config({
    path: fileURLToPath(new URL("../../../.env", import.meta.url))
  });
}

const devHost = process.env.DEV_HOST || "jinmarket.test";

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
  SELLER_APPROVAL_ADMIN_THREADS_USER_ID: z.string().default(""),
  SELLER_APPROVAL_ADMIN_PASSWORD: z.string().default(""),
  ALLOWED_ORIGINS: z.string().default(defaultAllowedOrigins),
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
  CLOUDINARY_UPLOAD_FOLDER: z.string().default("jinmarket"),
  THREADS_CLIENT_ID: z.string().default(""),
  THREADS_CLIENT_SECRET: z.string().default(""),
  THREADS_REDIRECT_URI: z.string().default(`https://${devHost}:4000/auth/callback`),
  THREADS_AUTH_URL: z.string().default("https://threads.net/oauth/authorize"),
  THREADS_TOKEN_URL: z.string().default("https://graph.threads.net/oauth/access_token"),
  THREADS_USERINFO_URL: z
    .string()
    .default("https://graph.threads.net/me?fields=id,username,name,threads_profile_picture_url,threads_biography")
});

export const env = envSchema.parse(process.env);

export const sellerApprovalAdminThreadsUserId = env.SELLER_APPROVAL_ADMIN_THREADS_USER_ID.trim();

export const allowedOrigins = Array.from(
  new Set(
    env.ALLOWED_ORIGINS.split(",")
      .concat(defaultAllowedOrigins.split(","))
      .map((value) => normalizeOrigin(value.trim()))
      .filter((value): value is string => Boolean(value))
  )
);

export function isThreadsOauthConfigured() {
  return Boolean(
    env.THREADS_CLIENT_ID &&
      env.THREADS_CLIENT_SECRET &&
      env.THREADS_REDIRECT_URI &&
      env.THREADS_AUTH_URL &&
      env.THREADS_TOKEN_URL &&
      env.THREADS_USERINFO_URL
  );
}
