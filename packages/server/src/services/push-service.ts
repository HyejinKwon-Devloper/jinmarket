import webpush from "web-push";

import { query } from "@jinmarket/db";
import type {
  PushApp,
  PushAudienceRole,
  PushAudienceSummary,
  PushRecipientRecord,
  WebPushSubscriptionPayload
} from "../../../shared/src/index.js";

import { env } from "../env.js";
import { accountIdentityJoins, accountLoginIdSql } from "./account-sql.js";

type StoredSubscriptionRow = {
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  expiration_time: string | number | null;
};

export type PushNotificationInput = {
  userId: string;
  app: PushApp;
  title: string;
  body: string;
  url: string;
  tag?: string;
  requireInteraction?: boolean;
};

type PushDeliveryResult = {
  attempted: number;
  delivered: number;
  skipped?: "no-subscriptions" | "vapid-not-configured";
};

type PushAudienceSummaryRow = {
  role: PushAudienceRole;
  total_users: string | number;
  subscribed_users: string | number;
};

type PushRecipientRow = {
  user_id: string;
  display_name: string;
  login_id: string | null;
  email: string | null;
  roles: string[] | null;
  subscription_count: string | number;
  last_seen_at: Date | null;
};

let vapidConfigured = false;

function hasWebPushConfiguration() {
  return Boolean(
    env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY &&
      env.WEB_PUSH_VAPID_PRIVATE_KEY &&
      env.WEB_PUSH_VAPID_SUBJECT
  );
}

function ensureWebPushConfiguration() {
  if (!hasWebPushConfiguration()) {
    return false;
  }

  if (!vapidConfigured) {
    webpush.setVapidDetails(
      env.WEB_PUSH_VAPID_SUBJECT,
      env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY,
      env.WEB_PUSH_VAPID_PRIVATE_KEY
    );
    vapidConfigured = true;
  }

  return true;
}

function buildPushPayload(input: Omit<PushNotificationInput, "userId" | "app">) {
  return JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url,
    tag: input.tag,
    requireInteraction: input.requireInteraction ?? false,
    icon: "/icon-192.png",
    badge: "/icon-192.png"
  });
}

function getPushErrorStatusCode(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return null;
  }

  const rawStatusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof rawStatusCode === "number" ? rawStatusCode : null;
}

function normalizeExpirationTime(value: string | number | null) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeCount(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function mapPushAudienceSummary(row: PushAudienceSummaryRow): PushAudienceSummary {
  return {
    role: row.role,
    totalUsers: normalizeCount(row.total_users),
    subscribedUsers: normalizeCount(row.subscribed_users)
  };
}

function isPushAudienceRole(value: string): value is PushAudienceRole {
  return value === "ADMIN" || value === "SELLER" || value === "BUYER";
}

function mapPushRecipient(row: PushRecipientRow): PushRecipientRecord {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    loginId: row.login_id,
    email: row.email,
    roles: (row.roles ?? []).filter(isPushAudienceRole),
    subscriptionCount: normalizeCount(row.subscription_count),
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null
  };
}

export function getPublicWebPushKey() {
  return env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || null;
}

export function isWebPushConfigured() {
  return hasWebPushConfiguration();
}

export async function saveWebPushSubscription(input: {
  userId: string;
  app: PushApp;
  subscription: WebPushSubscriptionPayload;
  userAgent?: string | null;
}) {
  await query(
    `
      INSERT INTO web_push_subscriptions (
        user_id,
        app,
        endpoint,
        p256dh_key,
        auth_key,
        expiration_time,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (endpoint)
      DO UPDATE
      SET user_id = EXCLUDED.user_id,
          app = EXCLUDED.app,
          p256dh_key = EXCLUDED.p256dh_key,
          auth_key = EXCLUDED.auth_key,
          expiration_time = EXCLUDED.expiration_time,
          user_agent = EXCLUDED.user_agent,
          updated_at = NOW(),
          last_seen_at = NOW()
    `,
    [
      input.userId,
      input.app,
      input.subscription.endpoint,
      input.subscription.keys.p256dh,
      input.subscription.keys.auth,
      input.subscription.expirationTime ?? null,
      input.userAgent ?? null
    ]
  );
}

export async function removeWebPushSubscription(userId: string, endpoint: string) {
  await query("DELETE FROM web_push_subscriptions WHERE user_id = $1 AND endpoint = $2", [
    userId,
    endpoint
  ]);
}

export async function sendPushNotificationToUser(input: PushNotificationInput) {
  const subscriptions = await query<StoredSubscriptionRow>(
    `
      SELECT endpoint, p256dh_key, auth_key, expiration_time
      FROM web_push_subscriptions
      WHERE user_id = $1
        AND app = $2
      ORDER BY updated_at DESC
    `,
    [input.userId, input.app]
  );

  if (subscriptions.rows.length === 0) {
    return { attempted: 0, delivered: 0, skipped: "no-subscriptions" } satisfies PushDeliveryResult;
  }

  if (!ensureWebPushConfiguration()) {
    console.info(
      `[web-push] skipped userId=${input.userId} app=${input.app} reason=vapid-not-configured`
    );

    return {
      attempted: subscriptions.rows.length,
      delivered: 0,
      skipped: "vapid-not-configured"
    } satisfies PushDeliveryResult;
  }

  const payload = buildPushPayload(input);
  let delivered = 0;

  for (const subscription of subscriptions.rows) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: normalizeExpirationTime(subscription.expiration_time),
          keys: {
            p256dh: subscription.p256dh_key,
            auth: subscription.auth_key
          }
        },
        payload
      );
      delivered += 1;
    } catch (error) {
      const statusCode = getPushErrorStatusCode(error);

      console.error(
        `[web-push] send failed userId=${input.userId} app=${input.app} endpoint=${subscription.endpoint} statusCode=${statusCode ?? "unknown"}`,
        error
      );

      if (statusCode === 404 || statusCode === 410) {
        await query("DELETE FROM web_push_subscriptions WHERE endpoint = $1", [
          subscription.endpoint
        ]);
      }
    }
  }

  return {
    attempted: subscriptions.rows.length,
    delivered
  } satisfies PushDeliveryResult;
}

