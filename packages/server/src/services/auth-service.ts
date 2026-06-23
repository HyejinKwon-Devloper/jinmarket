import type { Response } from "express";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual
} from "node:crypto";
import { z } from "zod";

import {
  query,
  runWithDbContext,
  runWithSystemDbContext,
  withTransaction,
  type DbClient
} from "@jinmarket/db";
import {
  sanitizeProfileImageUrl,
  type SellerApprovalAdminAuthStatus,
  type SellerApprovalTotpSetup,
  type SessionUser
} from "../../../shared/src/index.js";

import { AppError, isPgUniqueError } from "../errors.js";
import { env, isSellerApprovalAdminLoginId } from "../env.js";
import { addDays, addMinutes, generateSessionToken, hashSessionToken } from "../utils/auth.js";
import { hashPassword, hashVerificationCode, verifyPassword } from "../utils/password.js";
import {
  decryptDisplayName,
  decryptOptionalEmail,
  encryptPiiText,
  hashEmailLookup,
  type EncryptedDisplayNameColumns,
  type EncryptedEmailColumns
} from "../utils/pii.js";
import {
  buildTotpOtpauthUrl,
  generateTotpSecret,
  verifyTotpToken
} from "../utils/totp.js";

import { accountIdentityJoins, accountLoginIdSql } from "./account-sql.js";
import {
  sendBuyerAccountActivationCode,
  sendBuyerEmailVerificationCode,
  sendLegacyAccountActivationCode,
  sendPasswordResetCode,
  sendSellerPortalVerificationCode,
  sendSignupVerificationCode
} from "./mail-service.js";

export const sellerApprovalAuthCookieName = "jm_seller_approval_auth";

const emailSchema = z.string().trim().email().max(255);

type RequiredEncryptedEmailColumns = {
  email_encrypted: string;
  email_iv: string;
  email_auth_tag: string;
};

type SessionUserRow = EncryptedDisplayNameColumns &
  EncryptedEmailColumns & {
  id: string;
  has_local_password: boolean;
  profile_image_url: string | null;
  seller_email_verified_at: Date | null;
  login_id: string | null;
  roles: string[] | string | null;
  };

type LocalAccountEncryptedRow = EncryptedDisplayNameColumns &
  EncryptedEmailColumns & {
  id: string;
  seller_email_verified_at: Date | null;
  is_active: boolean;
  login_id: string;
  password_hash: string;
  };

type LocalAccountRow = {
  id: string;
  display_name: string;
  email: string | null;
  seller_email_verified_at: Date | null;
  is_active: boolean;
  login_id: string;
  password_hash: string;
};

type PendingSignupEncryptedRow = EncryptedDisplayNameColumns &
  RequiredEncryptedEmailColumns & {
  id: string;
  login_id: string;
  password_hash: string;
  verification_code_hash: string;
  code_expires_at: Date;
  };

type PendingSignupRow = {
  id: string;
  login_id: string;
  display_name: string;
  email: string;
  password_hash: string;
  verification_code_hash: string;
  code_expires_at: Date;
};

type PendingEmailVerificationEncryptedRow = RequiredEncryptedEmailColumns & {
  user_id: string;
  verification_code_hash: string;
  code_expires_at: Date;
  };

type PendingEmailVerificationRow = {
  user_id: string;
  email: string;
  verification_code_hash: string;
  code_expires_at: Date;
};

type EmailVerificationIdentityEncryptedRow = EncryptedDisplayNameColumns & {
  login_id: string | null;
};

type EmailVerificationIdentityRow = {
  display_name: string;
  login_id: string | null;
};

type PasswordResetTargetEncryptedRow = EncryptedDisplayNameColumns &
  EncryptedEmailColumns & {
  user_id: string;
  login_id: string | null;
  has_local_password: boolean;
  roles: string[] | string | null;
  };

type PasswordResetTargetRow = {
  user_id: string;
  display_name: string;
  email: string | null;
  login_id: string | null;
  has_local_password: boolean;
  roles: string[] | string | null;
};

type PasswordResetRequestEncryptedRow = RequiredEncryptedEmailColumns & {
  user_id: string;
  verification_code_hash: string;
  code_expires_at: Date;
  };

type PasswordResetRequestRow = {
  user_id: string;
  email: string;
  verification_code_hash: string;
  code_expires_at: Date;
};

type LegacyActivationRequestEncryptedRow = RequiredEncryptedEmailColumns & {
  user_id: string;
  verification_code_hash: string;
  code_expires_at: Date;
  };

type LegacyActivationRequestRow = {
  user_id: string;
  email: string;
  verification_code_hash: string;
  code_expires_at: Date;
};

type LegacyActivationTargetEncryptedRow = EncryptedDisplayNameColumns & {
  user_id: string;
  login_id: string;
  has_local_password: boolean;
  };

type LegacyActivationTargetRow = {
  user_id: string;
  display_name: string;
  login_id: string;
  has_local_password: boolean;
};

type SellerApprovalTotpCredentialRow = {
  user_id: string;
  secret_encrypted: string;
  secret_iv: string;
  secret_auth_tag: string;
  enabled_at: Date | null;
  pending_expires_at: Date | null;
  last_verified_at: Date | null;
  last_used_time_step: number | null;
  updated_at: Date;
};

type PasswordResetPortal = "SHOP" | "ADMIN";

const sellerApprovalTotpDigits = 6;
const sellerApprovalTotpPeriodSeconds = 30;
const sellerApprovalTotpPendingTtlMinutes = 10;
const sellerApprovalTotpWindow = 1;

function normalizeRoleList(value: string[] | string | null | undefined) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return [];
  }

  const normalized = value.trim();

  if (!normalized || normalized === "{}") {
    return [];
  }

  return normalized
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .split(",")
    .map((role) => role.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function mapSessionUser(row: SessionUserRow): SessionUser {
  return {
    id: row.id,
    displayName: decryptDisplayName(row),
    email: decryptOptionalEmail(row),
    hasLocalPassword: row.has_local_password,
    profileImageUrl: sanitizeProfileImageUrl(row.profile_image_url),
    sellerEmailVerifiedAt: row.seller_email_verified_at ? row.seller_email_verified_at.toISOString() : null,
    threadsUsername: row.login_id,
    roles: normalizeRoleList(row.roles)
  };
}

function requireDecryptedEmail(email: string | null, context: string) {
  if (!email) {
    throw new Error(`${context} email is missing.`);
  }

  return email;
}

function buildEncryptedDisplayNamePayload(displayName: string) {
  return encryptPiiText(displayName);
}

function buildEncryptedEmailPayload(email: string) {
  const encrypted = encryptPiiText(email);

  return {
    ...encrypted,
    lookupHash: hashEmailLookup(email)
  };
}

function mapLocalAccountRow(row: LocalAccountEncryptedRow): LocalAccountRow {
  return {
    id: row.id,
    display_name: decryptDisplayName(row),
    email: decryptOptionalEmail(row),
    seller_email_verified_at: row.seller_email_verified_at,
    is_active: row.is_active,
    login_id: row.login_id,
    password_hash: row.password_hash
  };
}

function mapPendingSignupRow(row: PendingSignupEncryptedRow): PendingSignupRow {
  return {
    id: row.id,
    login_id: row.login_id,
    display_name: decryptDisplayName(row),
    email: requireDecryptedEmail(decryptOptionalEmail(row), "Pending signup"),
    password_hash: row.password_hash,
    verification_code_hash: row.verification_code_hash,
    code_expires_at: row.code_expires_at
  };
}

function mapPendingEmailVerificationRow(
  row: PendingEmailVerificationEncryptedRow
): PendingEmailVerificationRow {
  return {
    user_id: row.user_id,
    email: requireDecryptedEmail(decryptOptionalEmail(row), "Pending email verification"),
    verification_code_hash: row.verification_code_hash,
    code_expires_at: row.code_expires_at
  };
}

function mapEmailVerificationIdentityRow(
  row: EmailVerificationIdentityEncryptedRow
): EmailVerificationIdentityRow {
  return {
    display_name: decryptDisplayName(row),
    login_id: row.login_id
  };
}

function mapPasswordResetTargetRow(
  row: PasswordResetTargetEncryptedRow
): PasswordResetTargetRow {
  return {
    user_id: row.user_id,
    display_name: decryptDisplayName(row),
    email: decryptOptionalEmail(row),
    login_id: row.login_id,
    has_local_password: row.has_local_password,
    roles: row.roles
  };
}

function mapPasswordResetRequestRow(
  row: PasswordResetRequestEncryptedRow
): PasswordResetRequestRow {
  return {
    user_id: row.user_id,
    email: requireDecryptedEmail(decryptOptionalEmail(row), "Password reset request"),
    verification_code_hash: row.verification_code_hash,
    code_expires_at: row.code_expires_at
  };
}

function mapLegacyActivationRequestRow(
  row: LegacyActivationRequestEncryptedRow
): LegacyActivationRequestRow {
  return {
    user_id: row.user_id,
    email: requireDecryptedEmail(decryptOptionalEmail(row), "Legacy activation request"),
    verification_code_hash: row.verification_code_hash,
    code_expires_at: row.code_expires_at
  };
}

function mapLegacyActivationTargetRow(
  row: LegacyActivationTargetEncryptedRow
): LegacyActivationTargetRow {
  return {
    user_id: row.user_id,
    display_name: decryptDisplayName(row),
    login_id: row.login_id,
    has_local_password: row.has_local_password
  };
}

function normalizeLoginId(rawLoginId: string) {
  const normalized = rawLoginId.trim().replace(/^@+/, "").toLowerCase();

  if (!/^[a-z0-9._-]{2,120}$/.test(normalized)) {
    throw new AppError(
      "Threads 아이디는 2자 이상 120자 이하의 영문, 숫자, 점(.), 밑줄(_), 하이픈(-)만 사용할 수 있습니다.",
      400
    );
  }

  return normalized;
}

function normalizeDisplayName(rawDisplayName: string) {
  const normalized = rawDisplayName.trim();

  if (normalized.length < 1 || normalized.length > 60) {
    throw new AppError("이름은 1자 이상 60자 이하로 입력해 주세요.", 400);
  }

  return normalized;
}

function normalizeEmail(rawEmail: string) {
  return emailSchema.parse(rawEmail).toLowerCase();
}

function normalizeProfileImageUrl(rawProfileImageUrl: string | null) {
  if (rawProfileImageUrl === null) {
    return null;
  }

  const normalized = rawProfileImageUrl.trim();

  if (!normalized) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new AppError("프로필 사진 주소가 올바르지 않습니다.", 400, "INVALID_PROFILE_IMAGE_URL");
  }

  const sanitized = sanitizeProfileImageUrl(parsed.toString());

  if (!sanitized) {
    throw new AppError(
      "프로필 사진은 등록된 Cloudinary 이미지여야 합니다.",
      400,
      "INVALID_PROFILE_IMAGE_URL"
    );
  }

  return sanitized;
}

