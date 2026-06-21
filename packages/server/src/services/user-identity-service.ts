import { query, runWithSystemDbContext, type DbClient } from "@jinmarket/db";

import { decryptDisplayName, decryptOptionalEmail } from "../utils/pii.js";

import { accountIdentityJoins, accountLoginIdSql } from "./account-sql.js";

type UserIdentityRow = {
  user_id: string;
  display_name_encrypted: string;
  display_name_iv: string;
  display_name_auth_tag: string;
  email_encrypted: string | null;
  email_iv: string | null;
  email_auth_tag: string | null;
  login_id: string | null;
};

export type UserIdentityRecord = {
  userId: string;
  displayName: string;
  email: string | null;
  loginId: string | null;
};

function mapUserIdentity(row: UserIdentityRow): UserIdentityRecord {
  return {
    userId: row.user_id,
    displayName: decryptDisplayName(row),
    email: decryptOptionalEmail(row),
    loginId: row.login_id,
  };
}

export async function loadUserIdentityMap(
  userIds: Array<string | null | undefined>,
  client?: DbClient,
) {
  const normalizedIds = [...new Set(userIds.filter((value): value is string => Boolean(value)))];

  if (normalizedIds.length === 0) {
    return new Map<string, UserIdentityRecord>();
  }

  const identityQuery = `
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
    WHERE u.id = ANY($1::uuid[])
    GROUP BY u.id, ${accountLoginIdSql("account")}
  `;

  // These lookups hydrate already-authorized responses after product/event/order row filtering,
  // so non-transactional callers need SYSTEM visibility to keep working under user-table RLS.
  const result = client
    ? await client.query<UserIdentityRow>(identityQuery, [normalizedIds])
    : await runWithSystemDbContext(() =>
        query<UserIdentityRow>(identityQuery, [normalizedIds]),
      );

  return new Map(result.rows.map((row) => [row.user_id, mapUserIdentity(row)]));
}
