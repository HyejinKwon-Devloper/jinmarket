import { createHmac, randomBytes } from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function normalizeBase32(input: string) {
  return input
    .toUpperCase()
    .replace(/=+$/g, "")
    .replace(/[\s-]+/g, "");
}

export function generateTotpSecret(byteLength = 20) {
  return encodeBase32(randomBytes(byteLength));
}

export function encodeBase32(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += base32Alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(input: string) {
  const normalized = normalizeBase32(input);

  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw new Error("Invalid base32 secret.");
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of normalized) {
    value = (value << 5) | base32Alphabet.indexOf(character);
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function buildTotpOtpauthUrl(input: {
  issuer: string;
  accountName: string;
  secret: string;
  digits?: number;
  periodSeconds?: number;
}) {
  const issuer = input.issuer.trim();
  const accountName = input.accountName.trim();
  const digits = input.digits ?? 6;
  const periodSeconds = input.periodSeconds ?? 30;
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(digits),
    period: String(periodSeconds)
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

function generateHotp(secret: Buffer, counter: number, digits: number) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binaryCode =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binaryCode % 10 ** digits).toString().padStart(digits, "0");
}

export function getTotpTimeStep(timestamp = Date.now(), periodSeconds = 30) {
  return Math.floor(timestamp / 1000 / periodSeconds);
}

export function verifyTotpToken(input: {
  secret: string;
  token: string;
  digits?: number;
  periodSeconds?: number;
  window?: number;
  timestamp?: number;
}) {
  const secret = decodeBase32(input.secret);
  const digits = input.digits ?? 6;
  const periodSeconds = input.periodSeconds ?? 30;
  const window = input.window ?? 1;
  const timestamp = input.timestamp ?? Date.now();
  const currentStep = getTotpTimeStep(timestamp, periodSeconds);

  for (let offset = -window; offset <= window; offset += 1) {
    const step = currentStep + offset;

    if (step < 0) {
      continue;
    }

    if (generateHotp(secret, step, digits) === input.token) {
      return {
        step,
        delta: offset
      };
    }
  }

  return null;
}
