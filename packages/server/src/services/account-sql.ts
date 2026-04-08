export function accountIdentityJoins(identityAlias: string, userAlias = identityAlias) {
  return `
      LEFT JOIN local_auth_credentials ${identityAlias}_local ON ${identityAlias}_local.user_id = ${userAlias}.id
      LEFT JOIN auth_accounts ${identityAlias}_auth
        ON ${identityAlias}_auth.user_id = ${userAlias}.id
       AND ${identityAlias}_auth.provider = 'THREADS'
  `;
}

export function accountLoginIdSql(identityAlias: string) {
  return `COALESCE(${identityAlias}_local.login_id, ${identityAlias}_auth.provider_username)`;
}
