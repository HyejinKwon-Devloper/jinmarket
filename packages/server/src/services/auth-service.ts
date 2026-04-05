import type { Response } from "express";
import { z } from "zod";
import { createHash, timingSafeEqual } from "node:crypto";

import {
  query,
  withTransaction,
  type DbClient,
} from "../../../db/src/index.js";
import type { SessionUser } from "../../../shared/src/index.js";

import { AppError } from "../errors.js";
import {
  allowedOrigins,
  env,
  isThreadsOauthConfigured,
  sellerApprovalAdminThreadsUserId,
} from "../env.js";
import {
  addDays,
  generateSessionToken,
  hashSessionToken,
} from "../utils/auth.js";

export const threadsOauthStateCookieName = "jm_threads_oauth_state";
export const sellerApprovalAuthCookieName = "jm_seller_approval_auth";

const oauthStateSchema = z.object({
  nonce: z.string().min(20),
  returnTo: z.string().url(),
});

const shortLivedTokenSchema = z.object({
  access_token: z.string().min(1),
  user_id: z.coerce.string().min(1),
});

const longLivedTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().positive(),
  token_type: z.string().optional(),
});

const threadsProfileSchema = z.object({
  id: z.coerce.string().min(1),
  username: z.string().trim().min(1),
  name: z.string().trim().optional().nullable(),
  threads_profile_picture_url: z.string().trim().url().optional().nullable(),
});

type SessionUserRow = {
  id: string;
  display_name: string;
  email: string | null;
  threads_username: string | null;
  roles: string[] | null;
};

type ThreadsIdentity = {
  providerUserId: string;
  username: string;
  displayName: string;
  email?: string | null;
  profileImageUrl?: string | null;
};

function mapSessionUser(row: SessionUserRow): SessionUser {
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    threadsUsername: row.threads_username,
    roles: row.roles ?? [],
  };
}

function normalizeThreadsUsername(rawUsername: string) {
  const normalized = rawUsername.trim().replace(/^@+/, "").toLowerCase();

  if (normalized.length < 2 || normalized.length > 120) {
    throw new AppError("올바른 Threads 아이디를 입력해 주세요.", 400);
  }

  return normalized;
}

function isSecureCookie() {
  return env.THREADS_REDIRECT_URI.startsWith("https://");
}

function cookieOptions(expires?: Date) {
  const secure = isSecureCookie();

  return {
    httpOnly: true,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    secure,
    path: "/",
    ...(expires ? { expires } : {}),
  };
}

