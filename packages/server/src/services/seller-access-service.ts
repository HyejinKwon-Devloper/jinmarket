import { query, withTransaction, type DbClient } from "@jinmarket/db";
import type {
  SellerAccessOverview,
  SellerAccessRequestRecord,
  SessionUser
} from "../../../shared/src/index.js";

import { AppError } from "../errors.js";

import { safeUserLoginIdSql } from "./account-sql.js";
import { ensureSellerProfile } from "./auth-service.js";
import { loadUserIdentityMap } from "./user-identity-service.js";

type SellerAccessRequestRow = {
  id: string;
  user_id: string;
  applicant_display_name: string;
  applicant_threads_username: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requested_at: Date;
  reviewed_at: Date | null;
  reviewer_display_name: string | null;
};

type SellerAccessRequestQueryRow = Omit<
  SellerAccessRequestRow,
  "applicant_display_name" | "reviewer_display_name"
> & {
  reviewed_by: string | null;
};

function mapSellerAccessRequest(row: SellerAccessRequestRow): SellerAccessRequestRecord {
  return {
    id: row.id,
    userId: row.user_id,
    applicantDisplayName: row.applicant_display_name,
    applicantThreadsUsername: row.applicant_threads_username,
    status: row.status,
    requestedAt: row.requested_at.toISOString(),
    reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
    reviewerDisplayName: row.reviewer_display_name
  };
}

function hasSellerRole(user: SessionUser) {
  return user.roles.includes("SELLER") || user.roles.includes("ADMIN");
}

function isAdminUser(user: SessionUser) {
  return user.roles.includes("ADMIN");
}

async function hydrateSellerAccessRequestRows(
  rows: SellerAccessRequestQueryRow[],
  client?: DbClient
) {
  const identities = await loadUserIdentityMap(
    rows.flatMap((row) => [row.user_id, row.reviewed_by]),
    client
  );

  return rows.map((row) => {
    const applicant = identities.get(row.user_id);
    const reviewer = row.reviewed_by ? identities.get(row.reviewed_by) : null;

    if (!applicant) {
      throw new Error("Failed to load seller access applicant identity.");
    }

    return {
      ...row,
      applicant_display_name: applicant.displayName,
      reviewer_display_name: reviewer?.displayName ?? null
    } satisfies SellerAccessRequestRow;
  });
}

async function getLatestRequestRow(userId: string) {
  const result = await query<SellerAccessRequestQueryRow>(
    `
      SELECT
        sar.id,
        sar.user_id,
        ${safeUserLoginIdSql("sar.user_id")} AS applicant_threads_username,
        sar.status,
        sar.requested_at,
        sar.reviewed_at,
        sar.reviewed_by
      FROM seller_access_requests sar
      WHERE sar.user_id = $1
      ORDER BY sar.requested_at DESC
      LIMIT 1
    `,
    [userId]
  );

  const rows = await hydrateSellerAccessRequestRows(result.rows);
  return rows[0] ?? null;
}

export async function getSellerAccessOverview(user: SessionUser): Promise<SellerAccessOverview> {
  const latestRequest = await getLatestRequestRow(user.id);

  return {
    canSell: hasSellerRole(user),
    isAdmin: isAdminUser(user),
    latestRequest: latestRequest ? mapSellerAccessRequest(latestRequest) : null
  };
}

export async function createSellerAccessRequest(user: SessionUser) {
  if (hasSellerRole(user)) {
    throw new AppError("이미 판매 권한이 있는 계정입니다.", 409);
  }

  return withTransaction(async (client) => {
    const pendingResult = await client.query<SellerAccessRequestQueryRow>(
      `
        SELECT
          sar.id,
          sar.user_id,
          ${safeUserLoginIdSql("sar.user_id")} AS applicant_threads_username,
          sar.status,
          sar.requested_at,
          sar.reviewed_at,
          sar.reviewed_by
        FROM seller_access_requests sar
        WHERE sar.user_id = $1
          AND sar.status = 'PENDING'
        ORDER BY sar.requested_at DESC
        LIMIT 1
      `,
      [user.id]
    );

    if (pendingResult.rows[0]) {
      return mapSellerAccessRequest((await hydrateSellerAccessRequestRows(pendingResult.rows, client))[0]);
    }

    const inserted = await client.query<SellerAccessRequestQueryRow>(
      `
        WITH inserted AS (
          INSERT INTO seller_access_requests (user_id, status)
          VALUES ($1, 'PENDING')
          RETURNING id, user_id, status, requested_at, reviewed_at, reviewed_by
        )
        SELECT
          inserted.id,
          inserted.user_id,
          ${safeUserLoginIdSql("inserted.user_id")} AS applicant_threads_username,
          inserted.status,
          inserted.requested_at,
          inserted.reviewed_at,
          inserted.reviewed_by
        FROM inserted
      `,
      [user.id]
    );

    return mapSellerAccessRequest((await hydrateSellerAccessRequestRows(inserted.rows, client))[0]);
  });
}

export async function listPendingSellerAccessRequests() {
  const result = await query<SellerAccessRequestQueryRow>(
    `
      SELECT
        sar.id,
        sar.user_id,
        ${safeUserLoginIdSql("sar.user_id")} AS applicant_threads_username,
        sar.status,
        sar.requested_at,
        sar.reviewed_at,
        sar.reviewed_by
      FROM seller_access_requests sar
      WHERE sar.status = 'PENDING'
      ORDER BY sar.requested_at ASC
    `
  );

  return (await hydrateSellerAccessRequestRows(result.rows)).map(mapSellerAccessRequest);
}

export async function approveSellerAccessRequest(requestId: string, reviewerId: string) {
  return withTransaction(async (client) => {
    const requestResult = await client.query<{
      id: string;
      user_id: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
    }>(
      `
        SELECT
          sar.id,
          sar.user_id,
          sar.status
        FROM seller_access_requests sar
        WHERE sar.id = $1
        FOR UPDATE
      `,
      [requestId]
    );

    const requestRow = requestResult.rows[0];

    if (!requestRow) {
      throw new AppError("승인 요청을 찾을 수 없습니다.", 404);
    }

    if (requestRow.status !== "PENDING") {
      throw new AppError("이미 처리된 판매자 승인 요청입니다.", 409);
    }

    await client.query(
      `
        UPDATE seller_access_requests
        SET status = 'APPROVED',
            reviewed_by = $2,
            reviewed_at = NOW()
        WHERE id = $1
      `,
      [requestId, reviewerId]
    );

    await client.query(
      `
        INSERT INTO user_roles (user_id, role)
        VALUES ($1, 'SELLER')
        ON CONFLICT DO NOTHING
      `,
      [requestRow.user_id]
    );

    const requestIdentity = await loadUserIdentityMap([requestRow.user_id], client);
    const applicantDisplayName = requestIdentity.get(requestRow.user_id)?.displayName;

    if (!applicantDisplayName) {
      throw new Error("Failed to load seller access applicant identity.");
    }

    await ensureSellerProfile(client, requestRow.user_id, applicantDisplayName);

    const updated = await client.query<SellerAccessRequestQueryRow>(
      `
        SELECT
          sar.id,
          sar.user_id,
          ${safeUserLoginIdSql("sar.user_id")} AS applicant_threads_username,
          sar.status,
          sar.requested_at,
          sar.reviewed_at,
          sar.reviewed_by
        FROM seller_access_requests sar
        WHERE sar.id = $1
      `,
      [requestId]
    );

    return mapSellerAccessRequest((await hydrateSellerAccessRequestRows(updated.rows, client))[0]);
  });
}