function normalizeVerificationCode(rawCode: string) {
  const normalized = rawCode.trim();

  if (!/^\d{6}$/.test(normalized)) {
    throw new AppError("인증번호는 6자리 숫자로 입력해 주세요.", 400);
  }

  return normalized;
}

function assertPasswordLength(password: string) {
  if (password.length < 8 || password.length > 200) {
    throw new AppError("비밀번호는 8자 이상 200자 이하로 입력해 주세요.", 400);
  }
}

function isSecureCookie() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? `https://${env.DEV_HOST}:${env.API_PORT}`;
  return apiBaseUrl.startsWith("https://");
}

function cookieOptions(expires?: Date) {
  const secure = isSecureCookie();

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    ...(expires ? { expires } : {})
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

function normalizeSellerApprovalOtpCode(rawCode: string) {
  const normalized = rawCode.trim().replace(/\s+/g, "");

  if (!/^\d{6}$/.test(normalized)) {
    throw new AppError(
      "Google OTP 6자리 코드를 입력해 주세요.",
      400,
      "INVALID_SELLER_APPROVAL_OTP"
    );
  }

  return normalized;
}

function getSellerApprovalTotpEncryptionKey() {
  const source = env.SELLER_APPROVAL_TOTP_ENCRYPTION_SECRET.trim();

  if (!source) {
    throw new Error("SELLER_APPROVAL_TOTP_ENCRYPTION_SECRET is required for seller approval OTP.");
  }

  return createHash("sha256")
    .update(`seller-approval-totp:${source}`)
    .digest();
}

function encryptSellerApprovalTotpSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSellerApprovalTotpEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    secretEncrypted: encrypted.toString("base64"),
    secretIv: iv.toString("hex"),
    secretAuthTag: authTag.toString("hex")
  };
}

