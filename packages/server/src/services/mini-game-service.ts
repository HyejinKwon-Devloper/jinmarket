import { randomInt } from "node:crypto"

import {
  query,
  runWithSystemDbContext,
  withTransaction,
  type DbClient,
} from "@jinmarket/db"
import { LUCKY_RPS_TARGET_WINS } from "@jinmarket/shared"
import type {
  GameChoice,
  LuckyFortuneReward,
  LuckyRpsPlayResult,
  LuckyRpsRoundRecord,
  LuckyRpsSessionRecord,
  LuckyRpsStatusResponse,
  LuckyRpsSessionStatus,
} from "@jinmarket/shared"

import { AppError } from "../errors.js"
import { env } from "../env.js"
import { decryptDisplayName, decryptOptionalEmail, type EncryptedDisplayNameColumns, type EncryptedEmailColumns } from "../utils/pii.js"
import { decideRpsResult, randomChoice } from "../utils/rps.js"

import { accountIdentityJoins, accountLoginIdSql } from "./account-sql.js"
import { sendMiniGameGifticonWinnerAlert } from "./mail-service.js"
import { sendPushNotificationToUser } from "./push-service.js"
import { loadUserIdentityMap } from "./user-identity-service.js"

type LuckyRpsSessionRow = {
  id: string
  user_id: string
  status: LuckyRpsSessionStatus
  wins: string | number
  rounds_played: string | number
  reward_code: string | null
  reward_title: string | null
  reward_message: string | null
  reward_is_gifticon: boolean
  completed_at: Date | null
}

type LuckyRpsRoundRow = {
  id: string
  session_id: string
  round_number: string | number
  player_choice: GameChoice
  system_choice: GameChoice
  result: "WIN" | "LOSE" | "DRAW"
  played_at: Date
}

type AlertRecipientRow = EncryptedDisplayNameColumns &
  EncryptedEmailColumns & {
    user_id: string
    login_id: string | null
  }

const fortuneOpeners = [
  "평소보다 가벼운 한 걸음이",
  "망설이던 연락 한 통이",
  "오늘 먼저 건네는 인사가",
  "작게 시작한 메모 하나가",
  "익숙한 루틴에 더한 작은 변화가",
  "천천히 고른 선택 하나가",
  "예상 밖의 우연한 만남이",
  "마음을 눌러 두던 용기가",
  "사소하게 넘기던 취향 하나가",
  "지금 떠오른 아이디어가",
] as const

const fortuneClosers = [
  "예상보다 큰 미소로 돌아옵니다.",
  "좋은 타이밍을 먼저 데려와 줍니다.",
  "오늘의 흐름을 한층 부드럽게 바꿔 줍니다.",
  "원하던 답을 생각보다 빨리 만나게 합니다.",
  "주변의 호감을 자연스럽게 끌어당깁니다.",
  "작은 기회를 더 큰 자신감으로 이어 줍니다.",
  "멈춰 있던 일을 다시 움직이게 만듭니다.",
  "뜻밖의 칭찬과 반가운 반응을 불러옵니다.",
  "손에 잡히는 성과로 이어질 가능성이 큽니다.",
  "오늘 하루를 기억에 남는 장면으로 완성합니다.",
] as const

const GIFTICON_FORTUNE_INDEX = 72

const luckyFortunes: LuckyFortuneReward[] = fortuneOpeners.flatMap(
  (opener, openerIndex) =>
    fortuneClosers.map((closer, closerIndex) => {
      const index = openerIndex * fortuneClosers.length + closerIndex
      const code = `FORTUNE_${String(index + 1).padStart(3, "0")}`

      if (index === GIFTICON_FORTUNE_INDEX) {
        return {
          code,
          title: "기프티콘 교환권",
          message:
            "오늘의 행운이 특별히 크게 열렸어요. 기프티콘 교환권 당첨! 관리자가 확인 후 별도로 안내드릴게요.",
          isGifticon: true,
        }
      }

      return {
        code,
        title: `오늘의 행운 ${String(index + 1).padStart(3, "0")}`,
        message: `${opener} ${closer}`,
        isGifticon: false,
      }
    }),
)