export async function listPushAudienceSummaries(app: PushApp) {
  const result = await query<PushAudienceSummaryRow>(
    `
      WITH role_counts AS (
        SELECT
          ur.role::text AS role,
          COUNT(DISTINCT ur.user_id)::int AS total_users
        FROM user_roles ur
        JOIN users u ON u.id = ur.user_id
        WHERE u.is_active = TRUE
          AND ur.role::text IN ('ADMIN', 'SELLER', 'BUYER')
        GROUP BY ur.role
      ),
      subscribed_counts AS (
        SELECT
          ur.role::text AS role,
          COUNT(DISTINCT ur.user_id)::int AS subscribed_users
        FROM user_roles ur
        JOIN users u ON u.id = ur.user_id
        JOIN web_push_subscriptions wps
          ON wps.user_id = ur.user_id
         AND wps.app = $1
        WHERE u.is_active = TRUE
          AND ur.role::text IN ('ADMIN', 'SELLER', 'BUYER')
        GROUP BY ur.role
      )
      SELECT
        role_counts.role,
        role_counts.total_users,
        COALESCE(subscribed_counts.subscribed_users, 0) AS subscribed_users
      FROM role_counts
      LEFT JOIN subscribed_counts ON subscribed_counts.role = role_counts.role
      ORDER BY
        CASE role_counts.role
          WHEN 'ADMIN' THEN 1
          WHEN 'SELLER' THEN 2
          WHEN 'BUYER' THEN 3
          ELSE 9
        END
    `,
    [app]
  );

  return result.rows.map(mapPushAudienceSummary);
}

export async function listPushRecipients(input: {
  app: PushApp;
  roles?: PushAudienceRole[];
  search?: string | null;
  limit?: number;
}) {
  const roleFilter = input.roles && input.roles.length > 0 ? input.roles : null;
  const search = input.search?.trim() ? input.search.trim() : null;
  const limit = input.limit ?? 120;
  const loginIdSql = accountLoginIdSql("recipient");

  const result = await query<PushRecipientRow>(
    `
      SELECT
        u.id AS user_id,
        u.display_name,
        ${loginIdSql} AS login_id,
        u.email,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT ur.role::text), NULL) AS roles,
        COUNT(DISTINCT wps.id)::int AS subscription_count,
        MAX(wps.last_seen_at) AS last_seen_at
      FROM users u
      JOIN web_push_subscriptions wps
        ON wps.user_id = u.id
       AND wps.app = $1
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      ${accountIdentityJoins("recipient", "u")}
      WHERE u.is_active = TRUE
        AND (
          $2::text[] IS NULL
          OR EXISTS (
            SELECT 1
            FROM user_roles role_filter
            WHERE role_filter.user_id = u.id
              AND role_filter.role::text = ANY($2::text[])
          )
        )
        AND (
          $3::text IS NULL
          OR u.display_name ILIKE '%' || $3 || '%'
          OR COALESCE(${loginIdSql}, '') ILIKE '%' || $3 || '%'
          OR COALESCE(u.email, '') ILIKE '%' || $3 || '%'
        )
      GROUP BY
        u.id,
        u.display_name,
        ${loginIdSql},
        u.email
      ORDER BY
        MAX(wps.last_seen_at) DESC NULLS LAST,
        u.display_name ASC
      LIMIT $4
    `,
    [input.app, roleFilter, search, limit]
  );

  return result.rows.map(mapPushRecipient);
}

export async function sendPushNotificationToUsers(
  input: Omit<PushNotificationInput, "userId"> & { userIds: string[] }
) {
  const uniqueUserIds = [...new Set(input.userIds)];
  let attempted = 0;
  let delivered = 0;
  let usersWithDelivery = 0;
  let usersWithoutSubscriptions = 0;
  let usersSkippedDueToConfig = 0;

  for (const userId of uniqueUserIds) {
    const result = await sendPushNotificationToUser({
      userId,
      app: input.app,
      title: input.title,
      body: input.body,
      url: input.url,
      tag: input.tag,
      requireInteraction: input.requireInteraction
    });

    attempted += result.attempted;
    delivered += result.delivered;

    if (result.delivered > 0) {
      usersWithDelivery += 1;
      continue;
    }

    if (result.skipped === "no-subscriptions") {
      usersWithoutSubscriptions += 1;
      continue;
    }

    if (result.skipped === "vapid-not-configured") {
      usersSkippedDueToConfig += 1;
    }
  }

  return {
    requestedUsers: uniqueUserIds.length,
    usersWithDelivery,
    usersWithoutSubscriptions,
    usersSkippedDueToConfig,
    attempted,
    delivered
  };
}

export async function sendTestPushNotification(userId: string, app: PushApp) {
  return sendPushNotificationToUser({
    userId,
    app,
    title: "JINMARKET 알림 테스트",
    body:
      app === "ADMIN"
        ? "판매자 센터 푸시 알림이 정상적으로 연결되었습니다."
        : "구매자 앱 푸시 알림이 정상적으로 연결되었습니다.",
    url: app === "ADMIN" ? "/products" : "/my/orders",
    tag: `push-test:${app.toLowerCase()}`
  });
}