function decryptSellerApprovalTotpSecret(row: Pick<
  SellerApprovalTotpCredentialRow,
  "secret_encrypted" | "secret_iv" | "secret_auth_tag"
>) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getSellerApprovalTotpEncryptionKey(),
    Buffer.from(row.secret_iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(row.secret_auth_tag, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(row.secret_encrypted, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function getSellerApprovalTotpAccountName(user: SessionUser) {
  return user.threadsUsername?.trim() || user.email?.trim() || user.displayName.trim();
}

function getSellerApprovalTotpAccountNameFromValues(input: {
  loginId?: string | null;
  email?: string | null;
  displayName: string;
}) {
  return input.loginId?.trim() || input.email?.trim() || input.displayName.trim();
}

function buildSellerApprovalTotpSetup(
  user: SessionUser,
  row: Pick<SellerApprovalTotpCredentialRow, "pending_expires_at"> &
    Pick<SellerApprovalTotpCredentialRow, "secret_encrypted" | "secret_iv" | "secret_auth_tag">
): SellerApprovalTotpSetup {
  if (!row.pending_expires_at) {
    throw new AppError("Google OTP 설정 정보를 찾지 못했습니다.", 404, "SELLER_APPROVAL_TOTP_SETUP_NOT_FOUND");
  }

  const issuer = env.SELLER_APPROVAL_TOTP_ISSUER.trim();
  const accountName = getSellerApprovalTotpAccountName(user);
  const manualEntryKey = decryptSellerApprovalTotpSecret(row);

  return {
    issuer,
    accountName,
    manualEntryKey,
    otpauthUrl: buildTotpOtpauthUrl({
      issuer,
      accountName,
      secret: manualEntryKey,
      digits: sellerApprovalTotpDigits,
      periodSeconds: sellerApprovalTotpPeriodSeconds
    }),
    expiresAt: row.pending_expires_at.toISOString()
  };
}

function getSellerApprovalAuthVersion(row: Pick<SellerApprovalTotpCredentialRow, "updated_at">) {
  return row.updated_at.toISOString();
}

function verifyLegacyAccountActivationToken(token?: string) {
  const expectedToken = env.LEGACY_ACCOUNT_ACTIVATION_TOKEN.trim();

  if (!expectedToken) {
    return;
  }

  if (!token || !compareSecret(token, expectedToken)) {
    throw new AppError("유효하지 않은 계정 전환 링크입니다.", 403, "INVALID_ACTIVATION_LINK");
  }
}

function verifyBuyerAccountActivationToken(token?: string) {
  const expectedToken = env.BUYER_ACCOUNT_ACTIVATION_TOKEN.trim();

  if (!expectedToken) {
    return;
  }

  if (!token || !compareSecret(token, expectedToken)) {
    throw new AppError("유효하지 않은 계정 활성화 링크입니다.", 403, "INVALID_ACTIVATION_LINK");
  }
}

function getSellerApprovalCookieValue(sessionToken: string, userId: string, authVersion: string) {
  return createHash("sha256")
    .update(`${sessionToken}:${userId}:${authVersion}:${env.SESSION_SECRET}`)
    .digest("hex");
}

async function getUserBySessionHash(sessionHash: string) {
  const result = await query<SessionUserRow>(
    `
      SELECT
        u.id,
        u.display_name_encrypted,
        u.display_name_iv,
        u.display_name_auth_tag,
        u.email_encrypted,
        u.email_iv,
        u.email_auth_tag,
        (session_user_local.user_id IS NOT NULL) AS has_local_password,
        u.profile_image_url,
        u.seller_email_verified_at,
        ${accountLoginIdSql("session_user")} AS login_id,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT ur.role::text), NULL) AS roles
      FROM user_sessions us
      JOIN users u ON u.id = us.user_id
      ${accountIdentityJoins("session_user", "u")}
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE us.session_token_hash = $1
        AND us.revoked_at IS NULL
        AND us.expires_at > NOW()
        AND (
          session_user_local.user_id IS NULL
          OR us.created_at >= session_user_local.password_updated_at
        )
      GROUP BY u.id, ${accountLoginIdSql("session_user")}, session_user_local.user_id
    `,
    [sessionHash]
  );

  return result.rows[0] ? mapSessionUser(result.rows[0]) : null;
}

async function loadSessionUserById(client: DbClient, userId: string) {
  const result = await client.query<SessionUserRow>(
    `
      SELECT
        u.id,
        u.display_name_encrypted,
        u.display_name_iv,
        u.display_name_auth_tag,
        u.email_encrypted,
        u.email_iv,
        u.email_auth_tag,
        (account_local.user_id IS NOT NULL) AS has_local_password,
        u.profile_image_url,
        u.seller_email_verified_at,
        ${accountLoginIdSql("account")} AS login_id,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT ur.role::text), NULL) AS roles
      FROM users u
      ${accountIdentityJoins("account", "u")}
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id, ${accountLoginIdSql("account")}, account_local.user_id
    `,
    [userId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError("로그인 사용자 정보를 불러오지 못했습니다.", 500);
  }

  return mapSessionUser(row);
}

async function loadSellerApprovalTotpCredential(userId: string) {
  const result = await query<SellerApprovalTotpCredentialRow>(
    `
      SELECT
        user_id,
        secret_encrypted,
        secret_iv,
        secret_auth_tag,
        enabled_at,
        pending_expires_at,
        last_verified_at,
        last_used_time_step,
        updated_at
      FROM seller_approval_admin_totp_credentials
      WHERE user_id = $1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

async function loadSellerApprovalTotpCredentialForUpdate(client: DbClient, userId: string) {
  const result = await client.query<SellerApprovalTotpCredentialRow>(
    `
      SELECT
        user_id,
        secret_encrypted,
        secret_iv,
        secret_auth_tag,
        enabled_at,
        pending_expires_at,
        last_verified_at,
        last_used_time_step,
        updated_at
      FROM seller_approval_admin_totp_credentials
      WHERE user_id = $1
      FOR UPDATE
    `,
    [userId]
  );

  return result.rows[0] ?? null;
}

export async function getSellerApprovalAdminAuthStatus(input: {
  user: SessionUser;
  sessionToken?: string;
  cookieValue?: string;
}): Promise<SellerApprovalAdminAuthStatus> {
  if (!input.user.roles.includes("ADMIN") || !isSellerApprovalAdminLoginId(input.user.threadsUsername)) {
    return {
      eligible: false,
      verified: false,
      totpEnabled: false
    };
  }

  const credential = await loadSellerApprovalTotpCredential(input.user.id);
  const totpEnabled = Boolean(credential?.enabled_at);

  return {
    eligible: true,
    verified:
      totpEnabled &&
      hasSellerApprovalAuthCookie({
        sessionToken: input.sessionToken,
        userId: input.user.id,
        cookieValue: input.cookieValue,
        authVersion: credential ? getSellerApprovalAuthVersion(credential) : undefined
      }),
    totpEnabled
  };
}

export async function provisionSellerApprovalTotpForLoginId(loginIdInput: string) {
  const loginId = normalizeLoginId(loginIdInput);

  if (!isSellerApprovalAdminLoginId(loginId)) {
    throw new AppError(
      "허용된 판매자 승인 관리자 로그인 아이디만 OTP를 고정 등록할 수 있습니다.",
      403,
      "SELLER_APPROVAL_ADMIN_NOT_ALLOWED"
    );
  }

  const targetResult = await runWithSystemDbContext(() =>
    query<{
      user_id: string;
      display_name_encrypted: string;
      display_name_iv: string;
      display_name_auth_tag: string;
      email_encrypted: string | null;
      email_iv: string | null;
      email_auth_tag: string | null;
      login_id: string | null;
    }>(
      `
        SELECT
          u.id AS user_id,
          u.display_name_encrypted,
          u.display_name_iv,
          u.display_name_auth_tag,
          u.email_encrypted,
          u.email_iv,
          u.email_auth_tag,
          ${accountLoginIdSql("account")} AS login_id
        FROM users u
        ${accountIdentityJoins("account", "u")}
        WHERE LOWER(COALESCE(${accountLoginIdSql("account")}, '')) = LOWER($1)
        GROUP BY u.id, ${accountLoginIdSql("account")}
        LIMIT 1
      `,
      [loginId]
    )
  );

  const target = targetResult.rows[0];

  if (!target?.login_id) {
    throw new AppError(
      "해당 로그인 아이디 계정을 찾지 못했습니다. 먼저 계정이 생성되어 있는지 확인해 주세요.",
      404,
      "SELLER_APPROVAL_ADMIN_NOT_FOUND"
    );
  }

  const secret = generateTotpSecret();
  const encryptedSecret = encryptSellerApprovalTotpSecret(secret);
  const issuer = env.SELLER_APPROVAL_TOTP_ISSUER.trim();
  const accountName = getSellerApprovalTotpAccountNameFromValues({
    loginId: target.login_id,
    email: decryptOptionalEmail(target),
    displayName: decryptDisplayName(target)
  });

  await runWithDbContext(
    {
      userId: target.user_id,
      roles: ["ADMIN"]
    },
    async () =>
      withTransaction(async (client) => {
        await assignBaseRoles(
          client,
          target.user_id,
          target.login_id as string,
          decryptDisplayName(target)
        );
        await client.query(
          `
            INSERT INTO seller_approval_admin_totp_credentials (
              user_id,
              secret_encrypted,
              secret_iv,
              secret_auth_tag,
              enabled_at,
              pending_expires_at,
              last_verified_at,
              last_used_time_step,
              updated_at
            )
            VALUES ($1, $2, $3, $4, NOW(), NULL, NULL, NULL, NOW())
            ON CONFLICT (user_id) DO UPDATE
            SET secret_encrypted = EXCLUDED.secret_encrypted,
                secret_iv = EXCLUDED.secret_iv,
                secret_auth_tag = EXCLUDED.secret_auth_tag,
                enabled_at = NOW(),
                pending_expires_at = NULL,
                last_verified_at = NULL,
                last_used_time_step = NULL,
                updated_at = NOW()
          `,
          [
            target.user_id,
            encryptedSecret.secretEncrypted,
            encryptedSecret.secretIv,
            encryptedSecret.secretAuthTag
          ]
        );
      })
  );

  return {
    loginId: target.login_id,
    issuer,
    accountName,
    manualEntryKey: secret,
    otpauthUrl: buildTotpOtpauthUrl({
      issuer,
      accountName,
      secret,
      digits: sellerApprovalTotpDigits,
      periodSeconds: sellerApprovalTotpPeriodSeconds
    })
  };
}

export async function prepareSellerApprovalTotpSetup(
  user: SessionUser,
  options?: { regenerate?: boolean }
): Promise<SellerApprovalTotpSetup> {
  return withTransaction(async (client) => {
    const existing = await loadSellerApprovalTotpCredentialForUpdate(client, user.id);

    if (existing?.enabled_at) {
      throw new AppError(
        "판매자 승인용 Google OTP가 이미 설정되어 있습니다.",
        409,
        "SELLER_APPROVAL_TOTP_ALREADY_ENABLED"
      );
    }

    if (
      !options?.regenerate &&
      existing?.pending_expires_at &&
      existing.pending_expires_at.getTime() > Date.now()
    ) {
      return buildSellerApprovalTotpSetup(user, existing);
    }

    const secret = generateTotpSecret();
    const encryptedSecret = encryptSellerApprovalTotpSecret(secret);
    const expiresAt = addMinutes(sellerApprovalTotpPendingTtlMinutes);
    const result = await client.query<SellerApprovalTotpCredentialRow>(
      `
        INSERT INTO seller_approval_admin_totp_credentials (
          user_id,
          secret_encrypted,
          secret_iv,
          secret_auth_tag,
          enabled_at,
          pending_expires_at,
          last_verified_at,
          last_used_time_step,
          updated_at
        )
        VALUES ($1, $2, $3, $4, NULL, $5, NULL, NULL, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET secret_encrypted = EXCLUDED.secret_encrypted,
            secret_iv = EXCLUDED.secret_iv,
            secret_auth_tag = EXCLUDED.secret_auth_tag,
            enabled_at = NULL,
            pending_expires_at = EXCLUDED.pending_expires_at,
            last_verified_at = NULL,
            last_used_time_step = NULL,
            updated_at = NOW()
        RETURNING
          user_id,
          secret_encrypted,
          secret_iv,
          secret_auth_tag,
          enabled_at,
          pending_expires_at,
          last_verified_at,
          last_used_time_step,
          updated_at
      `,
      [
        user.id,
        encryptedSecret.secretEncrypted,
        encryptedSecret.secretIv,
        encryptedSecret.secretAuthTag,
        expiresAt
      ]
    );

    return buildSellerApprovalTotpSetup(user, result.rows[0]);
  });
}

export async function verifySellerApprovalTotpSetup(userId: string, code: string) {
  const normalizedCode = normalizeSellerApprovalOtpCode(code);

  return withTransaction(async (client) => {
    const credential = await loadSellerApprovalTotpCredentialForUpdate(client, userId);

    if (!credential || credential.enabled_at || !credential.pending_expires_at) {
      throw new AppError(
        "Google OTP 설정 정보를 찾지 못했습니다. 설정 키를 다시 발급해 주세요.",
        404,
        "SELLER_APPROVAL_TOTP_SETUP_NOT_FOUND"
      );
    }

    if (credential.pending_expires_at.getTime() < Date.now()) {
      await client.query(
        "DELETE FROM seller_approval_admin_totp_credentials WHERE user_id = $1 AND enabled_at IS NULL",
        [userId]
      );
      throw new AppError(
        "Google OTP 설정 시간이 만료되었습니다. 설정 키를 다시 발급해 주세요.",
        410,
        "SELLER_APPROVAL_TOTP_SETUP_EXPIRED"
      );
    }

    const verification = verifyTotpToken({
      secret: decryptSellerApprovalTotpSecret(credential),
      token: normalizedCode,
      digits: sellerApprovalTotpDigits,
      periodSeconds: sellerApprovalTotpPeriodSeconds,
      window: sellerApprovalTotpWindow
    });

    if (!verification) {
      throw new AppError(
        "Google OTP 코드가 올바르지 않습니다.",
        401,
        "INVALID_SELLER_APPROVAL_OTP"
      );
    }

    const updated = await client.query<SellerApprovalTotpCredentialRow>(
      `
        UPDATE seller_approval_admin_totp_credentials
        SET enabled_at = NOW(),
            pending_expires_at = NULL,
            last_verified_at = NOW(),
            last_used_time_step = $2,
            updated_at = NOW()
        WHERE user_id = $1
        RETURNING
          user_id,
          secret_encrypted,
          secret_iv,
          secret_auth_tag,
          enabled_at,
          pending_expires_at,
          last_verified_at,
          last_used_time_step,
          updated_at
      `,
      [userId, verification.step]
    );

    return updated.rows[0];
  });
}

export async function verifySellerApprovalTotp(userId: string, code: string) {
  const normalizedCode = normalizeSellerApprovalOtpCode(code);

  return withTransaction(async (client) => {
    const credential = await loadSellerApprovalTotpCredentialForUpdate(client, userId);

    if (!credential?.enabled_at) {
      throw new AppError(
        "판매자 승인용 Google OTP가 아직 설정되지 않았습니다.",
        503,
        "SELLER_APPROVAL_TOTP_NOT_CONFIGURED"
      );
    }

    const verification = verifyTotpToken({
      secret: decryptSellerApprovalTotpSecret(credential),
      token: normalizedCode,
      digits: sellerApprovalTotpDigits,
      periodSeconds: sellerApprovalTotpPeriodSeconds,
      window: sellerApprovalTotpWindow
    });

    if (!verification) {
      throw new AppError(
        "Google OTP 코드가 올바르지 않습니다.",
        401,
        "INVALID_SELLER_APPROVAL_OTP"
      );
    }

    if (
      typeof credential.last_used_time_step === "number" &&
      verification.step <= credential.last_used_time_step
    ) {
      throw new AppError(
        "이미 사용한 Google OTP 코드입니다. 새 코드를 입력해 주세요.",
        409,
        "SELLER_APPROVAL_TOTP_REUSED"
      );
    }

    const updated = await client.query<SellerApprovalTotpCredentialRow>(
      `
        UPDATE seller_approval_admin_totp_credentials
        SET last_verified_at = NOW(),
            last_used_time_step = $2,
            updated_at = NOW()
        WHERE user_id = $1
        RETURNING
          user_id,
          secret_encrypted,
          secret_iv,
          secret_auth_tag,
          enabled_at,
          pending_expires_at,
          last_verified_at,
          last_used_time_step,
          updated_at
      `,
      [userId, verification.step]
    );

    return updated.rows[0];
  });
}

async function createSessionForUserId(client: DbClient, userId: string) {
  const sessionToken = generateSessionToken();
  const expiresAt = addDays(30);

  await client.query(
    `
      INSERT INTO user_sessions (user_id, session_token_hash, expires_at)
      VALUES ($1, $2, $3)
    `,
    [userId, hashSessionToken(sessionToken), expiresAt]
  );

  await client.query(
    `
      UPDATE users
      SET last_login_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `,
    [userId]
  );

  return {
    user: await loadSessionUserById(client, userId),
    sessionToken,
    expiresAt
  };
}

async function isLoginIdTaken(client: DbClient, loginId: string) {
  const result = await client.query(
    `
      SELECT 1
      FROM (
        SELECT login_id AS identity_value
        FROM local_auth_credentials
        UNION ALL
        SELECT provider_username AS identity_value
        FROM auth_accounts
        WHERE provider = 'THREADS'
      ) identities
      WHERE LOWER(COALESCE(identity_value, '')) = LOWER($1)
      LIMIT 1
    `,
    [loginId]
  );

  return Boolean(result.rows[0]);
}

async function isEmailTaken(client: DbClient, email: string) {
  const result = await client.query(
    `
      SELECT 1
      FROM users
      WHERE email_lookup_hash = $1
      LIMIT 1
    `,
    [hashEmailLookup(email)]
  );

  return Boolean(result.rows[0]);
}

async function ensureSignupAvailability(client: DbClient, loginId: string, email?: string | null) {
  if (await isLoginIdTaken(client, loginId)) {
    throw new AppError("이미 사용 중인 Threads 아이디입니다.", 409, "LOGIN_ID_ALREADY_EXISTS");
  }

  if (email && (await isEmailTaken(client, email))) {
    throw new AppError("이미 가입한 이메일입니다.", 409, "EMAIL_ALREADY_EXISTS");
  }
}

async function assignBaseRoles(client: DbClient, userId: string, loginId: string, displayName: string) {
  const normalizedLoginId = normalizeLoginId(loginId);
  const roles = ["BUYER", ...(isSellerApprovalAdminLoginId(normalizedLoginId) ? ["SELLER", "ADMIN"] : [])];

  await client.query(
    `
      INSERT INTO user_roles (user_id, role)
      SELECT $1, role_code
      FROM UNNEST($2::role_code[]) AS role_code
      ON CONFLICT DO NOTHING
    `,
    [userId, roles]
  );

  if (roles.includes("SELLER")) {
    await ensureSellerProfile(client, userId, displayName);
  }
}

async function syncAutoAdminRoles(client: DbClient, user: { id: string; login_id: string; display_name: string }) {
  if (!isSellerApprovalAdminLoginId(user.login_id)) {
    return;
  }

  await assignBaseRoles(client, user.id, user.login_id, user.display_name);
}

function generateVerificationCode() {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(6, "0");
}

export async function ensureSellerProfile(client: DbClient, userId: string, displayName: string) {
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
    [userId, `${displayName} Shop`]
  );
}

async function createLocalAccount(
  client: DbClient,
  input: {
    loginId: string;
    displayName: string;
    passwordHash: string;
    email?: string | null;
    sellerEmailVerifiedAt?: Date | null;
  }
) {
  const encryptedDisplayName = buildEncryptedDisplayNamePayload(input.displayName);
  const encryptedEmail = input.email ? buildEncryptedEmailPayload(input.email) : null;
  const insertedUser = await client.query<{ id: string }>(
    `
      INSERT INTO users (
        display_name_encrypted,
        display_name_iv,
        display_name_auth_tag,
        email_encrypted,
        email_iv,
        email_auth_tag,
        email_lookup_hash,
        seller_email_verified_at,
        last_login_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING id
    `,
    [
      encryptedDisplayName.encrypted,
      encryptedDisplayName.iv,
      encryptedDisplayName.authTag,
      encryptedEmail?.encrypted ?? null,
      encryptedEmail?.iv ?? null,
      encryptedEmail?.authTag ?? null,
      encryptedEmail?.lookupHash ?? null,
      input.sellerEmailVerifiedAt ?? null
    ]
  );

  const userId = insertedUser.rows[0]?.id;

  if (!userId) {
    throw new AppError("회원가입 계정을 생성하지 못했습니다.", 500);
  }

  await client.query(
    `
      INSERT INTO local_auth_credentials (user_id, login_id, password_hash)
      VALUES ($1, $2, $3)
    `,
    [userId, input.loginId, input.passwordHash]
  );

  await assignBaseRoles(client, userId, input.loginId, input.displayName);
  return userId;
}

async function ensureEmailAvailableForUser(client: DbClient, userId: string, email: string) {
  const result = await client.query(
    `
      SELECT 1
      FROM users
      WHERE email_lookup_hash = $1
        AND id <> $2
      LIMIT 1
    `,
    [hashEmailLookup(email), userId]
  );

  if (result.rows[0]) {
    throw new AppError("이미 가입한 이메일입니다.", 409, "EMAIL_ALREADY_EXISTS");
  }
}

async function loadEmailVerificationIdentity(client: DbClient, userId: string) {
  const result = await client.query<EmailVerificationIdentityEncryptedRow>(
    `
      SELECT
        u.display_name_encrypted,
        u.display_name_iv,
        u.display_name_auth_tag,
        ${accountLoginIdSql("account")} AS login_id
      FROM users u
      ${accountIdentityJoins("account", "u")}
      WHERE u.id = $1
      GROUP BY u.id, ${accountLoginIdSql("account")}
    `,
    [userId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError("로그인 사용자 정보를 불러오지 못했습니다.", 404);
  }

  return mapEmailVerificationIdentityRow(row);
}

async function findPasswordResetTarget(client: DbClient, loginId: string) {
  const result = await client.query<PasswordResetTargetEncryptedRow>(
    `
      SELECT
        u.id AS user_id,
        u.display_name_encrypted,
        u.display_name_iv,
        u.display_name_auth_tag,
        u.email_encrypted,
        u.email_iv,
        u.email_auth_tag,
        ${accountLoginIdSql("account")} AS login_id,
        (account_local.user_id IS NOT NULL) AS has_local_password,
        COALESCE(ARRAY_AGG(DISTINCT ur.role::text) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
      FROM users u
      ${accountIdentityJoins("account", "u")}
      LEFT JOIN user_roles ur
        ON ur.user_id = u.id
      WHERE LOWER(COALESCE(${accountLoginIdSql("account")}, '')) = LOWER($1)
      GROUP BY u.id, ${accountLoginIdSql("account")}, account_local.user_id
      LIMIT 1
    `,
    [loginId]
  );

  return result.rows[0] ? mapPasswordResetTargetRow(result.rows[0]) : null;
}

function assertBuyerActivationTarget(target: PasswordResetTargetRow | null) {
  if (!target) {
    throw new AppError(
      "기존 구매자 계정을 찾지 못했습니다. 입력한 아이디를 다시 확인해 주세요.",
      404,
      "BUYER_ACCOUNT_NOT_FOUND"
    );
  }

  // Shared seller/buyer accounts may already have an email, so buyer activation also serves as recovery.
  return target;
}

async function ensureBuyerActivationEmail(
  client: DbClient,
  target: PasswordResetTargetRow,
  email: string
) {
  const storedEmail = target.email?.toLowerCase();

  if (storedEmail) {
    if (storedEmail !== email) {
      // Keep the message explicit here because this endpoint is used for account recovery, not silent lookup.
      throw new AppError(
        "Please enter the email address you used to sign up or recover the account.",
        404,
        "BUYER_ACCOUNT_EMAIL_MISMATCH"
      );
    }

    return;
  }

  await ensureEmailAvailableForUser(client, target.user_id, email);
}

async function findLegacyActivationTarget(client: DbClient, loginId: string) {
  const result = await client.query<LegacyActivationTargetEncryptedRow>(
    `
      SELECT
        u.id AS user_id,
        u.display_name_encrypted,
        u.display_name_iv,
        u.display_name_auth_tag,
        aa.provider_username AS login_id,
        (lac.user_id IS NOT NULL) AS has_local_password
      FROM users u
      JOIN auth_accounts aa
        ON aa.user_id = u.id
       AND aa.provider = 'THREADS'
      LEFT JOIN local_auth_credentials lac
        ON lac.user_id = u.id
      WHERE LOWER(COALESCE(aa.provider_username, '')) = LOWER($1)
      LIMIT 1
    `,
    [loginId]
  );

  return result.rows[0] ? mapLegacyActivationTargetRow(result.rows[0]) : null;
}

async function upsertLocalPassword(
  client: DbClient,
  input: {
    userId: string;
    loginId: string;
    passwordHash: string;
  }
) {
  await client.query(
    `
      INSERT INTO local_auth_credentials (user_id, login_id, password_hash, password_updated_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET login_id = EXCLUDED.login_id,
          password_hash = EXCLUDED.password_hash,
          password_updated_at = NOW(),
          updated_at = NOW()
    `,
    [input.userId, input.loginId, input.passwordHash]
  );
}

async function revokeAllUserSessions(client: DbClient, userId: string) {
  await client.query(
    `
      UPDATE user_sessions
      SET revoked_at = NOW(),
          updated_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId]
  );
}

export async function registerBuyerAccount(input: {
  loginId: string;
  displayName: string;
  email: string;
  password: string;
}) {
  const loginId = normalizeLoginId(input.loginId);
  const displayName = normalizeDisplayName(input.displayName);
  const email = normalizeEmail(input.email);

  if (input.password.length < 8 || input.password.length > 200) {
    throw new AppError("비밀번호는 8자 이상 200자 이하로 입력해 주세요.", 400);
  }

  const passwordHash = await hashPassword(input.password);

  try {
    return await runWithSystemDbContext(() => withTransaction(async (client) => {
      await ensureSignupAvailability(client, loginId, email);
      const userId = await createLocalAccount(client, {
        loginId,
        displayName,
        passwordHash,
        email
      });

      return createSessionForUserId(client, userId);
    }));
  } catch (error) {
    if (isPgUniqueError(error)) {
      throw new AppError("이미 가입이 완료된 계정입니다. 로그인해 주세요.", 409);
    }

    throw error;
  }
}

export async function requestSignupVerification(input: {
  loginId: string;
  displayName: string;
  email: string;
  password: string;
}) {
  const loginId = normalizeLoginId(input.loginId);
  const displayName = normalizeDisplayName(input.displayName);
  const email = normalizeEmail(input.email);

  if (input.password.length < 8 || input.password.length > 200) {
    throw new AppError("비밀번호는 8자 이상 200자 이하로 입력해 주세요.", 400);
  }

  const passwordHash = await hashPassword(input.password);
  const verificationCode = generateVerificationCode();
  const verificationCodeHash = hashVerificationCode(verificationCode);
  const expiresAt = new Date(Date.now() + env.SIGNUP_VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
  const encryptedDisplayName = buildEncryptedDisplayNamePayload(displayName);
  const encryptedEmail = buildEncryptedEmailPayload(email);

  await runWithSystemDbContext(() => withTransaction(async (client) => {
    await client.query("DELETE FROM signup_verification_requests WHERE code_expires_at < NOW()");
    await ensureSignupAvailability(client, loginId, email);
    await client.query(
      `
        DELETE FROM signup_verification_requests
        WHERE login_id = $1 OR email_lookup_hash = $2
      `,
      [loginId, encryptedEmail.lookupHash]
    );
    await client.query(
      `
        INSERT INTO signup_verification_requests (
          login_id,
          display_name_encrypted,
          display_name_iv,
          display_name_auth_tag,
          email_encrypted,
          email_iv,
          email_auth_tag,
          email_lookup_hash,
          password_hash,
          verification_code_hash,
          code_expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        loginId,
        encryptedDisplayName.encrypted,
        encryptedDisplayName.iv,
        encryptedDisplayName.authTag,
        encryptedEmail.encrypted,
        encryptedEmail.iv,
        encryptedEmail.authTag,
        encryptedEmail.lookupHash,
        passwordHash,
        verificationCodeHash,
        expiresAt
      ]
    );
  }));

  await sendSignupVerificationCode({
    email,
    loginId,
    displayName,
    code: verificationCode
  });
}

export async function verifySignupCode(input: {
  loginId: string;
  email: string;
  code: string;
}) {
  const loginId = normalizeLoginId(input.loginId);
  const email = normalizeEmail(input.email);
  const code = normalizeVerificationCode(input.code);

  try {
    return await runWithSystemDbContext(() => withTransaction(async (client) => {
      const pendingResult = await client.query<PendingSignupEncryptedRow>(
        `
          SELECT
            id,
            login_id,
            display_name_encrypted,
            display_name_iv,
            display_name_auth_tag,
            email_encrypted,
            email_iv,
            email_auth_tag,
            password_hash,
            verification_code_hash,
            code_expires_at
          FROM signup_verification_requests
          WHERE login_id = $1 AND email_lookup_hash = $2
          FOR UPDATE
        `,
        [loginId, hashEmailLookup(email)]
      );

      const pending = pendingResult.rows[0] ? mapPendingSignupRow(pendingResult.rows[0]) : null;

      if (!pending) {
        throw new AppError("인증번호 요청 내역을 찾을 수 없습니다. 다시 인증번호를 요청해 주세요.", 404);
      }

      if (pending.code_expires_at.getTime() < Date.now()) {
        await client.query("DELETE FROM signup_verification_requests WHERE id = $1", [pending.id]);
        throw new AppError("인증번호가 만료되었습니다. 새 인증번호를 요청해 주세요.", 410);
      }

      if (!compareSecret(hashVerificationCode(code), pending.verification_code_hash)) {
        throw new AppError("인증번호가 올바르지 않습니다.", 400, "INVALID_VERIFICATION_CODE");
      }

      await ensureSignupAvailability(client, loginId, email);
      const userId = await createLocalAccount(client, {
        loginId: pending.login_id,
        displayName: pending.display_name,
        passwordHash: pending.password_hash,
        email: pending.email,
        sellerEmailVerifiedAt: new Date()
      });
      await client.query("DELETE FROM signup_verification_requests WHERE id = $1", [pending.id]);

      return createSessionForUserId(client, userId);
    }));
  } catch (error) {
    if (isPgUniqueError(error)) {
      throw new AppError("이미 가입이 완료된 계정입니다. 로그인해 주세요.", 409);
    }

    throw error;
  }
}

export async function requestSellerEmailVerification(userId: string, input: { email: string }) {
  const email = normalizeEmail(input.email);
  const verificationCode = generateVerificationCode();
  const verificationCodeHash = hashVerificationCode(verificationCode);
  const expiresAt = new Date(Date.now() + env.SIGNUP_VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
  const encryptedEmail = buildEncryptedEmailPayload(email);

  const identity = await withTransaction(async (client) => {
    await client.query("DELETE FROM seller_email_verification_requests WHERE code_expires_at < NOW()");
    await ensureEmailAvailableForUser(client, userId, email);

    const currentUser = await loadEmailVerificationIdentity(client, userId);

    await client.query(
      `
        INSERT INTO seller_email_verification_requests (
          user_id,
          email_encrypted,
          email_iv,
          email_auth_tag,
          verification_code_hash,
          code_expires_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET email_encrypted = EXCLUDED.email_encrypted,
            email_iv = EXCLUDED.email_iv,
            email_auth_tag = EXCLUDED.email_auth_tag,
            verification_code_hash = EXCLUDED.verification_code_hash,
            code_expires_at = EXCLUDED.code_expires_at,
            updated_at = NOW()
      `,
      [
        userId,
        encryptedEmail.encrypted,
        encryptedEmail.iv,
        encryptedEmail.authTag,
        verificationCodeHash,
        expiresAt
      ]
    );

    return currentUser;
  });

  await sendSellerPortalVerificationCode({
    email,
    loginId: identity.login_id,
    displayName: identity.display_name,
    code: verificationCode
  });
}

export async function requestBuyerEmailVerification(userId: string, input: { email: string }) {
  const email = normalizeEmail(input.email);
  const verificationCode = generateVerificationCode();
  const verificationCodeHash = hashVerificationCode(verificationCode);
  const expiresAt = new Date(Date.now() + env.SIGNUP_VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
  const encryptedEmail = buildEncryptedEmailPayload(email);

  const identity = await withTransaction(async (client) => {
    await client.query("DELETE FROM seller_email_verification_requests WHERE code_expires_at < NOW()");
    await ensureEmailAvailableForUser(client, userId, email);

    const currentUser = await loadEmailVerificationIdentity(client, userId);

    await client.query(
      `
        INSERT INTO seller_email_verification_requests (
          user_id,
          email_encrypted,
          email_iv,
          email_auth_tag,
          verification_code_hash,
          code_expires_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET email_encrypted = EXCLUDED.email_encrypted,
            email_iv = EXCLUDED.email_iv,
            email_auth_tag = EXCLUDED.email_auth_tag,
            verification_code_hash = EXCLUDED.verification_code_hash,
            code_expires_at = EXCLUDED.code_expires_at,
            updated_at = NOW()
      `,
      [
        userId,
        encryptedEmail.encrypted,
        encryptedEmail.iv,
        encryptedEmail.authTag,
        verificationCodeHash,
        expiresAt
      ]
    );

    return currentUser;
  });

  await sendBuyerEmailVerificationCode({
    email,
    loginId: identity.login_id,
    displayName: identity.display_name,
    code: verificationCode
  });
}

export async function requestBuyerAccountActivation(input: {
  loginId: string;
  email: string;
  token?: string;
}) {
  verifyBuyerAccountActivationToken(input.token);

  const loginId = normalizeLoginId(input.loginId);
  const email = normalizeEmail(input.email);
  const verificationCode = generateVerificationCode();
  const verificationCodeHash = hashVerificationCode(verificationCode);
  const expiresAt = new Date(Date.now() + env.SIGNUP_VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
  const encryptedEmail = buildEncryptedEmailPayload(email);

  const deliverable = await runWithSystemDbContext(() => withTransaction(async (client) => {
    await client.query("DELETE FROM password_reset_requests WHERE code_expires_at < NOW()");

    const target = assertBuyerActivationTarget(await findPasswordResetTarget(client, loginId));

    await ensureBuyerActivationEmail(client, target, email);
    await client.query(
      `
        INSERT INTO password_reset_requests (
          user_id,
          email_encrypted,
          email_iv,
          email_auth_tag,
          verification_code_hash,
          code_expires_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET email_encrypted = EXCLUDED.email_encrypted,
            email_iv = EXCLUDED.email_iv,
            email_auth_tag = EXCLUDED.email_auth_tag,
            verification_code_hash = EXCLUDED.verification_code_hash,
            code_expires_at = EXCLUDED.code_expires_at,
            updated_at = NOW()
      `,
      [
        target.user_id,
        encryptedEmail.encrypted,
        encryptedEmail.iv,
        encryptedEmail.authTag,
        verificationCodeHash,
        expiresAt
      ]
    );

    return {
      email,
      loginId: target.login_id ?? loginId,
      displayName: target.display_name,
      code: verificationCode
    };
  }));

  await sendBuyerAccountActivationCode(deliverable);
}

export async function verifySellerEmailVerification(userId: string, input: { code: string }) {
  const code = normalizeVerificationCode(input.code);

  try {
    return await runWithSystemDbContext(() => withTransaction(async (client) => {
      const pendingResult = await client.query<PendingEmailVerificationEncryptedRow>(
        `
          SELECT
            user_id,
            email_encrypted,
            email_iv,
            email_auth_tag,
            verification_code_hash,
            code_expires_at
          FROM seller_email_verification_requests
          WHERE user_id = $1
          FOR UPDATE
        `,
        [userId]
      );

      const pending = pendingResult.rows[0]
        ? mapPendingEmailVerificationRow(pendingResult.rows[0])
        : null;

      if (!pending) {
        throw new AppError("인증번호 요청 내역을 찾을 수 없습니다. 다시 인증번호를 요청해 주세요.", 404);
      }

      if (pending.code_expires_at.getTime() < Date.now()) {
        await client.query("DELETE FROM seller_email_verification_requests WHERE user_id = $1", [userId]);
        throw new AppError("인증번호가 만료되었습니다. 새 인증번호를 요청해 주세요.", 410);
      }

      if (!compareSecret(hashVerificationCode(code), pending.verification_code_hash)) {
        throw new AppError("인증번호가 올바르지 않습니다.", 400, "INVALID_VERIFICATION_CODE");
      }

      await ensureEmailAvailableForUser(client, userId, pending.email);
      const nextEmail = buildEncryptedEmailPayload(pending.email);
      await client.query(
        `
          UPDATE users
          SET email_encrypted = $2,
              email_iv = $3,
              email_auth_tag = $4,
              email_lookup_hash = $5,
              seller_email_verified_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [userId, nextEmail.encrypted, nextEmail.iv, nextEmail.authTag, nextEmail.lookupHash]
      );
      await client.query("DELETE FROM seller_email_verification_requests WHERE user_id = $1", [userId]);

      return loadSessionUserById(client, userId);
    }));
  } catch (error) {
    if (isPgUniqueError(error)) {
      throw new AppError("이미 가입한 이메일입니다.", 409, "EMAIL_ALREADY_EXISTS");
    }

    throw error;
  }
}

export async function verifyBuyerAccountActivation(input: {
  loginId: string;
  email: string;
  code: string;
  newPassword: string;
  token?: string;
}) {
  verifyBuyerAccountActivationToken(input.token);

  const loginId = normalizeLoginId(input.loginId);
  const email = normalizeEmail(input.email);
  const code = normalizeVerificationCode(input.code);
  assertPasswordLength(input.newPassword);

  const passwordHash = await hashPassword(input.newPassword);

  return runWithSystemDbContext(() => withTransaction(async (client) => {
    const target = assertBuyerActivationTarget(await findPasswordResetTarget(client, loginId));
    await ensureBuyerActivationEmail(client, target, email);
    const pendingResult = await client.query<PasswordResetRequestEncryptedRow>(
      `
        SELECT
          user_id,
          email_encrypted,
          email_iv,
          email_auth_tag,
          verification_code_hash,
          code_expires_at
        FROM password_reset_requests
        WHERE user_id = $1
        FOR UPDATE
      `,
      [target.user_id]
    );

    const pending = pendingResult.rows[0] ? mapPasswordResetRequestRow(pendingResult.rows[0]) : null;

    if (!pending || pending.email.toLowerCase() !== email) {
      throw new AppError(
        "기존 구매자 계정 활성화 요청을 찾지 못했습니다. 인증번호를 다시 요청해 주세요.",
        404,
        "BUYER_ACTIVATION_REQUEST_NOT_FOUND"
      );
    }

    if (pending.code_expires_at.getTime() < Date.now()) {
      await client.query("DELETE FROM password_reset_requests WHERE user_id = $1", [target.user_id]);
      throw new AppError("인증번호가 만료되었습니다. 다시 인증번호를 요청해 주세요.", 410);
    }

    if (!compareSecret(hashVerificationCode(code), pending.verification_code_hash)) {
      throw new AppError("인증번호가 올바르지 않습니다.", 400, "INVALID_VERIFICATION_CODE");
    }

    const nextEmail = buildEncryptedEmailPayload(email);
    await upsertLocalPassword(client, {
      userId: target.user_id,
      loginId,
      passwordHash
    });
    await revokeAllUserSessions(client, target.user_id);
    await client.query(
      `
        UPDATE users
        SET email_encrypted = $2,
            email_iv = $3,
            email_auth_tag = $4,
            email_lookup_hash = $5,
            updated_at = NOW()
        WHERE id = $1
      `,
      [target.user_id, nextEmail.encrypted, nextEmail.iv, nextEmail.authTag, nextEmail.lookupHash]
    );
    await client.query("DELETE FROM password_reset_requests WHERE user_id = $1", [target.user_id]);

    return createSessionForUserId(client, target.user_id);
  }));
}

export async function verifyBuyerEmailVerification(userId: string, input: { code: string }) {
  const code = normalizeVerificationCode(input.code);

  try {
    return await runWithSystemDbContext(() => withTransaction(async (client) => {
      const pendingResult = await client.query<PendingEmailVerificationEncryptedRow>(
        `
          SELECT
            user_id,
            email_encrypted,
            email_iv,
            email_auth_tag,
            verification_code_hash,
            code_expires_at
          FROM seller_email_verification_requests
          WHERE user_id = $1
          FOR UPDATE
        `,
        [userId]
      );

      const pending = pendingResult.rows[0]
        ? mapPendingEmailVerificationRow(pendingResult.rows[0])
        : null;

      if (!pending) {
        throw new AppError("인증번호 요청 내역을 찾을 수 없습니다. 다시 인증번호를 요청해 주세요.", 404);
      }

      if (pending.code_expires_at.getTime() < Date.now()) {
        await client.query("DELETE FROM seller_email_verification_requests WHERE user_id = $1", [userId]);
        throw new AppError("인증번호가 만료되었습니다. 다시 인증번호를 요청해 주세요.", 410);
      }

      if (!compareSecret(hashVerificationCode(code), pending.verification_code_hash)) {
        throw new AppError("인증번호가 올바르지 않습니다.", 400, "INVALID_VERIFICATION_CODE");
      }

      await ensureEmailAvailableForUser(client, userId, pending.email);
      const nextEmail = buildEncryptedEmailPayload(pending.email);
      await client.query(
        `
          UPDATE users
          SET email_encrypted = $2,
              email_iv = $3,
              email_auth_tag = $4,
              email_lookup_hash = $5,
              updated_at = NOW()
          WHERE id = $1
        `,
        [userId, nextEmail.encrypted, nextEmail.iv, nextEmail.authTag, nextEmail.lookupHash]
      );
      await client.query("DELETE FROM seller_email_verification_requests WHERE user_id = $1", [userId]);

      return loadSessionUserById(client, userId);
    }));
  } catch (error) {
    if (isPgUniqueError(error)) {
      throw new AppError("이미 가입한 이메일입니다.", 409, "EMAIL_ALREADY_EXISTS");
    }

    throw error;
  }
}

export async function requestPasswordReset(input: {
  loginId: string;
  email: string;
  portal?: PasswordResetPortal;
}) {
  const loginId = normalizeLoginId(input.loginId);
  const email = normalizeEmail(input.email);
  const portal = input.portal ?? "SHOP";
  const verificationCode = generateVerificationCode();
  const verificationCodeHash = hashVerificationCode(verificationCode);
  const expiresAt = new Date(Date.now() + env.SIGNUP_VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
  const encryptedEmail = buildEncryptedEmailPayload(email);

  const deliverable = await runWithSystemDbContext(() => withTransaction(async (client) => {
    await client.query("DELETE FROM password_reset_requests WHERE code_expires_at < NOW()");

    const target = await findPasswordResetTarget(client, loginId);

    if (!target) {
      return null;
    }

    if (portal === "SHOP" && target.has_local_password && !target.email) {
      throw new AppError(
        "이 계정은 가입 당시 이메일이 등록되지 않아 비밀번호 재설정 메일을 보낼 수 없습니다. 기존 계정 활성화 페이지에서 이메일 등록과 비밀번호 설정을 먼저 진행해 주세요.",
        409,
        "PASSWORD_RESET_EMAIL_NOT_REGISTERED"
      );
    }

    const isInitialBuyerPasswordSetup = portal === "SHOP" && !target.has_local_password && !target.email;
    const hasMatchingStoredEmail = Boolean(target.email && target.email.toLowerCase() === email);

    if (!isInitialBuyerPasswordSetup && !hasMatchingStoredEmail) {
      return null;
    }

    if (isInitialBuyerPasswordSetup) {
      await ensureEmailAvailableForUser(client, target.user_id, email);
    }

    await client.query(
      `
        INSERT INTO password_reset_requests (
          user_id,
          email_encrypted,
          email_iv,
          email_auth_tag,
          verification_code_hash,
          code_expires_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET email_encrypted = EXCLUDED.email_encrypted,
            email_iv = EXCLUDED.email_iv,
            email_auth_tag = EXCLUDED.email_auth_tag,
            verification_code_hash = EXCLUDED.verification_code_hash,
            code_expires_at = EXCLUDED.code_expires_at,
            updated_at = NOW()
      `,
      [
        target.user_id,
        encryptedEmail.encrypted,
        encryptedEmail.iv,
        encryptedEmail.authTag,
        verificationCodeHash,
        expiresAt
      ]
    );

    return {
      email,
      loginId: target.login_id ?? loginId,
      displayName: target.display_name,
      code: verificationCode
    };
  }));

  if (!deliverable) {
    return;
  }

  await sendPasswordResetCode(deliverable);
}

export async function requestLegacyAccountActivation(input: {
  loginId: string;
  email: string;
  token?: string;
}) {
  verifyLegacyAccountActivationToken(input.token);

  const loginId = normalizeLoginId(input.loginId);
  const email = normalizeEmail(input.email);
  const verificationCode = generateVerificationCode();
  const verificationCodeHash = hashVerificationCode(verificationCode);
  const expiresAt = new Date(Date.now() + env.SIGNUP_VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);
  const encryptedEmail = buildEncryptedEmailPayload(email);

  const deliverable = await runWithSystemDbContext(() => withTransaction(async (client) => {
    await client.query("DELETE FROM legacy_account_activation_requests WHERE code_expires_at < NOW()");
    const target = await findLegacyActivationTarget(client, loginId);

    if (!target) {
      throw new AppError(
        "기존 Threads 계정을 찾지 못했습니다. 입력한 아이디를 다시 확인해 주세요.",
        404,
        "LEGACY_ACCOUNT_NOT_FOUND"
      );
    }

    if (target.has_local_password) {
      throw new AppError(
        "이미 비밀번호가 설정된 계정입니다. 일반 로그인 또는 비밀번호 재설정을 이용해 주세요.",
        409,
        "LOCAL_AUTH_ALREADY_EXISTS"
      );
    }

    await ensureEmailAvailableForUser(client, target.user_id, email);
    await client.query(
      `
        INSERT INTO legacy_account_activation_requests (
          user_id,
          email_encrypted,
          email_iv,
          email_auth_tag,
          verification_code_hash,
          code_expires_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET email_encrypted = EXCLUDED.email_encrypted,
            email_iv = EXCLUDED.email_iv,
            email_auth_tag = EXCLUDED.email_auth_tag,
            verification_code_hash = EXCLUDED.verification_code_hash,
            code_expires_at = EXCLUDED.code_expires_at,
            updated_at = NOW()
      `,
      [
        target.user_id,
        encryptedEmail.encrypted,
        encryptedEmail.iv,
        encryptedEmail.authTag,
        verificationCodeHash,
        expiresAt
      ]
    );

    return {
      email,
      loginId: target.login_id,
      displayName: target.display_name,
      code: verificationCode
    };
  }));

  await sendLegacyAccountActivationCode(deliverable);
}

export async function verifyLegacyAccountActivation(input: {
  loginId: string;
  email: string;
  code: string;
  newPassword: string;
  token?: string;
}) {
  verifyLegacyAccountActivationToken(input.token);

  const loginId = normalizeLoginId(input.loginId);
  const email = normalizeEmail(input.email);
  const code = normalizeVerificationCode(input.code);
  assertPasswordLength(input.newPassword);

  const passwordHash = await hashPassword(input.newPassword);

  return runWithSystemDbContext(() => withTransaction(async (client) => {
    const target = await findLegacyActivationTarget(client, loginId);

    if (!target) {
      throw new AppError(
        "기존 Threads 계정을 찾지 못했습니다. 입력한 아이디를 다시 확인해 주세요.",
        404,
        "LEGACY_ACCOUNT_NOT_FOUND"
      );
    }

    if (target.has_local_password) {
      throw new AppError(
        "이미 비밀번호가 설정된 계정입니다. 일반 로그인 또는 비밀번호 재설정을 이용해 주세요.",
        409,
        "LOCAL_AUTH_ALREADY_EXISTS"
      );
    }

    const pendingResult = await client.query<LegacyActivationRequestEncryptedRow>(
      `
        SELECT
          user_id,
          email_encrypted,
          email_iv,
          email_auth_tag,
          verification_code_hash,
          code_expires_at
        FROM legacy_account_activation_requests
        WHERE user_id = $1
        FOR UPDATE
      `,
      [target.user_id]
    );

    const pending = pendingResult.rows[0]
      ? mapLegacyActivationRequestRow(pendingResult.rows[0])
      : null;

    if (!pending || pending.email.toLowerCase() !== email) {
      throw new AppError(
        "계정 전환 요청을 찾지 못했습니다. 인증번호를 다시 요청해 주세요.",
        404,
        "LEGACY_ACTIVATION_REQUEST_NOT_FOUND"
      );
    }

    if (pending.code_expires_at.getTime() < Date.now()) {
      await client.query("DELETE FROM legacy_account_activation_requests WHERE user_id = $1", [
        target.user_id
      ]);
      throw new AppError("인증번호가 만료되었습니다. 다시 요청해 주세요.", 410);
    }

    if (!compareSecret(hashVerificationCode(code), pending.verification_code_hash)) {
      throw new AppError("인증번호가 올바르지 않습니다.", 400, "INVALID_VERIFICATION_CODE");
    }

    const nextEmail = buildEncryptedEmailPayload(email);
    await ensureEmailAvailableForUser(client, target.user_id, email);
    await upsertLocalPassword(client, {
      userId: target.user_id,
      loginId,
      passwordHash
    });
    await revokeAllUserSessions(client, target.user_id);
    await client.query(
      `
        UPDATE users
        SET email_encrypted = $2,
            email_iv = $3,
            email_auth_tag = $4,
            email_lookup_hash = $5,
            seller_email_verified_at = COALESCE(seller_email_verified_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
      `,
      [target.user_id, nextEmail.encrypted, nextEmail.iv, nextEmail.authTag, nextEmail.lookupHash]
    );
    await client.query("DELETE FROM password_reset_requests WHERE user_id = $1", [target.user_id]);
    await client.query("DELETE FROM seller_email_verification_requests WHERE user_id = $1", [
      target.user_id
    ]);
    await client.query("DELETE FROM legacy_account_activation_requests WHERE user_id = $1", [
      target.user_id
    ]);
    await syncAutoAdminRoles(client, {
      id: target.user_id,
      login_id: target.login_id,
      display_name: target.display_name
    });

    return createSessionForUserId(client, target.user_id);
  }));
}

export async function verifyPasswordReset(input: {
  loginId: string;
  email: string;
  code: string;
  newPassword: string;
  portal?: PasswordResetPortal;
}) {
  const loginId = normalizeLoginId(input.loginId);
  const email = normalizeEmail(input.email);
  const code = normalizeVerificationCode(input.code);
  const portal = input.portal ?? "SHOP";

  if (input.newPassword.length < 8 || input.newPassword.length > 200) {
    throw new AppError("비밀번호는 8자 이상 200자 이하로 입력해 주세요.", 400);
  }

  const passwordHash = await hashPassword(input.newPassword);

  return runWithSystemDbContext(() => withTransaction(async (client) => {
    const target = await findPasswordResetTarget(client, loginId);

    if (!target) {
      throw new AppError("비밀번호 재설정 요청을 찾을 수 없습니다. 다시 시도해 주세요.", 404);
    }

    // Shared seller/buyer accounts can also reset from the buyer portal as long as the email matches.

    const isInitialBuyerPasswordSetup = portal === "SHOP" && !target.has_local_password && !target.email;
    const hasMatchingStoredEmail = Boolean(target.email && target.email.toLowerCase() === email);

    if (!isInitialBuyerPasswordSetup && !hasMatchingStoredEmail) {
      throw new AppError("비밀번호 재설정 요청을 찾을 수 없습니다. 다시 시도해 주세요.", 404);
    }

    const pendingResult = await client.query<PasswordResetRequestEncryptedRow>(
      `
        SELECT
          user_id,
          email_encrypted,
          email_iv,
          email_auth_tag,
          verification_code_hash,
          code_expires_at
        FROM password_reset_requests
        WHERE user_id = $1
        FOR UPDATE
      `,
      [target.user_id]
    );

    const pending = pendingResult.rows[0] ? mapPasswordResetRequestRow(pendingResult.rows[0]) : null;

    if (!pending || pending.email.toLowerCase() !== email) {
      throw new AppError("비밀번호 재설정 요청을 찾을 수 없습니다. 다시 시도해 주세요.", 404);
    }

    if (pending.code_expires_at.getTime() < Date.now()) {
      await client.query("DELETE FROM password_reset_requests WHERE user_id = $1", [target.user_id]);
      throw new AppError("인증번호가 만료되었습니다. 새 인증번호를 요청해 주세요.", 410);
    }

    if (!compareSecret(hashVerificationCode(code), pending.verification_code_hash)) {
      throw new AppError("인증번호가 올바르지 않습니다.", 400, "INVALID_VERIFICATION_CODE");
    }

    const nextEmail = buildEncryptedEmailPayload(email);
    await upsertLocalPassword(client, {
      userId: target.user_id,
      loginId,
      passwordHash
    });
    await revokeAllUserSessions(client, target.user_id);
    await client.query(
      `
        UPDATE users
        SET email_encrypted = $2,
            email_iv = $3,
            email_auth_tag = $4,
            email_lookup_hash = $5,
            seller_email_verified_at = CASE
              WHEN $6 THEN COALESCE(seller_email_verified_at, NOW())
              ELSE seller_email_verified_at
            END,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        target.user_id,
        nextEmail.encrypted,
        nextEmail.iv,
        nextEmail.authTag,
        nextEmail.lookupHash,
        portal === "ADMIN"
      ]
    );
    await client.query("DELETE FROM password_reset_requests WHERE user_id = $1", [target.user_id]);

    if (target.login_id) {
      await syncAutoAdminRoles(client, {
        id: target.user_id,
        login_id: target.login_id,
        display_name: target.display_name
      });
    }

    return createSessionForUserId(client, target.user_id);
  }));
}

export async function loginWithPassword(input: { loginId: string; password: string }) {
  const loginId = normalizeLoginId(input.loginId);

  if (input.password.length < 1) {
    throw new AppError("비밀번호를 입력해 주세요.", 400);
  }

  return runWithSystemDbContext(() => withTransaction(async (client) => {
    const accountResult = await client.query<LocalAccountEncryptedRow>(
      `
        SELECT
          u.id,
          u.display_name_encrypted,
          u.display_name_iv,
          u.display_name_auth_tag,
          u.email_encrypted,
          u.email_iv,
          u.email_auth_tag,
          u.seller_email_verified_at,
          u.is_active,
          lac.login_id,
          lac.password_hash
        FROM local_auth_credentials lac
        JOIN users u ON u.id = lac.user_id
        WHERE LOWER(lac.login_id) = LOWER($1)
        FOR UPDATE OF lac, u
      `,
      [loginId]
    );

    const account = accountResult.rows[0] ? mapLocalAccountRow(accountResult.rows[0]) : null;

    if (!account) {
      throw new AppError("아이디 또는 비밀번호가 올바르지 않습니다.", 401, "INVALID_LOGIN");
    }

    if (!account.is_active) {
      throw new AppError("비활성화된 계정입니다.", 403);
    }

    const isValidPassword = await verifyPassword(input.password, account.password_hash);

    if (!isValidPassword) {
      throw new AppError("아이디 또는 비밀번호가 올바르지 않습니다.", 401, "INVALID_LOGIN");
    }

    await syncAutoAdminRoles(client, account);
    return createSessionForUserId(client, account.id);
  }));
}

export async function changePassword(input: {
  userId: string;
  currentPassword?: string;
  newPassword: string;
}) {
  assertPasswordLength(input.newPassword);

  return runWithSystemDbContext(() => withTransaction(async (client) => {
    const accountResult = await client.query<{
      has_local_password: boolean;
      login_id: string | null;
      password_hash: string | null;
    }>(
      `
        SELECT
          ${accountLoginIdSql("account")} AS login_id,
          (account_local.user_id IS NOT NULL) AS has_local_password,
          account_local.password_hash
        FROM users u
        ${accountIdentityJoins("account", "u")}
        WHERE u.id = $1
        GROUP BY u.id, ${accountLoginIdSql("account")}, account_local.user_id, account_local.password_hash
      `,
      [input.userId]
    );

    const account = accountResult.rows[0];

    if (!account) {
      throw new AppError("사용자 정보를 찾을 수 없습니다.", 404);
    }

    if (!account.login_id) {
      throw new AppError(
        "비밀번호 로그인에 사용할 아이디를 찾을 수 없습니다.",
        409,
        "LOGIN_ID_NOT_AVAILABLE"
      );
    }

    if (account.has_local_password) {
      if (!input.currentPassword) {
        throw new AppError("현재 비밀번호를 입력해 주세요.", 400);
      }

      const isValidPassword =
        account.password_hash
          ? await verifyPassword(input.currentPassword, account.password_hash)
          : false;

      if (!isValidPassword) {
        throw new AppError(
          "현재 비밀번호가 올바르지 않습니다.",
          400,
          "INVALID_CURRENT_PASSWORD"
        );
      }
    }

    const passwordHash = await hashPassword(input.newPassword);

    await upsertLocalPassword(client, {
      userId: input.userId,
      loginId: account.login_id,
      passwordHash
    });
    await revokeAllUserSessions(client, input.userId);

    return createSessionForUserId(client, input.userId);
  }));
}

export async function getSessionUser(sessionToken?: string) {
  if (!sessionToken) {
    return null;
  }

  return runWithSystemDbContext(() => getUserBySessionHash(hashSessionToken(sessionToken)));
}

export async function updateProfile(
  userId: string,
  input: {
    displayName: string;
    profileImageUrl: string | null;
  }
) {
  const displayName = normalizeDisplayName(input.displayName);
  const profileImageUrl = normalizeProfileImageUrl(input.profileImageUrl);
  const encryptedDisplayName = buildEncryptedDisplayNamePayload(displayName);

  return runWithSystemDbContext(() => withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `
        UPDATE users
        SET display_name_encrypted = $2,
            display_name_iv = $3,
            display_name_auth_tag = $4,
            profile_image_url = $5,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `,
      [
        userId,
        encryptedDisplayName.encrypted,
        encryptedDisplayName.iv,
        encryptedDisplayName.authTag,
        profileImageUrl,
      ]
    );

    if (!result.rows[0]) {
      throw new AppError("사용자 정보를 찾을 수 없습니다.", 404);
    }

    return loadSessionUserById(client, userId);
  }));
}

export async function updateProfileImage(userId: string, rawProfileImageUrl: string | null) {
  const profileImageUrl = normalizeProfileImageUrl(rawProfileImageUrl);

  return runWithSystemDbContext(() => withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `
        UPDATE users
        SET profile_image_url = $2,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `,
      [userId, profileImageUrl]
    );

    if (!result.rows[0]) {
      throw new AppError("사용자 정보를 찾을 수 없습니다.", 404);
    }

    return loadSessionUserById(client, userId);
  }));
}

export function setSessionCookie(response: Response, sessionToken: string, expiresAt: Date) {
  response.cookie(env.SESSION_COOKIE_NAME, sessionToken, cookieOptions(expiresAt));
}

export function setSellerApprovalAuthCookie(
  response: Response,
  sessionToken: string,
  userId: string,
  authVersion: string
) {
  response.cookie(
    sellerApprovalAuthCookieName,
    getSellerApprovalCookieValue(sessionToken, userId, authVersion),
    cookieOptions(addMinutes(env.SELLER_APPROVAL_AUTH_TTL_MINUTES))
  );
}

export function hasSellerApprovalAuthCookie(input: {
  sessionToken?: string;
  userId: string;
  cookieValue?: string;
  authVersion?: string;
}) {
  if (!input.sessionToken || !input.cookieValue || !input.authVersion) {
    return false;
  }

  return compareSecret(
    input.cookieValue,
    getSellerApprovalCookieValue(input.sessionToken, input.userId, input.authVersion)
  );
}

export async function logout(sessionToken?: string) {
  if (!sessionToken) {
    return;
  }

  await runWithSystemDbContext(() => query(
    `
      UPDATE user_sessions
      SET revoked_at = NOW(),
          updated_at = NOW()
      WHERE session_token_hash = $1
    `,
    [hashSessionToken(sessionToken)]
  ));
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(env.SESSION_COOKIE_NAME, cookieOptions());
}

export function clearSellerApprovalAuthCookie(response: Response) {
  response.clearCookie(sellerApprovalAuthCookieName, cookieOptions());
}
