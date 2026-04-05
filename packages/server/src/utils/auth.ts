import { createHash, randomBytes } from "node:crypto";

import { env } from "../env.js";

export function generateSessionToken() {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(`${token}:${env.SESSION_SECRET}`).digest("hex");
}

export function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

