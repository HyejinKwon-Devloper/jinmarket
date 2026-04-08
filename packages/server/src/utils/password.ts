import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { env } from "../env.js";

const scrypt = promisify(scryptCallback);
const passwordKeyLength = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, passwordKeyLength)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltHex, derivedKeyHex] = storedHash.split(":");

  if (algorithm !== "scrypt" || !saltHex || !derivedKeyHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const storedDerivedKey = Buffer.from(derivedKeyHex, "hex");
  const actualDerivedKey = (await scrypt(password, salt, storedDerivedKey.length)) as Buffer;

  if (actualDerivedKey.length !== storedDerivedKey.length) {
    return false;
  }

  return timingSafeEqual(actualDerivedKey, storedDerivedKey);
}

export function hashVerificationCode(code: string) {
  return createHash("sha256").update(`${code}:${env.SESSION_SECRET}`).digest("hex");
}