function compareSecret(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getSellerApprovalCookieValue(sessionToken: string, userId: string) {
  return createHash("sha256")
    .update(
      `${sessionToken}:${userId}:${env.SELLER_APPROVAL_ADMIN_PASSWORD}:${env.SESSION_SECRET}`,
    )
    .digest("hex");
}

function encodeOauthState(state: z.infer<typeof oauthStateSchema>) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

function readThreadsOauthState(rawValue?: string | null) {
  if (!rawValue) {
    return null;
  }

  try {
    const decoded = Buffer.from(rawValue, "base64url").toString("utf8");
    return oauthStateSchema.parse(JSON.parse(decoded));
  } catch {
    return null;
  }
}

function normalizeReturnTo(returnTo?: string) {
  const fallbackOrigin = allowedOrigins[0] ?? "https://localhost:3000";

  if (!returnTo) {
    return new URL("/", fallbackOrigin).toString();
  }

  try {
    const url = new URL(returnTo);
    if (allowedOrigins.includes(url.origin)) {
      return url.toString();
    }
  } catch {
    // Ignore malformed URLs and fall back.
  }

  return new URL("/", fallbackOrigin).toString();
}

function getLoginPageUrl(returnTo?: string | null) {
  const fallbackOrigin = allowedOrigins[0] ?? "https://localhost:3000";
  const normalized = normalizeReturnTo(returnTo ?? undefined);
  const origin = new URL(normalized).origin || fallbackOrigin;
  return new URL("/login", origin);
}

async function getUserBySessionHash(sessionHash: string) {
  const result = await query<SessionUserRow>(
    `
      SELECT
        u.id,
        u.display_name,
        u.email,
        aa.provider_username AS threads_username,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT ur.role::text), NULL) AS roles
      FROM user_sessions us
      JOIN users u ON u.id = us.user_id
      LEFT JOIN auth_accounts aa ON aa.user_id = u.id AND aa.provider = 'THREADS'
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE us.session_token_hash = $1
        AND us.revoked_at IS NULL
        AND us.expires_at > NOW()
      GROUP BY u.id, aa.provider_username
    `,
    [sessionHash],
  );

  return result.rows[0] ? mapSessionUser(result.rows[0]) : null;
}

async function fetchJsonOrThrow<T>(
  response: globalThis.Response,
  schema: z.ZodSchema<T>,
  fallbackMessage: string,
) {
  const rawText = await response.text();
  let payload: unknown = {};

  if (rawText) {
    try {
      payload = JSON.parse(rawText) as unknown;
    } catch {
      payload = { message: rawText };
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null
        ? (((payload as Record<string, unknown>).error_message as
            | string
            | undefined) ??
          ((payload as Record<string, unknown>).message as
            | string
            | undefined) ??
          fallbackMessage)
        : fallbackMessage;

    throw new AppError(message, 502);
  }

  return schema.parse(payload);
}

async function exchangeCodeForShortLivedToken(code: string) {
  const body = new URLSearchParams({
    client_id: env.THREADS_CLIENT_ID,
    client_secret: env.THREADS_CLIENT_SECRET,
    grant_type: "authorization_code",
    redirect_uri: env.THREADS_REDIRECT_URI,
    code,
  });

  const response = await fetch(env.THREADS_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  return fetchJsonOrThrow(
    response,
    shortLivedTokenSchema,
    "Failed to exchange the Threads authorization code.",
  );
}

async function exchangeForLongLivedToken(accessToken: string) {
  const url = new URL("/access_token", new URL(env.THREADS_TOKEN_URL).origin);
  url.searchParams.set("grant_type", "th_exchange_token");
  url.searchParams.set("client_secret", env.THREADS_CLIENT_SECRET);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  return fetchJsonOrThrow(
    response,
    longLivedTokenSchema,
    "Failed to exchange a long-lived Threads token.",
  );
}

async function fetchThreadsProfile(accessToken: string) {
  const url = new URL(env.THREADS_USERINFO_URL);
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  return fetchJsonOrThrow(
    response,
    threadsProfileSchema,
    "Failed to load the Threads profile.",
  );
}

async function loadSessionUserById(client: DbClient, userId: string) {
  const result = await client.query<SessionUserRow>(
    `
      SELECT
        u.id,
        u.display_name,
        u.email,
        aa.provider_username AS threads_username,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT ur.role::text), NULL) AS roles
      FROM users u
      LEFT JOIN auth_accounts aa ON aa.user_id = u.id AND aa.provider = 'THREADS'
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id, aa.provider_username
    `,
    [userId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError("Failed to load the logged-in user.", 500);
  }

  return mapSessionUser(row);
}

async function createSessionForUserId(client: DbClient, userId: string) {
  const sessionToken = generateSessionToken();
  const expiresAt = addDays(30);

  await client.query(
    `
      INSERT INTO user_sessions (user_id, session_token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [userId, hashSessionToken(sessionToken), expiresAt],
  );

  await client.query(
    `
      UPDATE users
      SET last_login_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId],
  );

  return {
    user: await loadSessionUserById(client, userId),
    sessionToken,
    expiresAt,
  };
}

export async function ensureSellerProfile(
  client: DbClient,
  userId: string,
  displayName: string,
) {
  await client.query(
    `
      INSERT INTO seller_profiles (
        user_id,
        shop_name,
        bank_name,
        bank_account_holder,
        bank_account_number_encrypted
      )
      VALUES ($1, $2, 'TO_BE_UPDATED', 'TO_BE_UPDATED', 'TO_BE_UPDATED')
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId, `${displayName} Shop`],
  );
}

async function createSessionForThreadsIdentity(identity: ThreadsIdentity) {
  return withTransaction(async (client) => {
    const normalizedUsername = normalizeThreadsUsername(identity.username);
    const isApprovalAdmin =
      Boolean(sellerApprovalAdminThreadsUserId) &&
      identity.providerUserId === sellerApprovalAdminThreadsUserId;
    const existingAuth = await client.query<{ user_id: string }>(
      `
        SELECT user_id
        FROM auth_accounts
        WHERE provider = 'THREADS'
          AND (
            LOWER(provider_user_id) = LOWER($1)
            OR LOWER(COALESCE(provider_username, '')) = LOWER($2)
          )
        ORDER BY CASE
          WHEN LOWER(provider_user_id) = LOWER($1) THEN 0
          WHEN LOWER(COALESCE(provider_username, '')) = LOWER($2) THEN 1
          ELSE 2
        END
        LIMIT 1
      `,
      [identity.providerUserId, normalizedUsername],
    );

    let userId = existingAuth.rows[0]?.user_id;

    if (userId) {
      await client.query(
        `
          UPDATE users
          SET display_name = $2,
              email = COALESCE($3, email),
              profile_image_url = COALESCE($4, profile_image_url),
              last_login_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          userId,
          identity.displayName,
          identity.email ?? null,
          identity.profileImageUrl ?? null,
        ],
      );

      await client.query(
        `
          UPDATE auth_accounts
          SET provider_user_id = $2,
              provider_username = $3,
              updated_at = NOW()
          WHERE provider = 'THREADS' AND user_id = $1
        `,
        [userId, identity.providerUserId, normalizedUsername],
      );
    } else {
      const insertedUser = await client.query<{ id: string }>(
        `
          INSERT INTO users (display_name, email, profile_image_url, last_login_at)
          VALUES ($1, $2, $3, NOW())
          RETURNING id
        `,
        [
          identity.displayName,
          identity.email ?? null,
          identity.profileImageUrl ?? null,
        ],
      );

      userId = insertedUser.rows[0]?.id;

      if (!userId) {
        throw new AppError("Failed to create the user account.", 500);
      }

      await client.query(
        `
          INSERT INTO auth_accounts (user_id, provider, provider_user_id, provider_username)
          VALUES ($1, 'THREADS', $2, $3)
        `,
        [userId, identity.providerUserId, normalizedUsername],
      );
    }

    const rolesToAssign = [
      "BUYER",
      ...(isApprovalAdmin ? ["SELLER", "ADMIN"] : []),
    ];
    await client.query(
      `
        INSERT INTO user_roles (user_id, role)
        SELECT $1, role_code
        FROM UNNEST($2::role_code[]) AS role_code
        ON CONFLICT DO NOTHING
      `,
      [userId, rolesToAssign],
    );

    if (isApprovalAdmin) {
      await ensureSellerProfile(client, userId, identity.displayName);
    }

    return createSessionForUserId(client, userId);
  });
}

