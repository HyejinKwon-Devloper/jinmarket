// 웹 푸시 구독 upsert의 RLS 동작 검증 스크립트.
//
// 검증 시나리오:
//   1) 유저 A가 endpoint X로 구독한다.
//   2) 유저 B 컨텍스트(일반 api_app)에서 같은 endpoint로 upsert를 시도하면
//      RLS UPDATE 정책 USING 위반(42501)으로 실패해야 한다. (수정 전 버그 재현)
//   3) 유저 B + SYSTEM 롤 컨텍스트에서 upsert 하면 성공하고, 행의 user_id가
//      B로 이전되어야 한다. (push-service.ts의 수정 동작)
//
// 실행: node scripts/verify-push-subscription-rls.mjs
// 사전조건: .env의 DATABASE_URL, api_app 롤, RLS 마이그레이션 적용 완료.

// 로컬/사설 인증서 DB 연결 허용 (verify-* 스크립트 관례와 동일).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

// RLS는 api_app 롤에 적용되므로, 테스트 본체는 api_app(DATABASE_URL)로 실행한다.
// 단 테스트 유저 시드/정리는 RLS를 우회하는 superuser 연결이 필요한데,
// 이는 .env에 주석으로 보관된 postgres URL을 사용한다(apply-sql-migration.mjs와 동일 관례).
let adminDatabaseUrl = null;

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }
  const envText = fs.readFileSync(envPath, "utf8");
  adminDatabaseUrl = envText.match(/^#\s*DATABASE_URL=(.+)$/m)?.[1]?.trim() ?? null;
  for (const line of envText.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const UPSERT_SQL = `
  INSERT INTO web_push_subscriptions (
    user_id, app, endpoint, p256dh_key, auth_key, expiration_time, user_agent
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
`;

// 요청 컨텍스트(app.user_id / app.roles)를 적용한 트랜잭션 단위 작업 실행.
async function withContext(client, { userId, roles }, fn) {
  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.roles', $2, true)`,
      [userId ?? "", (roles ?? []).join(",")]
    );
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function upsertParams(userId, endpoint) {
  return [userId, "SHOP", endpoint, "p256dh-test-key", "auth-test-key", null, "verify-script"];
}

async function main() {
  if (!adminDatabaseUrl) {
    throw new Error(
      ".env에 주석 형태의 admin DATABASE_URL(postgres 슈퍼유저)이 필요합니다. 테스트 유저 시드/정리에 사용됩니다."
    );
  }

  // api_app: RLS가 적용되는 실제 테스트 대상 연결.
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  // admin: RLS를 우회해 테스트 유저를 시드/정리하는 연결.
  const admin = new Client({
    connectionString: adminDatabaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await admin.connect();

  const endpoint = `https://example.test/push/${randomUUID()}`;
  let userA;
  let userB;
  const failures = [];

  try {
    // 테스트용 유저 2명 생성 (admin/슈퍼유저 컨텍스트, RLS 우회).
    // display_name은 암호화 컬럼(NOT NULL)이라 RLS 검증용 더미 값을 채운다.
    const created = await admin.query(
      `INSERT INTO users (display_name_encrypted, display_name_iv, display_name_auth_tag)
       VALUES ('enc-A', 'iv-A', 'tag-A'), ('enc-B', 'iv-B', 'tag-B')
       RETURNING id`
    );
    userA = created.rows[0].id;
    userB = created.rows[1].id;
    console.log(`테스트 유저 생성: A=${userA} B=${userB}`);

    // 1) 유저 A가 endpoint를 구독.
    await withContext(client, { userId: userA, roles: ["BUYER"] }, () =>
      client.query(UPSERT_SQL, upsertParams(userA, endpoint))
    );
    console.log("✓ 1단계: 유저 A 구독 생성 성공");

    // 2) 유저 B 일반 컨텍스트 upsert → RLS USING 위반(42501) 기대.
    let reproduced = false;
    try {
      await withContext(client, { userId: userB, roles: ["BUYER"] }, () =>
        client.query(UPSERT_SQL, upsertParams(userB, endpoint))
      );
    } catch (error) {
      if (error.code === "42501") {
        reproduced = true;
      } else {
        throw error;
      }
    }
    if (reproduced) {
      console.log("✓ 2단계: 일반 컨텍스트 upsert가 예상대로 RLS(42501)로 차단됨");
    } else {
      failures.push("2단계: 일반 컨텍스트 upsert가 차단되지 않았습니다 (정책 약화 의심).");
      console.error("✗ 2단계: RLS 차단이 발생하지 않음");
    }

    // 3) 유저 B + SYSTEM 롤 → upsert 성공 + 소유권 이전 확인.
    //    확인 SELECT도 RLS 대상이므로 SYSTEM 컨텍스트 안에서 조회한다.
    const owner = await withContext(
      client,
      { userId: userB, roles: ["BUYER", "SYSTEM"] },
      async () => {
        await client.query(UPSERT_SQL, upsertParams(userB, endpoint));
        return client.query(
          `SELECT user_id FROM web_push_subscriptions WHERE endpoint = $1`,
          [endpoint]
        );
      }
    );
    if (owner.rows.length === 1 && owner.rows[0].user_id === userB) {
      console.log("✓ 3단계: SYSTEM 컨텍스트 upsert 성공, endpoint 소유권이 B로 이전됨");
    } else {
      failures.push(
        `3단계: 소유권 이전 실패 (기대 ${userB}, 실제 ${owner.rows[0]?.user_id ?? "없음"}).`
      );
      console.error("✗ 3단계: 소유권 이전 검증 실패");
    }
  } finally {
    // 정리: admin/슈퍼유저 연결에서 테스트 데이터 삭제(users는 ON DELETE CASCADE로 구독도 정리됨).
    if (userA && userB) {
      await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[userA, userB]]);
      console.log("정리 완료: 테스트 유저/구독 삭제");
    }
    await client.end();
    await admin.end();
  }

  if (failures.length > 0) {
    console.error(`\n검증 실패 ${failures.length}건:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\n모든 검증 통과 ✅");
}

main().catch((error) => {
  console.error("스크립트 실행 오류:", error);
  process.exit(1);
});
