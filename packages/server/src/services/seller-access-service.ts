import { query, withTransaction } from "../../../db/src/index.js";
import type {
  SellerAccessOverview,
  SellerAccessRequestRecord,
  SessionUser
} from "../../../shared/src/index.js";

import { AppError } from "../errors.js";

import { ensureSellerProfile } from "./auth-service.js";

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

async function getLatestRequestRow(userId: string) {
  const result = await query<SellerAccessRequestRow>(
    `
      SELECT
        sar.id,
        sar.user_id,
        applicant.display_name AS applicant_display_name,
        applicant_auth.provider_username AS applicant_threads_username,
        sar.status,
        sar.requested_at,
        sar.reviewed_at,
        reviewer.display_name AS reviewer_display_name
      FROM seller_access_requests sar
      JOIN users applicant ON applicant.id = sar.user_id
      LEFT JOIN auth_accounts applicant_auth
        ON applicant_auth.user_id = applicant.id
       AND applicant_auth.provider = 'THREADS'
      LEFT JOIN users reviewer ON reviewer.id = sar.reviewed_by
      WHERE sar.user_id = $1
      ORDER BY sar.requested_at DESC
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
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
    throw new AppError("이미 판매자 권한이 승인된 계정입니다.", 409);
  }

  return withTransaction(async (client) => {
    const pendingResult = await client.query<SellerAccessRequestRow>(
      `
        SELECT
          sar.id,
          sar.user_id,
          applicant.display_name AS applicant_display_name,
          applicant_auth.provider_username AS applicant_threads_username,
          sar.status,
          sar.requested_at,
          sar.reviewed_at,
          reviewer.display_name AS reviewer_display_name
        FROM seller_access_requests sar
        JOIN users applicant ON applicant.id = sar.user_id
        LEFT JOIN auth_accounts applicant_auth
          ON applicant_auth.user_id = applicant.id
         AND applicant_auth.provider = 'THREADS'
        LEFT JOIN users reviewer ON reviewer.id = sar.reviewed_by
        WHERE sar.user_id = $1
          AND sar.status = 'PENDING'
        ORDER BY sar.requested_at DESC
        LIMIT 1
        FOR UPDATE OF sar
      `,
      [user.id]
    );

    if (pendingResult.rows[0]) {
      return mapSellerAccessRequest(pendingResult.rows[0]);
    }

    const inserted = await client.query<SellerAccessRequestRow>(
      `
        WITH inserted AS (
          INSERT INTO seller_access_requests (user_id, status)
          VALUES ($1, 'PENDING')
          RETURNING id, user_id, status, requested_at, reviewed_at, reviewed_by
        )
        SELECT
          inserted.id,
          inserted.user_id,
          applicant.display_name AS applicant_display_name,
          applicant_auth.provider_username AS applicant_threads_username,
          inserted.status,
          inserted.requested_at,
          inserted.reviewed_at,
          reviewer.display_name AS reviewer_display_name
        FROM inserted
        JOIN users applicant ON applicant.id = inserted.user_id
        LEFT JOIN auth_accounts applicant_auth
          ON applicant_auth.user_id = applicant.id
         AND applicant_auth.provider = 'THREADS'
        LEFT JOIN users reviewer ON reviewer.id = inserted.reviewed_by
      `,
      [user.id]
    );

    return mapSellerAccessRequest(inserted.rows[0]);
  });
}

export async function listPendingSellerAccessRequests() {
  const result = await query<SellerAccessRequestRow>(
    `
      SELECT
        sar.id,
        sar.user_id,
        applicant.display_name AS applicant_display_name,
        applicant_auth.provider_username AS applicant_threads_username,
        sar.status,
        sar.requested_at,
        sar.reviewed_at,
        reviewer.display_name AS reviewer_display_name
      FROM seller_access_requests sar
      JOIN users applicant ON applicant.id = sar.user_id
      LEFT JOIN auth_accounts applicant_auth
        ON applicant_auth.user_id = applicant.id
       AND applicant_auth.provider = 'THREADS'
      LEFT JOIN users reviewer ON reviewer.id = sar.reviewed_by
      WHERE sar.status = 'PENDING'
      ORDER BY sar.requested_at ASC
    `
  );

  return result.rows.map(mapSellerAccessRequest);
}

export async function approveSellerAccessRequest(requestId: string, reviewerId: string) {
  return withTransaction(async (client) => {
    const requestResult = await client.query<{
      id: string;
      user_id: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
      applicant_display_name: string;
    }>(
      `
        SELECT
          sar.id,
          sar.user_id,
          sar.status,
          applicant.display_name AS applicant_display_name
        FROM seller_access_requests sar
        JOIN users applicant ON applicant.id = sar.user_id
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

    await ensureSellerProfile(client, requestRow.user_id, requestRow.applicant_display_name);

    const updated = await client.query<SellerAccessRequestRow>(
      `
        SELECT
          sar.id,
          sar.user_id,
          applicant.display_name AS applicant_display_name,
          applicant_auth.provider_username AS applicant_threads_username,
          sar.status,
          sar.requested_at,
          sar.reviewed_at,
          reviewer.display_name AS reviewer_display_name
        FROM seller_access_requests sar
        JOIN users applicant ON applicant.id = sar.user_id
        LEFT JOIN auth_accounts applicant_auth
          ON applicant_auth.user_id = applicant.id
         AND applicant_auth.provider = 'THREADS'
        LEFT JOIN users reviewer ON reviewer.id = sar.reviewed_by
        WHERE sar.id = $1
      `,
      [requestId]
    );

    return mapSellerAccessRequest(updated.rows[0]);
  });
}