export async function getSessionUser(sessionToken?: string) {
  if (!sessionToken) {
    return null;
  }

  return getUserBySessionHash(hashSessionToken(sessionToken));
}

export function setSessionCookie(
  response: Response,
  sessionToken: string,
  expiresAt: Date,
) {
  response.cookie(
    env.SESSION_COOKIE_NAME,
    sessionToken,
    cookieOptions(expiresAt),
  );
}

export function verifySellerApprovalAdminPassword(password: string) {
  if (!env.SELLER_APPROVAL_ADMIN_PASSWORD) {
    throw new AppError(
      "판매자 승인 관리자 비밀번호가 아직 설정되지 않았습니다.",
      503,
    );
  }

  if (!compareSecret(password, env.SELLER_APPROVAL_ADMIN_PASSWORD)) {
    throw new AppError("관리자 비밀번호가 올바르지 않습니다.", 401);
  }
}

export function setSellerApprovalAuthCookie(
  response: Response,
  sessionToken: string,
  userId: string,
) {
  response.cookie(
    sellerApprovalAuthCookieName,
    getSellerApprovalCookieValue(sessionToken, userId),
    cookieOptions(addDays(1)),
  );
}

export function hasSellerApprovalAuthCookie(input: {
  sessionToken?: string;
  userId: string;
  cookieValue?: string;
}) {
  if (
    !env.SELLER_APPROVAL_ADMIN_PASSWORD ||
    !input.sessionToken ||
    !input.cookieValue
  ) {
    return false;
  }

  return compareSecret(
    input.cookieValue,
    getSellerApprovalCookieValue(input.sessionToken, input.userId),
  );
}