if (luckyFortunes.length !== 100) {
  throw new Error("Lucky fortune pool must contain exactly 100 items.")
}

function normalizeCount(value: string | number) {
  return typeof value === "number" ? value : Number(value)
}

function pickLuckyFortune() {
  return luckyFortunes[randomInt(luckyFortunes.length)]
}

function normalizeLoginId(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase()
}

function mapRound(row: LuckyRpsRoundRow): LuckyRpsRoundRecord {
  return {
    id: row.id,
    roundNumber: normalizeCount(row.round_number),
    playerChoice: row.player_choice,
    systemChoice: row.system_choice,
    result: row.result,
    playedAt: row.played_at.toISOString(),
  }
}

function mapSession(
  row: LuckyRpsSessionRow,
  rounds: LuckyRpsRoundRecord[],
): LuckyRpsSessionRecord {
  return {
    id: row.id,
    status: row.status,
    wins: normalizeCount(row.wins),
    roundsPlayed: normalizeCount(row.rounds_played),
    targetWins: LUCKY_RPS_TARGET_WINS,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    rounds,
    reward:
      row.reward_code && row.reward_title && row.reward_message
        ? {
            code: row.reward_code,
            title: row.reward_title,
            message: row.reward_message,
            isGifticon: row.reward_is_gifticon,
          }
        : null,
  }
}

function buildPlayMessage(
  session: LuckyRpsSessionRecord,
  latestRound: LuckyRpsRoundRecord,
) {
  if (session.status === "WON") {
    return session.reward?.isGifticon
      ? "3연승 성공! 기프티콘 교환권에 당첨됐어요. 관리자가 확인 후 별도로 안내드릴게요."
      : "3연승 성공! 오늘의 행운 문구를 확인해 보세요."
  }

  if (latestRound.result === "WIN") {
    const remainingWins = session.targetWins - session.wins

    if (remainingWins === 1) {
      return "2연승 달성! 마지막 한 판만 더 이기면 오늘의 행운이 열려요."
    }

    return "첫 승리를 가져왔어요. 남은 두 판도 이어서 승리해 보세요."
  }

  if (latestRound.result === "DRAW") {
    return session.wins > 0
      ? `${session.wins}연승까지 갔지만 비겨서 이번 도전은 종료됐어요. 다시 3연승에 도전해 보세요.`
      : "비겼어요. 이번 도전은 3연승 규칙이라 여기서 종료됐어요. 다시 도전해 보세요."
  }

  return session.wins > 0
    ? `${session.wins}연승에서 멈췄어요. 다시 3연승에 도전해 보세요.`
    : "아쉽지만 첫 판을 넘기지 못했어요. 다시 도전해 보세요."
}

async function loadSessionRounds(
  sessionId: string,
  client: DbClient,
) {
  const result = await client.query<LuckyRpsRoundRow>(
    `
      SELECT
        id,
        session_id,
        round_number,
        player_choice,
        system_choice,
        result,
        played_at
      FROM lucky_rps_rounds
      WHERE session_id = $1
      ORDER BY round_number ASC, played_at ASC
    `,
    [sessionId],
  )

  return result.rows.map(mapRound)
}

