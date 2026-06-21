import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

import { env } from "../env.js";

type EncryptedPayloadInput = {
  encrypted: string;
  iv: string;
  authTag: string;
};

export type EncryptedDisplayNameColumns = {
  display_name_encrypted: string;
  display_name_iv: string;
  display_name_auth_tag: string;
};

export type EncryptedEmailColumns = {
  email_encrypted: string | null;
  email_iv: string | null;
  email_auth_tag: string | null;
};

function getPiiSecretSource() {
  const piiSecret = env.PII_ENCRYPTION_SECRET.trim();

  if (piiSecret) {
    return piiSecret;
  }

  const fallback = env.SESSION_SECRET.trim();

  if (!fallback) {
    throw new Error("A PII encryption secret is required to encrypt or decrypt personal data.");
  }

  return fallback;
}

function deriveKey(scope: string) {
  return createHash("sha256")
    .update(`jinmarket:${scope}:${getPiiSecretSource()}`)
    .digest();
}

export function encryptPiiText(value: string): EncryptedPayloadInput {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey("pii-data"), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

export function decryptPiiText(input: EncryptedPayloadInput) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey("pii-data"),
    Buffer.from(input.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(input.authTag, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(input.encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptDisplayName(row: EncryptedDisplayNameColumns) {
  return decryptPiiText({
    encrypted: row.display_name_encrypted,
    iv: row.display_name_iv,
    authTag: row.display_name_auth_tag,
  });
}

export function decryptOptionalEmail(row: EncryptedEmailColumns) {
  if (!row.email_encrypted) {
    return null;
  }

  if (!row.email_iv || !row.email_auth_tag) {
    throw new Error("Encrypted email data is incomplete.");
  }

  return decryptPiiText({
    encrypted: row.email_encrypted,
    iv: row.email_iv,
    authTag: row.email_auth_tag,
  });
}

export function hashEmailLookup(email: string) {
  return createHmac("sha256", deriveKey("pii-email-lookup"))
    .update(email.trim().toLowerCase())
    .digest("hex");
}

export function maskEmailAddress(email: string | null | undefined) {
  if (!email) {
    return null;
  }

  const normalized = email.trim();
  const atIndex = normalized.indexOf("@");

  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return "***";
  }

  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const visibleLocal = local.length <= 2 ? local[0] : `${local[0]}${local[1]}`;
  const maskedLocal = `${visibleLocal}${"*".repeat(Math.max(local.length - visibleLocal.length, 1))}`;

  return `${maskedLocal}@${domain}`;
}