export async function logout(sessionToken?: string) {
  if (!sessionToken) {
    return;
  }

  await query(
    `
      UPDATE user_sessions
      SET revoked_at = NOW(),
          updated_at = NOW()
      WHERE session_token_hash = $1
    `,
    [hashSessionToken(sessionToken)],
  );
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(env.SESSION_COOKIE_NAME, cookieOptions());
}

export function clearSellerApprovalAuthCookie(response: Response) {
  response.clearCookie(sellerApprovalAuthCookieName, cookieOptions());
}

export function clearThreadsOauthStateCookie(response: Response) {
  response.clearCookie(threadsOauthStateCookieName, cookieOptions());
}

export function beginThreadsOauth(response: Response, returnTo?: string) {
  if (!isThreadsOauthConfigured()) {
    throw new AppError(
      "Threads OAuth environment variables are not configured yet.",
      501,
    );
  }

  const oauthState = {
    nonce: generateSessionToken(),
    returnTo: normalizeReturnTo(returnTo),
  };

  response.cookie(
    threadsOauthStateCookieName,
    encodeOauthState(oauthState),
    cookieOptions(new Date(Date.now() + 10 * 60 * 1000)),
  );

  const url = new URL(env.THREADS_AUTH_URL);
  url.searchParams.set("client_id", env.THREADS_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.THREADS_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "threads_basic");
  url.searchParams.set("state", oauthState.nonce);
  return url.toString();
}

export function getThreadsAuthFailureRedirect(
  storedStateCookie?: string,
  message?: string,
) {
  const storedState = readThreadsOauthState(storedStateCookie);
  const loginUrl = getLoginPageUrl(storedState?.returnTo ?? null);

  if (message) {
    loginUrl.searchParams.set("error", message);
  }

  if (storedState?.returnTo) {
    loginUrl.searchParams.set("return_to", storedState.returnTo);
  }

  return loginUrl.toString();
}

export async function completeThreadsOauth(input: {
  code?: string;
  state?: string;
  storedStateCookie?: string;
}) {
  if (!isThreadsOauthConfigured()) {
    throw new AppError(
      "Threads OAuth environment variables are not configured yet.",
      501,
    );
  }

  const storedState = readThreadsOauthState(input.storedStateCookie);

  if (!storedState) {
    throw new AppError(
      "The Threads login session expired. Please try again.",
      400,
    );
  }

  if (!input.state || storedState.nonce !== input.state) {
    throw new AppError("The Threads login state could not be verified.", 400);
  }

  if (!input.code) {
    throw new AppError("No Threads authorization code was returned.", 400);
  }

  const shortLivedToken = await exchangeCodeForShortLivedToken(input.code);
  const longLivedToken = await exchangeForLongLivedToken(
    shortLivedToken.access_token,
  );
  const accessToken =
    longLivedToken?.access_token ?? shortLivedToken.access_token;
  const profile = await fetchThreadsProfile(accessToken);

  const session = await createSessionForThreadsIdentity({
    providerUserId: profile.id,
    username: profile.username,
    displayName: profile.name || profile.username,
    profileImageUrl: profile.threads_profile_picture_url || null,
  });

  return {
    ...session,
    redirectTo: storedState.returnTo,
  };
}