async function loadLatestSessionRow(
  userId: string,
): Promise<LuckyRpsSessionRow | null> {
  const result = await query<LuckyRpsSessionRow>(
    `
      SELECT
        id,
        user_id,
        status,
        wins,
        rounds_played,
        reward_code,
        reward_title,
        reward_message,
        reward_is_gifticon,
        completed_at
      FROM lucky_rps_sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId],
  )

  return result.rows[0] ?? null
}

async function loadAlertRecipientByLoginId(loginId: string) {
  const normalizedLoginId = normalizeLoginId(loginId)
  return runWithSystemDbContext(async () => {
    const result = await query<AlertRecipientRow>(
      `
        SELECT
          u.id AS user_id,
          u.display_name_encrypted,
          u.display_name_iv,
          u.display_name_auth_tag,
          u.email_encrypted,
          u.email_iv,
          u.email_auth_tag,
          ${accountLoginIdSql("identity")} AS login_id
        FROM users u
        ${accountIdentityJoins("identity", "u")}
        WHERE LOWER(COALESCE(${accountLoginIdSql("identity")}, '')) = $1
        LIMIT 1
      `,
      [normalizedLoginId],
    )

    const row = result.rows[0]

    if (!row) {
      return null
    }

    return {
      userId: row.user_id,
      displayName: decryptDisplayName(row),
      email: decryptOptionalEmail(row),
      loginId: row.login_id,
    }
  })
}

async function notifyGifticonWinner(session: LuckyRpsSessionRecord, userId: string) {
  if (!session.reward?.isGifticon) {
    return
  }

  const winner = (await loadUserIdentityMap([userId])).get(userId)

  if (!winner) {
    console.warn(`[mini-game-gifticon] winner identity missing userId=${userId}`)
    return
  }

  const alertLoginId = env.MINI_GAME_GIFTICON_ALERT_LOGIN_ID
  const recipient = await loadAlertRecipientByLoginId(alertLoginId)

  if (!recipient) {
    console.warn(
      `[mini-game-gifticon] alert recipient not found loginId=${alertLoginId}`,
    )
    return
  }

  try {
    await sendMiniGameGifticonWinnerAlert({
      email: recipient.email,
      alertLoginId: recipient.loginId,
      winnerDisplayName: winner.displayName,
      winnerLoginId: winner.loginId,
      rewardTitle: session.reward.title,
      rewardMessage: session.reward.message,
      completedAt: session.completedAt ?? new Date().toISOString(),
      sessionId: session.id,
    })
  } catch (error) {
    console.error("[mini-game-gifticon] failed to send email alert", error)
  }

  const winnerLabel =
    winner.loginId && winner.loginId !== winner.displayName
      ? `${winner.loginId} (${winner.displayName})`
      : winner.loginId ?? winner.displayName

  const title = "미니게임 기프티콘 당첨자 발생"
  const body = `${winnerLabel}님이 행운의 가위바위보에서 기프티콘 보상에 당첨됐어요.`
  const notificationBase = {
    userId: recipient.userId,
    title,
    body,
    url: "/products",
    tag: `mini-game-gifticon:${session.id}`,
    requireInteraction: true,
  } as const

  try {
    const shopResult = await runWithSystemDbContext(() =>
      sendPushNotificationToUser({
        ...notificationBase,
        app: "SHOP",
      }),
    )

    if (shopResult.delivered === 0) {
      await runWithSystemDbContext(() =>
        sendPushNotificationToUser({
          ...notificationBase,
          app: "ADMIN",
        }),
      )
    }
  } catch (error) {
    console.error("[mini-game-gifticon] failed to send push alert", error)
  }
}

export async function getLuckyRpsStatus(
  userId: string,
): Promise<LuckyRpsStatusResponse> {
  return runWithSystemDbContext(async () => {
    const latestSession = await loadLatestSessionRow(userId)

    if (!latestSession) {
      return { session: null }
    }

    const sessionResult = await withTransaction(async (client) => {
      const rounds = await loadSessionRounds(latestSession.id, client)
      return mapSession(latestSession, rounds)
    })

    return { session: sessionResult }
  })
}

export async function playLuckyRpsRound(
  userId: string,
  playerChoice: GameChoice,
): Promise<LuckyRpsPlayResult> {
  const result = await runWithSystemDbContext(() =>
    withTransaction(async (client) => {
      let session =
        (
          await client.query<LuckyRpsSessionRow>(
            `
              SELECT
                id,
                user_id,
                status,
                wins,
                rounds_played,
                reward_code,
                reward_title,
                reward_message,
                reward_is_gifticon,
                completed_at
              FROM lucky_rps_sessions
              WHERE user_id = $1
                AND status = 'IN_PROGRESS'
              ORDER BY created_at DESC
              LIMIT 1
              FOR UPDATE
            `,
            [userId],
          )
        ).rows[0] ?? null

      if (!session) {
        session = (
          await client.query<LuckyRpsSessionRow>(
            `
              INSERT INTO lucky_rps_sessions (
                user_id,
                status,
                wins,
                rounds_played
              )
              VALUES ($1, 'IN_PROGRESS', 0, 0)
              RETURNING
                id,
                user_id,
                status,
                wins,
                rounds_played,
                reward_code,
                reward_title,
                reward_message,
                reward_is_gifticon,
                completed_at
            `,
            [userId],
          )
        ).rows[0]
      }

      const roundsPlayed = normalizeCount(session.rounds_played)

      if (roundsPlayed >= LUCKY_RPS_TARGET_WINS) {
        throw new AppError("현재 도전이 이미 종료되었습니다. 새로 다시 시작해 주세요.", 409)
      }

      const systemChoice = randomChoice()
      const roundResult = decideRpsResult(playerChoice, systemChoice)
      const roundNumber = roundsPlayed + 1
      const nextWins =
        normalizeCount(session.wins) + (roundResult === "WIN" ? 1 : 0)
      const nextStatus: LuckyRpsSessionStatus =
        nextWins >= LUCKY_RPS_TARGET_WINS
          ? "WON"
          : roundResult === "WIN"
            ? "IN_PROGRESS"
            : "LOST"
      const reward = nextStatus === "WON" ? pickLuckyFortune() : null

      const latestRound = (
        await client.query<LuckyRpsRoundRow>(
          `
            INSERT INTO lucky_rps_rounds (
              session_id,
              round_number,
              player_choice,
              system_choice,
              result
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
              id,
              session_id,
              round_number,
              player_choice,
              system_choice,
              result,
              played_at
          `,
          [session.id, roundNumber, playerChoice, systemChoice, roundResult],
        )
      ).rows[0]

      const updatedSession = (
        await client.query<LuckyRpsSessionRow>(
          `
            UPDATE lucky_rps_sessions
            SET wins = $2,
                rounds_played = $3,
                status = $4::lucky_rps_session_status,
                reward_code = $5,
                reward_title = $6,
                reward_message = $7,
                reward_is_gifticon = $8,
                completed_at = CASE
                  WHEN $4::lucky_rps_session_status = 'IN_PROGRESS'::lucky_rps_session_status THEN NULL
                  ELSE NOW()
                END,
                updated_at = NOW()
            WHERE id = $1
            RETURNING
              id,
              user_id,
              status,
              wins,
              rounds_played,
              reward_code,
              reward_title,
              reward_message,
              reward_is_gifticon,
              completed_at
          `,
          [
            session.id,
            nextWins,
            roundNumber,
            nextStatus,
            reward?.code ?? null,
            reward?.title ?? null,
            reward?.message ?? null,
            reward?.isGifticon ?? false,
          ],
        )
      ).rows[0]

      const rounds = await loadSessionRounds(session.id, client)
      const mappedSession = mapSession(updatedSession, rounds)
      const mappedLatestRound = mapRound(latestRound)

      return {
        session: mappedSession,
        latestRound: mappedLatestRound,
        message: buildPlayMessage(mappedSession, mappedLatestRound),
      } satisfies LuckyRpsPlayResult
    }),
  )

  if (result.session.reward?.isGifticon) {
    await notifyGifticonWinner(result.session, userId)
  }

  return result
}
