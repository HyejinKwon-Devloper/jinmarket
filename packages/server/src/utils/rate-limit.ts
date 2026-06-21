type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type ConsumeRateLimitInput = {
  key: string;
  max: number;
  windowMs: number;
};

type ConsumeRateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
};

const buckets = new Map<string, RateLimitBucket>();

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function consumeRateLimit(input: ConsumeRateLimitInput): ConsumeRateLimitResult {
  const now = Date.now();

  pruneExpiredBuckets(now);

  const existing = buckets.get(input.key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + input.windowMs;
    buckets.set(input.key, {
      count: 1,
      resetAt
    });

    return {
      allowed: true,
      remaining: Math.max(input.max - 1, 0),
      resetAt,
      retryAfterMs: 0
    };
  }

  if (existing.count >= input.max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterMs: Math.max(existing.resetAt - now, 0)
    };
  }

  existing.count += 1;

  return {
    allowed: true,
    remaining: Math.max(input.max - existing.count, 0),
    resetAt: existing.resetAt,
    retryAfterMs: 0
  };
}
